import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  NotificationType,
  OrderStatus,
  Prisma,
  StockAlertType,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type NotificationRow = Prisma.NotificationGetPayload<{
  include: { product: true };
}>;

/**
 * Entrega de notificaciones (plan E2E §6.4). Separa *suscripción* (`StockAlert`, sin cambios de
 * contrato: `POST /products/:id/alerts`) de *entrega* (`Notification`, una fila por evento).
 * Los `emit*` nunca lanzan: un fallo de notificación no debe tumbar la transición de pedido ni la
 * edición de catálogo que la dispara.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------------
  // Suscripción (StockAlert) — contrato intacto
  // ---------------------------------------------------------------------------
  async createAlert(userId: string, productId: string, type: StockAlertType) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });
    if (!product) {
      throw new NotFoundException('Producto no encontrado');
    }

    return this.prisma.stockAlert.create({ data: { userId, productId, type } });
  }

  // ---------------------------------------------------------------------------
  // Entrega (Notification)
  // ---------------------------------------------------------------------------
  async findAllForUser(userId: string) {
    const rows = await this.prisma.notification.findMany({
      where: { userId },
      include: { product: true },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => this.toWire(row));
  }

  async markRead(userId: string, id: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id },
    });
    if (!notification || notification.userId !== userId) {
      throw new NotFoundException('Notificación no encontrada');
    }

    const updated = await this.prisma.notification.update({
      where: { id },
      data: { readAt: notification.readAt ?? new Date() },
      include: { product: true },
    });
    return this.toWire(updated);
  }

  async markAllRead(userId: string) {
    const { count } = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { count };
  }

  // ---------------------------------------------------------------------------
  // Triggers (§B5)
  // ---------------------------------------------------------------------------
  /** Cambio de estado de un pedido. Se llama después de commitear la transición. */
  async emitOrderStatusChanged(params: {
    userId: string;
    orderId: string;
    fromStatus: OrderStatus;
    toStatus: OrderStatus;
    trackingNumber?: string | null;
    carrier?: string | null;
  }): Promise<void> {
    const { userId, orderId, fromStatus, toStatus, trackingNumber, carrier } =
      params;
    try {
      await this.prisma.notification.create({
        data: {
          userId,
          type: NotificationType.order_status_changed,
          title: 'Actualización de tu pedido',
          body: `Tu pedido pasó a "${toStatus}".`,
          orderId,
          data: {
            fromStatus,
            toStatus,
            ...(trackingNumber ? { trackingNumber } : {}),
            ...(carrier ? { carrier } : {}),
          },
        },
      });
    } catch (err) {
      this.warn('order_status_changed', orderId, err);
    }
  }

  /** Stock de una variante que pasó de 0 a >0. Notifica a los suscriptos `back_in_stock`. */
  async emitBackInStock(productId: string, sku: string): Promise<void> {
    try {
      const subs = await this.prisma.stockAlert.findMany({
        where: {
          productId,
          type: StockAlertType.back_in_stock,
          notified: false,
        },
      });
      if (subs.length === 0) {
        return;
      }
      const product = await this.prisma.product.findUnique({
        where: { id: productId },
      });
      await this.prisma.$transaction([
        this.prisma.notification.createMany({
          data: subs.map((sub) => ({
            userId: sub.userId,
            type: NotificationType.back_in_stock,
            title: 'Volvió a haber stock',
            body: `${product?.name ?? 'Un producto'} que seguías volvió a estar disponible.`,
            productId,
            data: { sku },
          })),
        }),
        this.prisma.stockAlert.updateMany({
          where: { id: { in: subs.map((sub) => sub.id) } },
          data: { notified: true },
        }),
      ]);
    } catch (err) {
      this.warn('back_in_stock', productId, err);
    }
  }

  /** Baja de precio de un producto. Notifica a los suscriptos `price_drop`. */
  async emitPriceDrop(
    productId: string,
    oldPrice: number,
    newPrice: number,
  ): Promise<void> {
    try {
      const subs = await this.prisma.stockAlert.findMany({
        where: {
          productId,
          type: StockAlertType.price_drop,
          notified: false,
        },
      });
      if (subs.length === 0) {
        return;
      }
      const product = await this.prisma.product.findUnique({
        where: { id: productId },
      });
      await this.prisma.$transaction([
        this.prisma.notification.createMany({
          data: subs.map((sub) => ({
            userId: sub.userId,
            type: NotificationType.price_drop,
            title: 'Bajó de precio',
            body: `${product?.name ?? 'Un producto'} que seguías bajó de precio.`,
            productId,
            data: { oldPrice, newPrice },
          })),
        }),
        this.prisma.stockAlert.updateMany({
          where: { id: { in: subs.map((sub) => sub.id) } },
          data: { notified: true },
        }),
      ]);
    } catch (err) {
      this.warn('price_drop', productId, err);
    }
  }

  // ---------------------------------------------------------------------------
  private toWire(n: NotificationRow) {
    const isProductKind =
      n.type === NotificationType.back_in_stock ||
      n.type === NotificationType.price_drop;
    const deepLink = n.orderId
      ? { type: 'order' as const, id: n.orderId }
      : n.productId
        ? { type: 'product' as const, id: n.productId }
        : null;
    const read = n.readAt !== null;
    return {
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      read,
      // Espejo back-compat del flag viejo (`StockAlert.notified`) durante la transición — ver
      // CLAUDE.md. Clientes nuevos leen `read`.
      notified: read,
      createdAt: n.createdAt,
      deepLink,
      data: (n.data as Record<string, unknown> | null) ?? {},
      product: isProductKind ? n.product : null,
    };
  }

  private warn(kind: string, entityId: string, err: unknown): void {
    this.logger.warn(
      `No se pudo emitir la notificación ${kind} para ${entityId}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}
