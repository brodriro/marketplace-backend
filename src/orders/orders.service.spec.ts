import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CartService } from '../cart/cart.service';
import { PAYMENT_PROVIDER } from '../payments/payment-provider';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';

const P2002 = new Prisma.PrismaClientKnownRequestError('unique', {
  code: 'P2002',
  clientVersion: 'test',
});

type Tx = {
  productVariant: { findUnique: jest.Mock; update: jest.Mock };
  order: { create: jest.Mock };
  promoCode: { findUnique: jest.Mock };
};

describe('OrdersService.create — idempotencia + stock (§6.5)', () => {
  let service: OrdersService;
  let prisma: {
    $transaction: jest.Mock;
    idempotencyKey: {
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    order: { update: jest.Mock };
  };
  let cartClear: jest.Mock;
  let tx: Tx;

  const dto = (over: Partial<CreateOrderDto> = {}): CreateOrderDto => ({
    shippingCity: 'CABA',
    items: [
      { variantId: 'v-b', quantity: 1 },
      { variantId: 'v-a', quantity: 2 },
    ],
    ...over,
  });

  const variant = (
    id: string,
    stock: number,
    price = 10,
    categoryId = 'cat-1',
  ) => ({
    id,
    sku: `sku-${id}`,
    stock,
    product: { price: new Prisma.Decimal(price), categoryId },
  });

  beforeEach(async () => {
    tx = {
      productVariant: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      order: {
        create: jest
          .fn()
          .mockResolvedValue({ id: 'o1', total: new Prisma.Decimal(40) }),
      },
      promoCode: { findUnique: jest.fn() },
    };
    cartClear = jest.fn().mockResolvedValue({});
    prisma = {
      $transaction: jest.fn((fn: (t: Tx) => unknown) => fn(tx)),
      idempotencyKey: {
        create: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({}),
      },
      order: { update: jest.fn().mockResolvedValue({}) },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: {} },
        { provide: CartService, useValue: { clear: cartClear } },
        {
          provide: PAYMENT_PROVIDER,
          useValue: {
            name: 'bypass',
            publishableKey: '',
            allowsUnverifiedConfirm: true,
            createIntent: jest
              .fn()
              .mockResolvedValue({ id: 'pi_1', clientSecret: 'sec_1' }),
          },
        },
        {
          // `payments.enabled` false → no se crea intento; el test cubre idempotencia/stock.
          provide: ConfigService,
          useValue: { get: () => false },
        },
      ],
    }).compile();
    service = moduleRef.get(OrdersService);
  });

  it('key nueva: crea el pedido, vacía el carrito (PAYMENTS_ENABLED=false) y guarda la respuesta', async () => {
    tx.productVariant.findUnique
      .mockResolvedValueOnce(variant('v-b', 5))
      .mockResolvedValueOnce(variant('v-a', 5));

    const res = (await service.create('u1', dto(), 'key-1')) as {
      order: unknown;
      payment?: unknown;
    };

    expect(res.order).toBeDefined();
    expect(res.payment).toBeUndefined();
    expect(cartClear).toHaveBeenCalledWith('u1');
    expect(prisma.idempotencyKey.update).toHaveBeenCalled();
  });

  it('replay: misma key + mismo body (ítems en otro orden) re-devuelve la respuesta guardada', async () => {
    const saved = { order: { id: 'o-prev' } };
    const reordered = dto({
      items: [
        { variantId: 'v-a', quantity: 2 },
        { variantId: 'v-b', quantity: 1 },
      ],
    });
    const svc = service as unknown as {
      hashRequest(d: CreateOrderDto): string;
    };

    prisma.idempotencyKey.create.mockRejectedValueOnce(P2002);
    prisma.idempotencyKey.findUnique.mockResolvedValueOnce({
      // el hash es independiente del orden de los ítems → el reintento reordenado matchea
      requestHash: svc.hashRequest(dto()),
      response: saved,
    });

    const res = await service.create('u1', reordered, 'key-1');
    expect(res).toBe(saved);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('conflicto: misma key + body distinto → 409 sin insufficientStockSkus', async () => {
    prisma.idempotencyKey.create.mockRejectedValueOnce(P2002);
    prisma.idempotencyKey.findUnique.mockResolvedValueOnce({
      requestHash: 'otro-hash',
      response: { order: {} },
    });

    const err = await service
      .create('u1', dto(), 'key-1')
      .then(() => null)
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ConflictException);
    const body = (err as ConflictException).getResponse() as Record<
      string,
      unknown
    >;
    expect(String(body.error)).toContain('body distinto');
    expect(body).not.toHaveProperty('insufficientStockSkus');
  });

  it('stock: junta todos los SKU cortos → 409 { insufficientStockSkus } y libera la key', async () => {
    tx.productVariant.findUnique
      .mockResolvedValueOnce(variant('v-b', 0))
      .mockResolvedValueOnce(variant('v-a', 1));

    const err = await service
      .create('u1', dto(), 'key-1')
      .then(() => null)
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ConflictException);
    expect((err as ConflictException).getResponse()).toEqual({
      error: 'Stock insuficiente',
      insufficientStockSkus: ['sku-v-b', 'sku-v-a'],
    });
    expect(prisma.idempotencyKey.delete).toHaveBeenCalled();
    expect(tx.order.create).not.toHaveBeenCalled();
  });

  describe('descuento (discountCode → PromoCode → total)', () => {
    const promo = (
      over: Partial<{
        code: string;
        type: 'percentage' | 'fixed_amount';
        value: number;
        appliesToCategory: string | null;
        minPurchase: number;
      }> = {},
    ) => ({
      code: over.code ?? 'WELCOME10',
      type: over.type ?? 'percentage',
      value: new Prisma.Decimal(over.value ?? 10),
      appliesToCategory: over.appliesToCategory ?? null,
      minPurchase: new Prisma.Decimal(over.minPurchase ?? 0),
      validFrom: new Date(Date.now() - 86_400_000),
      validUntil: new Date(Date.now() + 86_400_000),
    });

    const orderData = () =>
      (tx.order.create.mock.calls[0] as [{ data: Record<string, unknown> }])[0]
        .data;

    it('percentage sin restricción de categoría: descuenta sobre todo el subtotal', async () => {
      tx.productVariant.findUnique
        .mockResolvedValueOnce(variant('v-b', 5, 10))
        .mockResolvedValueOnce(variant('v-a', 5, 10));
      tx.promoCode.findUnique.mockResolvedValueOnce(promo({ value: 10 }));

      await service.create(
        'u1',
        dto({ discountCode: 'welcome10' }),
        'key-1',
      );

      expect(tx.promoCode.findUnique).toHaveBeenCalledWith({
        where: { code: 'WELCOME10' },
      });
      const data = orderData();
      expect(data.total).toBe(27); // subtotal 30 - 10% = 27
      expect(data.discountCode).toBe('WELCOME10');
      expect(data.discountAmount).toBe(3);
    });

    it('fixed_amount se clampea al subtotal elegible (nunca deja el total negativo)', async () => {
      tx.productVariant.findUnique
        .mockResolvedValueOnce(variant('v-b', 5, 10))
        .mockResolvedValueOnce(variant('v-a', 5, 10));
      tx.promoCode.findUnique.mockResolvedValueOnce(
        promo({ type: 'fixed_amount', value: 100 }),
      );

      await service.create('u1', dto({ discountCode: 'ENVIOGRATIS' }), 'key-1');

      const data = orderData();
      expect(data.total).toBe(0);
      expect(data.discountAmount).toBe(30);
    });

    it('appliesToCategory: el descuento solo corre sobre los ítems de esa categoría', async () => {
      tx.productVariant.findUnique
        .mockResolvedValueOnce(variant('v-b', 5, 10, 'cat-a')) // 1 * 10 = 10
        .mockResolvedValueOnce(variant('v-a', 5, 10, 'cat-b')); // 2 * 10 = 20
      tx.promoCode.findUnique.mockResolvedValueOnce(
        promo({ type: 'percentage', value: 50, appliesToCategory: 'cat-a' }),
      );

      await service.create('u1', dto({ discountCode: 'CATEGORIA20' }), 'key-1');

      const data = orderData();
      // subtotal 30, pero el 50% solo se aplica sobre los $10 de cat-a → descuento $5.
      expect(data.discountAmount).toBe(5);
      expect(data.total).toBe(25);
    });

    it('subtotal por debajo de minPurchase → 409 y libera la idempotency key', async () => {
      tx.productVariant.findUnique
        .mockResolvedValueOnce(variant('v-b', 5, 10))
        .mockResolvedValueOnce(variant('v-a', 5, 10));
      tx.promoCode.findUnique.mockResolvedValueOnce(promo({ minPurchase: 100 }));

      const err = await service
        .create('u1', dto({ discountCode: 'WELCOME10' }), 'key-1')
        .then(() => null)
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(ConflictException);
      expect(tx.order.create).not.toHaveBeenCalled();
      expect(prisma.idempotencyKey.delete).toHaveBeenCalled();
    });

    it('código inexistente o expirado → 404 (mismo criterio que GET /promo-codes/:code)', async () => {
      tx.productVariant.findUnique
        .mockResolvedValueOnce(variant('v-b', 5, 10))
        .mockResolvedValueOnce(variant('v-a', 5, 10));
      tx.promoCode.findUnique.mockResolvedValueOnce(null);

      const err = await service
        .create('u1', dto({ discountCode: 'NOEXISTE' }), 'key-1')
        .then(() => null)
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(NotFoundException);
      expect((err as NotFoundException).getResponse()).toEqual({
        error: 'Código de descuento inválido o expirado',
        code: 'invalid_discount_code',
      });
      expect(tx.order.create).not.toHaveBeenCalled();
    });
  });
});
