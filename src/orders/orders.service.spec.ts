import { ConflictException } from '@nestjs/common';
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

  const variant = (id: string, stock: number, price = 10) => ({
    id,
    sku: `sku-${id}`,
    stock,
    product: { price: new Prisma.Decimal(price) },
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
});
