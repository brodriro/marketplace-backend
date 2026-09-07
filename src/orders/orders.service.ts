import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  OrderActorType,
  OrderStatus,
  Prisma,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AdminOrdersQueryDto } from './dto/admin-orders-query.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import {
  ALLOWED_TRANSITIONS,
  RESTOCKING_STATUSES,
  canTransition,
} from './order-transitions';

const DEFAULT_ETA_DAYS = 5;
/** Nunca incluir `passwordHash` en respuestas admin que traen el `user` de un pedido. */
const SAFE_USER_SELECT = {
  id: true,
  email: true,
  name: true,
  avatarUrl: true,
  role: true,
  active: true,
} as const;

/** Historial ordenado cronológicamente — de acá sale el `timeline` de `GET /orders/:id` (§6.3). */
const STATUS_HISTORY_ASC = {
  orderBy: { createdAt: 'asc' },
} as const;

type OrderWithHistory = {
  statusHistory: {
    status: OrderStatus;
    actorType: OrderActorType;
    createdAt: Date;
  }[];
};

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  findAllForUser(userId: string) {
    return this.prisma.order.findMany({
      where: { userId },
      // `variant` acotado a `color`/`sku` — suficiente para pintar el line item en la lista
      // de pedidos sin arrastrar el `product` completo (eso queda para `GET /orders/:id`).
      include: {
        items: { include: { variant: { select: { color: true, sku: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(userId: string, id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        items: { include: { variant: { include: { product: true } } } },
        statusHistory: STATUS_HISTORY_ASC,
      },
    });
    if (!order || order.userId !== userId) {
      throw new NotFoundException('Pedido no encontrado');
    }

    return { ...order, timeline: this.buildTimeline(order) };
  }

  /** Descuenta stock y crea la orden en una única transacción — si algún ítem no alcanza stock, no se persiste nada (§6.3 del plan). */
  create(userId: string, dto: CreateOrderDto) {
    return this.prisma.$transaction(async (tx) => {
      let total = 0;
      const itemsData: {
        variantId: string;
        quantity: number;
        unitPrice: number;
      }[] = [];

      for (const item of dto.items) {
        const variant = await tx.productVariant.findUnique({
          where: { id: item.variantId },
          include: { product: true },
        });
        if (!variant) {
          throw new NotFoundException(
            `Variante ${item.variantId} no encontrada`,
          );
        }
        if (variant.stock < item.quantity) {
          throw new BadRequestException(
            `Stock insuficiente para ${variant.sku}`,
          );
        }

        await tx.productVariant.update({
          where: { id: variant.id },
          data: { stock: { decrement: item.quantity } },
        });

        const unitPrice = variant.product.price.toNumber();
        total += unitPrice * item.quantity;
        itemsData.push({
          variantId: variant.id,
          quantity: item.quantity,
          unitPrice,
        });
      }

      return tx.order.create({
        data: {
          userId,
          status: OrderStatus.pending_payment,
          total,
          shippingCity: dto.shippingCity,
          etaDays: DEFAULT_ETA_DAYS,
          items: { create: itemsData },
          // Fila génesis del historial: la creación del pedido es el primer evento del timeline.
          statusHistory: {
            create: {
              status: OrderStatus.pending_payment,
              actorType: OrderActorType.buyer,
              actorId: userId,
            },
          },
        },
        include: {
          items: {
            include: { variant: { select: { color: true, sku: true } } },
          },
        },
      });
    });
  }

  /** Todos los pedidos, de todos los usuarios — solo para uso admin. */
  async findAllAdmin(query: AdminOrdersQueryDto) {
    const { page, pageSize, status } = query;
    const where = status ? { status } : {};
    const [orders, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        include: { items: true, user: { select: SAFE_USER_SELECT } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.order.count({ where }),
    ]);
    return { data: orders, page, pageSize, total };
  }

  /** A diferencia de `findOne`, no valida ownership — admin puede ver cualquier pedido. */
  async findOneAdmin(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        items: { include: { variant: { include: { product: true } } } },
        statusHistory: STATUS_HISTORY_ASC,
        user: { select: SAFE_USER_SELECT },
      },
    });
    if (!order) {
      throw new NotFoundException('Pedido no encontrado');
    }
    return { ...order, timeline: this.buildTimeline(order) };
  }

  /**
   * Transición de estado por admin (`PATCH /admin/orders/:id/status`). Valida contra la matriz
   * §6.3, exige `trackingNumber`+`trackingCarrier` para `-> shipped` y `reason` para `-> refunded`,
   * repone stock en `cancelled`, escribe la fila de historial y dispara la notificación.
   * Si `dto.status` viene vacío es una actualización de tracking sola (sin transición ni historial).
   */
  async updateStatus(id: string, dto: UpdateOrderStatusDto, adminId?: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id },
        include: { items: true },
      });
      if (!order) {
        throw new NotFoundException('Pedido no encontrado');
      }

      // --- Sin cambio de estado: solo tracking ---
      if (!dto.status || dto.status === order.status) {
        const updated = await tx.order.update({
          where: { id },
          data: this.trackingPatch(dto),
          include: {
            items: true,
            statusHistory: STATUS_HISTORY_ASC,
            user: { select: SAFE_USER_SELECT },
          },
        });
        return { updated, transitioned: false as const };
      }

      const from = order.status;
      const to = dto.status;
      if (!canTransition(from, to)) {
        throw new ConflictException({
          error: `Transición inválida: ${from} -> ${to}`,
          allowedTransitions: ALLOWED_TRANSITIONS[from],
        });
      }

      const trackingNumber = dto.trackingNumber ?? order.trackingNumber;
      const trackingCarrier = dto.trackingCarrier ?? order.trackingCarrier;
      if (to === OrderStatus.shipped && (!trackingNumber || !trackingCarrier)) {
        throw new BadRequestException(
          'trackingNumber y trackingCarrier son obligatorios para pasar a shipped',
        );
      }
      if (to === OrderStatus.refunded && !dto.reason) {
        throw new BadRequestException('reason es obligatorio para reembolsar');
      }

      if (RESTOCKING_STATUSES.has(to)) {
        await this.restock(tx, order.items);
      }

      const updated = await tx.order.update({
        where: { id },
        data: {
          status: to,
          ...this.trackingPatch(dto),
          statusHistory: {
            create: {
              status: to,
              actorType: OrderActorType.admin,
              actorId: adminId ?? null,
              note: dto.reason ?? null,
            },
          },
        },
        include: {
          items: true,
          statusHistory: STATUS_HISTORY_ASC,
          user: { select: SAFE_USER_SELECT },
        },
      });
      return {
        updated,
        transitioned: true as const,
        from,
        to,
        trackingNumber,
        trackingCarrier,
      };
    });

    if (result.transitioned) {
      await this.notifications.emitOrderStatusChanged({
        userId: result.updated.userId,
        orderId: result.updated.id,
        fromStatus: result.from,
        toStatus: result.to,
        trackingNumber: result.trackingNumber,
        carrier: result.trackingCarrier,
      });
    }

    return { ...result.updated, timeline: this.buildTimeline(result.updated) };
  }

  /**
   * Cancelación por el comprador (`POST /orders/:id/cancel`). Solo desde `pending_payment` (§6.3);
   * cualquier otro estado -> `409` con `allowedTransitions`. "No existe" y "no es tuyo" -> mismo 404.
   */
  async cancelByBuyer(userId: string, id: string, reason?: string) {
    const updated = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id },
        include: { items: true },
      });
      if (!order || order.userId !== userId) {
        throw new NotFoundException('Pedido no encontrado');
      }
      if (order.status !== OrderStatus.pending_payment) {
        throw new ConflictException({
          error: `No se puede cancelar un pedido en estado ${order.status}`,
          allowedTransitions: ALLOWED_TRANSITIONS[order.status],
        });
      }

      await this.restock(tx, order.items);

      return tx.order.update({
        where: { id },
        data: {
          status: OrderStatus.cancelled,
          statusHistory: {
            create: {
              status: OrderStatus.cancelled,
              actorType: OrderActorType.buyer,
              actorId: userId,
              note: reason ?? null,
            },
          },
        },
        include: {
          items: { include: { variant: { include: { product: true } } } },
          statusHistory: STATUS_HISTORY_ASC,
        },
      });
    });

    await this.notifications.emitOrderStatusChanged({
      userId,
      orderId: updated.id,
      fromStatus: OrderStatus.pending_payment,
      toStatus: OrderStatus.cancelled,
    });

    return { ...updated, timeline: this.buildTimeline(updated) };
  }

  // ---------------------------------------------------------------------------
  private trackingPatch(dto: UpdateOrderStatusDto) {
    return {
      ...(dto.trackingNumber !== undefined
        ? { trackingNumber: dto.trackingNumber }
        : {}),
      ...(dto.trackingCarrier !== undefined
        ? { trackingCarrier: dto.trackingCarrier }
        : {}),
    };
  }

  private async restock(
    tx: Prisma.TransactionClient,
    items: { variantId: string; quantity: number }[],
  ) {
    for (const item of items) {
      await tx.productVariant.update({
        where: { id: item.variantId },
        data: { stock: { increment: item.quantity } },
      });
    }
  }

  /** `timeline` = historial real ordenado por fecha (§6.3). `actorType` es opcional en el wire. */
  private buildTimeline(order: OrderWithHistory) {
    return order.statusHistory.map((row) => ({
      status: row.status,
      at: row.createdAt,
      actorType: row.actorType,
    }));
  }
}
