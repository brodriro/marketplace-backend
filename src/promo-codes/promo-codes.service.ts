import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PromoCodesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Devuelve el código solo si existe y `now` cae dentro de `[validFrom, validUntil]`.
   * "No existe" y "fuera de vigencia" devuelven el mismo `404` — contrato acordado con el
   * agente conversacional: su tool `apply_discount_code` solo distingue 200 vs 404.
   *
   * `value` y `minPurchase` son `Decimal` de Prisma → se serializan como string en el JSON
   * (`"10.00"`), igual que `Product.price` / `Order.total` (ver CLAUDE.md).
   */
  async validate(code: string) {
    const promo = await this.prisma.promoCode.findUnique({
      where: { code: code.toUpperCase() },
    });

    const now = new Date();
    if (!promo || now < promo.validFrom || now > promo.validUntil) {
      throw new NotFoundException('Código de descuento inválido o expirado');
    }

    return {
      code: promo.code,
      type: promo.type,
      value: promo.value,
      appliesToCategory: promo.appliesToCategory,
      minPurchase: promo.minPurchase,
      validFrom: promo.validFrom,
      validUntil: promo.validUntil,
    };
  }
}
