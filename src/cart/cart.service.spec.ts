import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { PromoCodesService } from '../promo-codes/promo-codes.service';
import { CartService } from './cart.service';

/**
 * `discountCode` a nivel carrito (`PATCH /cart`, pedido de @agente 2026-09-12): persiste el
 * código entre turnos de un checkout conversacional. Solo valida existencia/vigencia
 * (delegado en `PromoCodesService.validate`) — `minPurchase` se re-chequea en `POST /orders`.
 */
describe('CartService — discountCode a nivel carrito', () => {
  let service: CartService;
  let prisma: {
    cart: { upsert: jest.Mock; update: jest.Mock; findUnique: jest.Mock };
    cartItem: { deleteMany: jest.Mock };
  };
  let validate: jest.Mock;

  beforeEach(async () => {
    prisma = {
      cart: {
        upsert: jest.fn().mockResolvedValue({ id: 'cart-1' }),
        update: jest.fn().mockResolvedValue({}),
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'cart-1', discountCode: null, items: [] }),
      },
      cartItem: { deleteMany: jest.fn().mockResolvedValue({}) },
    };
    validate = jest.fn();

    const moduleRef = await Test.createTestingModule({
      providers: [
        CartService,
        { provide: PrismaService, useValue: prisma },
        { provide: PromoCodesService, useValue: { validate } },
      ],
    }).compile();
    service = moduleRef.get(CartService);
  });

  it('código válido: lo normaliza (mayúsculas) y lo persiste en el carrito', async () => {
    validate.mockResolvedValueOnce({ code: 'WELCOME10' });

    const view = await service.setDiscountCode('u1', 'welcome10');

    expect(validate).toHaveBeenCalledWith('welcome10');
    expect(prisma.cart.update).toHaveBeenCalledWith({
      where: { id: 'cart-1' },
      data: { discountCode: 'WELCOME10' },
    });
    expect(view.discountCode).toBeNull(); // el mock de findUnique no lo refleja, solo el side-effect
  });

  it('código inválido/expirado: no persiste nada, deja pasar el 404 de PromoCodesService', async () => {
    validate.mockRejectedValueOnce(
      new NotFoundException({
        error: 'Código de descuento inválido o expirado',
        code: 'invalid_discount_code',
      }),
    );

    await expect(
      service.setDiscountCode('u1', 'NOEXISTE'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.cart.update).not.toHaveBeenCalled();
  });

  it('null limpia el código sin llamar a PromoCodesService', async () => {
    await service.setDiscountCode('u1', null);

    expect(validate).not.toHaveBeenCalled();
    expect(prisma.cart.update).toHaveBeenCalledWith({
      where: { id: 'cart-1' },
      data: { discountCode: null },
    });
  });

  it('clear() también limpia el discountCode del carrito', async () => {
    await service.clear('u1');

    expect(prisma.cart.update).toHaveBeenCalledWith({
      where: { id: 'cart-1' },
      data: { discountCode: null },
    });
  });

  it('GET /cart (getCart) devuelve el discountCode persistido', async () => {
    prisma.cart.findUnique.mockResolvedValueOnce({
      id: 'cart-1',
      discountCode: 'WELCOME10',
      items: [],
    });

    const view = await service.getCart('u1');
    expect(view.discountCode).toBe('WELCOME10');
  });
});
