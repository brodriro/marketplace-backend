import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { MergeCartLineDto } from './dto/merge-cart.dto';

export interface CartItemView {
  variantId: string;
  sku: string;
  productId: string;
  name: string;
  color: string;
  image: string | null;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
}

export interface CartView {
  items: CartItemView[];
  itemCount: number;
  subtotal: string;
}

type VariantWithProduct = Prisma.ProductVariantGetPayload<{
  include: { product: true };
}>;

const cartInclude = {
  items: {
    // Se omiten las líneas cuya variante/producto quedó soft-deleted (`visible:false`): el cliente
    // nunca ve un ítem "fantasma" que además `POST /orders` rechazaría. La fila queda en la DB.
    where: { variant: { visible: true, product: { visible: true } } },
    include: { variant: { include: { product: true } } },
    orderBy: { addedAt: 'asc' },
  },
} satisfies Prisma.CartInclude;

@Injectable()
export class CartService {
  constructor(private readonly prisma: PrismaService) {}

  async getCart(userId: string): Promise<CartView> {
    const cart = await this.prisma.cart.findUnique({
      where: { userId },
      include: cartInclude,
    });
    return this.toView(cart?.items ?? []);
  }

  /**
   * `Idempotency-Key` opcional (a diferencia de `POST /orders`, acá no es obligatoria — carrito no
   * es una operación de una sola vez). Sin key: comportamiento de siempre (increment). Con key:
   * mismo lock-y-replay que `OrdersService.create` sobre la tabla `IdempotencyKey` — un retry con
   * la misma key + mismo body devuelve la respuesta guardada en vez de sumar cantidad de nuevo.
   */
  async addItem(
    userId: string,
    dto: AddCartItemDto,
    idempotencyKey?: string,
  ): Promise<CartView> {
    if (!idempotencyKey) {
      return this.addItemUnchecked(userId, dto);
    }

    const requestHash = this.hashAddItemRequest(dto);
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
        return existing.response as unknown as CartView;
      }
      throw err;
    }

    try {
      const view = await this.addItemUnchecked(userId, dto);
      await this.prisma.idempotencyKey.update({
        where: { userId_key: { userId, key: idempotencyKey } },
        data: { response: view as unknown as Prisma.JsonObject },
      });
      return view;
    } catch (err) {
      await this.prisma.idempotencyKey
        .delete({ where: { userId_key: { userId, key: idempotencyKey } } })
        .catch(() => undefined);
      throw err;
    }
  }

  private async addItemUnchecked(
    userId: string,
    dto: AddCartItemDto,
  ): Promise<CartView> {
    const variant = await this.resolveVariant(dto);
    const cart = await this.ensureCart(userId);

    await this.prisma.cartItem.upsert({
      where: { cartId_variantId: { cartId: cart.id, variantId: variant.id } },
      create: {
        cartId: cart.id,
        variantId: variant.id,
        quantity: dto.quantity,
      },
      update: { quantity: { increment: dto.quantity } },
    });

    return this.getCart(userId);
  }

  async updateItem(
    userId: string,
    variantId: string,
    quantity: number,
  ): Promise<CartView> {
    const cart = await this.prisma.cart.findUnique({ where: { userId } });
    const existing = cart
      ? await this.prisma.cartItem.findUnique({
          where: { cartId_variantId: { cartId: cart.id, variantId } },
        })
      : null;
    if (!existing) {
      throw new NotFoundException('La variante no está en el carrito');
    }

    if (quantity === 0) {
      await this.prisma.cartItem.delete({ where: { id: existing.id } });
    } else {
      await this.prisma.cartItem.update({
        where: { id: existing.id },
        data: { quantity },
      });
    }

    return this.getCart(userId);
  }

  async removeItem(userId: string, variantId: string): Promise<CartView> {
    const cart = await this.prisma.cart.findUnique({ where: { userId } });
    if (cart) {
      await this.prisma.cartItem.deleteMany({
        where: { cartId: cart.id, variantId },
      });
    }
    return this.getCart(userId);
  }

  async clear(userId: string): Promise<CartView> {
    const cart = await this.prisma.cart.findUnique({ where: { userId } });
    if (cart) {
      await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    }
    return this.toView([]);
  }

  /** Unión de líneas; para cada variante `quantity = max(local, server)`. Idempotente. */
  async merge(userId: string, lines: MergeCartLineDto[]): Promise<CartView> {
    const resolved = await Promise.all(
      lines.map(async (line) => ({
        variantId: (await this.resolveVariant(line)).id,
        quantity: line.quantity,
      })),
    );
    const cart = await this.ensureCart(userId);

    await this.prisma.$transaction(async (tx) => {
      for (const { variantId, quantity } of resolved) {
        const existing = await tx.cartItem.findUnique({
          where: { cartId_variantId: { cartId: cart.id, variantId } },
        });
        const nextQuantity = Math.max(quantity, existing?.quantity ?? 0);
        await tx.cartItem.upsert({
          where: { cartId_variantId: { cartId: cart.id, variantId } },
          create: { cartId: cart.id, variantId, quantity: nextQuantity },
          update: { quantity: nextQuantity },
        });
      }
    });

    return this.getCart(userId);
  }

  private async ensureCart(userId: string): Promise<{ id: string }> {
    return this.prisma.cart.upsert({
      where: { userId },
      create: { userId },
      update: {},
      select: { id: true },
    });
  }

  private async resolveVariant(input: {
    variantId?: string;
    sku?: string;
  }): Promise<VariantWithProduct> {
    if (!input.variantId === !input.sku) {
      throw new BadRequestException(
        'Enviá exactamente uno de `variantId` o `sku`',
      );
    }
    const variant = await this.prisma.productVariant.findFirst({
      where: input.variantId
        ? { id: input.variantId, visible: true }
        : { sku: input.sku, visible: true },
      include: { product: true },
    });
    if (!variant) {
      throw new NotFoundException('Variante no encontrada');
    }
    return variant;
  }

  private toView(
    items: Prisma.CartItemGetPayload<{
      include: { variant: { include: { product: true } } };
    }>[],
  ): CartView {
    let subtotal = new Prisma.Decimal(0);
    let itemCount = 0;

    const views: CartItemView[] = items.map((item) => {
      const unitPrice = item.variant.product.price;
      const lineTotal = unitPrice.mul(item.quantity);
      subtotal = subtotal.plus(lineTotal);
      itemCount += item.quantity;

      return {
        variantId: item.variantId,
        sku: item.variant.sku,
        productId: item.variant.productId,
        name: item.variant.product.name,
        color: item.variant.color,
        image: item.variant.product.image,
        quantity: item.quantity,
        unitPrice: unitPrice.toFixed(2),
        lineTotal: lineTotal.toFixed(2),
      };
    });

    return { items: views, itemCount, subtotal: subtotal.toFixed(2) };
  }

  private hashAddItemRequest(dto: AddCartItemDto): string {
    const normalized = {
      variantId: dto.variantId ?? null,
      sku: dto.sku?.trim() ?? null,
      quantity: dto.quantity,
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
}
