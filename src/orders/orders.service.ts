import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AdminOrdersQueryDto } from './dto/admin-orders-query.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';

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
const ORDER_STAGES: OrderStatus[] = [
  OrderStatus.pending_payment,
  OrderStatus.processing,
  OrderStatus.shipped,
  OrderStatus.delivered,
];

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  findAllForUser(userId: string) {
    return this.prisma.order.findMany({
      where: { userId },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(userId: string, id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        items: { include: { variant: { include: { product: true } } } },
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
        },
        include: { items: true },
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
        user: { select: SAFE_USER_SELECT },
      },
    });
    if (!order) {
      throw new NotFoundException('Pedido no encontrado');
    }
    return { ...order, timeline: this.buildTimeline(order) };
  }

  /** Solo permite avanzar de estado (nunca retroceder); tracking se puede setear independientemente. */
  async updateStatus(id: string, dto: UpdateOrderStatusDto) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id } });
      if (!order) {
        throw new NotFoundException('Pedido no encontrado');
      }

      if (dto.status) {
        const currentIndex = ORDER_STAGES.indexOf(order.status);
        const nextIndex = ORDER_STAGES.indexOf(dto.status);
        if (nextIndex < currentIndex) {
          throw new BadRequestException(
            `No se puede retroceder el estado de ${order.status} a ${dto.status}`,
          );
        }
      }

      const updated = await tx.order.update({
        where: { id },
        data: {
          ...(dto.status ? { status: dto.status } : {}),
          ...(dto.trackingNumber !== undefined
            ? { trackingNumber: dto.trackingNumber }
            : {}),
          ...(dto.trackingCarrier !== undefined
            ? { trackingCarrier: dto.trackingCarrier }
            : {}),
        },
        include: { items: true, user: { select: SAFE_USER_SELECT } },
      });

      return { ...updated, timeline: this.buildTimeline(updated) };
    });
  }

  /**
   * No hay tabla de historial de estados en el modelo (docs/plan-marketplace-backend.md §4) — el
   * timeline se infiere de `status` + `createdAt`/`updatedAt`, no persiste cada transición.
   */
  private buildTimeline(order: {
    status: OrderStatus;
    createdAt: Date;
    updatedAt: Date;
  }) {
    const currentIndex = ORDER_STAGES.indexOf(order.status);
    return ORDER_STAGES.slice(0, currentIndex + 1).map((stage, index) => ({
      status: stage,
      at: index === 0 ? order.createdAt : order.updatedAt,
    }));
  }
}
