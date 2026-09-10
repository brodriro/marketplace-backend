import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Estado del catálogo que consume el agente conversacional (plan E2E M7 / B6: "config del agente —
 * versión de catálogo + md5"). El `checksum` es un md5 sobre una serialización canónica del
 * catálogo (categorías + productos + variantes + colores, ordenados por id); el agente lo usa para
 * detectar drift contra su copia cacheada. `updatedAt` es el `max` de los `updatedAt` del catálogo.
 */
@Injectable()
export class AdminAgentConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async get() {
    const [categories, products, variants, colors] =
      await this.prisma.$transaction([
        this.prisma.category.findMany({
          orderBy: { id: 'asc' },
          select: { id: true, name: true, subtitle: true },
        }),
        this.prisma.product.findMany({
          where: { visible: true },
          orderBy: { id: 'asc' },
          select: {
            id: true,
            name: true,
            description: true,
            price: true,
            store: true,
            status: true,
            categoryId: true,
            updatedAt: true,
          },
        }),
        this.prisma.productVariant.findMany({
          where: { visible: true },
          orderBy: { id: 'asc' },
          select: {
            id: true,
            productId: true,
            color: true,
            sku: true,
            stock: true,
          },
        }),
        this.prisma.color.findMany({
          orderBy: { id: 'asc' },
          select: { name: true, value: true },
        }),
      ]);

    const canonical = JSON.stringify({
      categories,
      products: products.map((p) => ({ ...p, price: p.price.toFixed(2) })),
      variants,
      colors,
    });
    const checksum = createHash('md5').update(canonical).digest('hex');
    const updatedAt = products.reduce<Date | null>(
      (max, p) => (!max || p.updatedAt > max ? p.updatedAt : max),
      null,
    );

    return {
      catalog: {
        checksum,
        updatedAt,
        counts: {
          categories: categories.length,
          products: products.length,
          variants: variants.length,
          colors: colors.length,
        },
      },
      agent: {
        // Config descriptiva de la integración (ver reference/handoff-integracion-agente.md).
        authMode: 'bearer-propagation',
        cartMode: 'server-persisted',
      },
    };
  }
}
