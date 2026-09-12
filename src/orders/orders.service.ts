import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  OrderActorType,
  OrderStatus,
  Prisma,
  PromoCodeType,
} from '../generated/prisma/client';
import type { AppConfig } from '../config/configuration';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CartService } from '../cart/cart.service';
import {
  PAYMENT_PROVIDER,
  type PaymentProvider,
} from '../payments/payment-provider';
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
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly cart: CartService,
    @Inject(PAYMENT_PROVIDER) private readonly payments: PaymentProvider,
    private readonly config: ConfigService<AppConfig, true>,
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

  /**
   * `POST /orders` (§6.5). Deduplicado por `Idempotency-Key` client-origin:
   * - misma key + mismo body → se re-devuelve la respuesta guardada (replay);
   * - misma key + body distinto → `409` sin `insufficientStockSkus`;
   * - key nueva → se procesa y se guarda la respuesta.
   *
   * Valida stock de todas las variantes ANTES de descontar: si falta alguna →
   * `409 { error, insufficientStockSkus }` y no se persiste nada. Con `PAYMENTS_ENABLED=true`
   * crea el PaymentIntent y devuelve `{ order, payment }`; con `false` vacía el carrito al crear
   * y devuelve `{ order }`.
   */
  async create(
    userId: string,
    dto: CreateOrderDto,
    idempotencyKey: string,
  ): Promise<Prisma.JsonObject> {
    const requestHash = this.hashRequest(dto);

    // La fila de idempotencia es el lock: `@@unique([userId, key])`. Se crea vacía y se completa
    // con la respuesta al final; si falla la creación del pedido, se borra para permitir reintento.
    try {
      await this.prisma.idempotencyKey.create({
        data: { userId, key: idempotencyKey, requestHash, response: {} },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        const existing = await this.prisma.idempotencyKey.findUnique({
          where: { userId_key: { userId, key: idempotencyKey } },
        });
        if (!existing || existing.requestHash !== requestHash) {
          throw new ConflictException({
            error: 'Idempotency-Key ya usada con un body distinto',
          });
        }
        if (this.isEmptyJson(existing.response)) {
          throw new ConflictException({
            error: 'Solicitud en curso con esta Idempotency-Key, reintentá',
          });
        }
        return existing.response as Prisma.JsonObject;
      }
      throw err;
    }

    try {
      const order = await this.prisma.$transaction(async (tx) => {
        let total = 0;
        const itemsData: {
          variantId: string;
          quantity: number;
          unitPrice: number;
          categoryId: string;
        }[] = [];
        const insufficientStockSkus: string[] = [];

        // Paso 1: validar todo antes de tocar stock.
        const loaded = await Promise.all(
          dto.items.map((item) =>
            tx.productVariant
              .findUnique({
                where: { id: item.variantId },
                include: { product: true },
              })
              .then((variant) => ({ item, variant })),
          ),
        );
        for (const { item, variant } of loaded) {
          if (!variant) {
            throw new NotFoundException(
              `Variante ${item.variantId} no encontrada`,
            );
          }
          if (variant.stock < item.quantity) {
            insufficientStockSkus.push(variant.sku);
            continue;
          }
          const unitPrice = variant.product.price.toNumber();
          total += unitPrice * item.quantity;
          itemsData.push({
            variantId: variant.id,
            quantity: item.quantity,
            unitPrice,
            categoryId: variant.product.categoryId,
          });
        }
        if (insufficientStockSkus.length > 0) {
          throw new ConflictException({
            error: 'Stock insuficiente',
            insufficientStockSkus,
          });
        }

        // Descuento (plan E2E §A2): valida el código contra `PromoCode` y lo aplica al `total`
        // antes de crear el pedido — ya no es un cálculo exclusivo del cliente (ver schema.prisma).
        const trimmedCode = dto.discountCode?.trim();
        const discount = trimmedCode
          ? await this.applyDiscount(tx, trimmedCode, total, itemsData)
          : null;
        const finalTotal = discount ? total - discount.discountAmount : total;

        // Paso 2: descontar stock y crear el pedido.
        for (const item of itemsData) {
          await tx.productVariant.update({
            where: { id: item.variantId },
            data: { stock: { decrement: item.quantity } },
          });
        }

        return tx.order.create({
          data: {
            userId,
            status: OrderStatus.pending_payment,
            total: finalTotal,
            discountCode: discount?.discountCode ?? null,
            discountAmount: discount?.discountAmount ?? 0,
            shippingCity: dto.shippingCity,
            etaDays: DEFAULT_ETA_DAYS,
            items: {
              create: itemsData.map(({ variantId, quantity, unitPrice }) => ({
                variantId,
                quantity,
                unitPrice,
              })),
            },
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

      const paymentsEnabled = this.config.get('payments.enabled', {
        infer: true,
      });
      let payment:
        | { provider: string; clientSecret: string; publishableKey: string }
        | undefined;

      if (paymentsEnabled) {
        const intent = await this.payments.createIntent({
          amountDecimal: order.total.toNumber(),
          orderId: order.id,
          userId,
          idempotencyKey,
        });
        await this.prisma.order.update({
          where: { id: order.id },
          data: { paymentIntentId: intent.id },
        });
        // El `order` es el snapshot de dentro de la tx (antes del update) — reflejar el id acá
        // para que la respuesta de `POST /orders` no traiga `paymentIntentId: null`.
        order.paymentIntentId = intent.id;
        payment = {
          provider: this.payments.name,
          clientSecret: intent.clientSecret,
          publishableKey: this.payments.publishableKey,
        };
      } else {
        // Ventana M2→M4: sin pago real, el carrito se vacía al crear el pedido.
        await this.cart.clear(userId);
      }

      const response = {
        order,
        ...(payment ? { payment } : {}),
      } as unknown as Prisma.JsonObject;

      await this.prisma.idempotencyKey.update({
        where: { userId_key: { userId, key: idempotencyKey } },
        data: { response },
      });

      return response;
    } catch (err) {
      // El pedido no se persistió (o quedó a medias): liberar la key para que el cliente reintente.
      await this.prisma.idempotencyKey
        .delete({ where: { userId_key: { userId, key: idempotencyKey } } })
        .catch(() => undefined);
      throw err;
    }
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

  /**
   * Transición `pending_payment -> paid` disparada por el sistema: webhook de Stripe
   * (`payment_intent.succeeded`), `POST /orders/:id/confirm` (demo) o cualquier otra vía server.
   * Idempotente: si el pedido ya no está en `pending_payment` no hace nada. Vacía el carrito del
   * comprador y dispara la notificación. `e2eRunId` se estampa en `meta` si vino en la request.
   */
  async markPaidBySystem(
    orderId: string,
    opts: { e2eRunId?: string } = {},
  ): Promise<{ changed: boolean }> {
    const updated = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!order) {
        throw new NotFoundException('Pedido no encontrado');
      }
      if (order.status !== OrderStatus.pending_payment) {
        return null;
      }
      return tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.paid,
          statusHistory: {
            create: {
              status: OrderStatus.paid,
              actorType: OrderActorType.system,
              meta: opts.e2eRunId ? { e2eRunId: opts.e2eRunId } : undefined,
            },
          },
        },
      });
    });

    if (!updated) {
      return { changed: false };
    }

    await this.cart.clear(updated.userId).catch((err) => {
      this.logger.warn(
        `No se pudo vaciar el carrito de ${updated.userId} tras el pago: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    });
    await this.notifications.emitOrderStatusChanged({
      userId: updated.userId,
      orderId: updated.id,
      fromStatus: OrderStatus.pending_payment,
      toStatus: OrderStatus.paid,
    });
    return { changed: true };
  }

  /**
   * `POST /orders/:id/confirm` — marca `paid` sin verificar el cobro contra el proveedor.
   * Sólo disponible si el proveedor lo permite (`bypass` siempre; `stripe` con `STRIPE_DEMO_CONFIRM`);
   * si no → `404`. Valida ownership (mismo 404 que `findOne`) y delega en `markPaidBySystem`.
   */
  async confirmDemo(userId: string, id: string, e2eRunId?: string) {
    if (!this.payments.allowsUnverifiedConfirm) {
      throw new NotFoundException('Pedido no encontrado');
    }
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order || order.userId !== userId) {
      throw new NotFoundException('Pedido no encontrado');
    }
    if (order.status === OrderStatus.paid) {
      return this.findOne(userId, id); // idempotente: ya confirmado
    }
    if (order.status !== OrderStatus.pending_payment) {
      throw new ConflictException({
        error: `No se puede confirmar un pedido en estado ${order.status}`,
        allowedTransitions: ALLOWED_TRANSITIONS[order.status],
      });
    }
    await this.markPaidBySystem(id, { e2eRunId });
    return this.findOne(userId, id);
  }

  /**
   * Barrido de pedidos `pending_payment` vencidos (`ORDER_PAYMENT_TTL_MIN`, §6.5): pasan a
   * `cancelled`, reponen stock y notifican al comprador. Lo llama un cron; devuelve cuántos cerró.
   */
  async expirePendingPayments(): Promise<number> {
    const ttlMin = this.config.get('payments.orderPaymentTtlMin', {
      infer: true,
    });
    const cutoff = new Date(Date.now() - ttlMin * 60_000);
    const stale = await this.prisma.order.findMany({
      where: { status: OrderStatus.pending_payment, createdAt: { lt: cutoff } },
      include: { items: true },
    });

    for (const order of stale) {
      try {
        await this.prisma.$transaction(async (tx) => {
          const fresh = await tx.order.findUnique({ where: { id: order.id } });
          if (!fresh || fresh.status !== OrderStatus.pending_payment) {
            return;
          }
          await this.restock(tx, order.items);
          await tx.order.update({
            where: { id: order.id },
            data: {
              status: OrderStatus.cancelled,
              statusHistory: {
                create: {
                  status: OrderStatus.cancelled,
                  actorType: OrderActorType.system,
                  note: 'Pago no confirmado dentro del plazo',
                },
              },
            },
          });
        });
        await this.notifications.emitOrderStatusChanged({
          userId: order.userId,
          orderId: order.id,
          fromStatus: OrderStatus.pending_payment,
          toStatus: OrderStatus.cancelled,
        });
      } catch (err) {
        this.logger.warn(
          `No se pudo expirar el pedido ${order.id}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
    return stale.length;
  }

  /**
   * Valida `code` contra `PromoCode` (mismo criterio 404 que `PromoCodesService.validate`:
   * "no existe" y "fuera de vigencia" son indistinguibles) y calcula el descuento a restar del
   * `total`. `minPurchase` se chequea contra el subtotal completo del pedido; si `appliesToCategory`
   * está seteado, el descuento (tanto `percentage` como `fixed_amount`) solo corre sobre la porción
   * del subtotal de ítems de esa categoría — nunca deja el pedido en negativo.
   */
  private async applyDiscount(
    tx: Prisma.TransactionClient,
    code: string,
    subtotal: number,
    items: { unitPrice: number; quantity: number; categoryId: string }[],
  ): Promise<{ discountCode: string; discountAmount: number }> {
    const normalized = code.toUpperCase();
    const promo = await tx.promoCode.findUnique({
      where: { code: normalized },
    });
    const now = new Date();
    if (!promo || now < promo.validFrom || now > promo.validUntil) {
      throw new NotFoundException('Código de descuento inválido o expirado');
    }

    const minPurchase = promo.minPurchase.toNumber();
    if (subtotal < minPurchase) {
      throw new ConflictException({
        error: 'El subtotal no alcanza el mínimo de compra del código de descuento',
        minPurchase: minPurchase.toFixed(2),
      });
    }

    const eligibleSubtotal = promo.appliesToCategory
      ? items
          .filter((i) => i.categoryId === promo.appliesToCategory)
          .reduce((sum, i) => sum + i.unitPrice * i.quantity, 0)
      : subtotal;

    const rawDiscount =
      promo.type === PromoCodeType.percentage
        ? eligibleSubtotal * (promo.value.toNumber() / 100)
        : promo.value.toNumber();
    const discountAmount =
      Math.round(Math.min(rawDiscount, eligibleSubtotal) * 100) / 100;

    return { discountCode: promo.code, discountAmount };
  }

  // ---------------------------------------------------------------------------
  private hashRequest(dto: CreateOrderDto): string {
    const normalized = {
      shippingCity: dto.shippingCity.trim(),
      discountCode: dto.discountCode?.trim().toUpperCase() ?? null,
      items: [...dto.items]
        .map((i) => ({ variantId: i.variantId, quantity: i.quantity }))
        .sort((a, b) => a.variantId.localeCompare(b.variantId)),
    };
    return createHash('sha256')
      .update(JSON.stringify(normalized))
      .digest('hex');
  }

  private isEmptyJson(value: Prisma.JsonValue): boolean {
    return (
      value != null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.keys(value).length === 0
    );
  }

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
