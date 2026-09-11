import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, OpenAPIObject } from '@nestjs/swagger';

/**
 * Documento único, compartido por `GET /docs` (main.ts) y `pnpm run openapi:dump`
 * (openapi-dump.ts) — generado desde los decorators, reemplaza al esqueleto estático de M0
 * (`documentacion/openapi.json`, congelado 2026-09-06).
 */
export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('marketplace-backend API')
    .setDescription(
      'Contrato v1 generado desde los decorators de NestJS (M8/B8). Ver documentacion/API.md ' +
        'para la referencia legible y demoCompose/docs/plan-e2e.md §6 para el contrato E2E.\n\n' +
        'Convención de tipos: los campos Decimal de Prisma (price, total, unitPrice, etc.) y los ' +
        'DateTime viajan como string en el JSON, no como number.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('auth', 'Registro, login, refresh y logout.')
    .addTag('users', 'Perfil del usuario autenticado.')
    .addTag('categories')
    .addTag('products')
    .addTag('reviews')
    .addTag('favorites')
    .addTag('cart', 'Carrito persistido por usuario.')
    .addTag('orders', 'Pedidos del shopper + ciclo de vida (M4) + pago (M5).')
    .addTag('notifications', 'Canal de eventos admin→app (M4).')
    .addTag('banners')
    .addTag('promo-codes')
    .addTag(
      'webhooks',
      'Entradas de proveedores externos. No van bajo /v1 ni usan bearer.',
    )
    .addTag(
      'admin',
      'Requieren JWT válido + role=admin. Consumidos por la app Next.js admin/.',
    )
    .build();

  return SwaggerModule.createDocument(app, config);
}
