import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { buildOpenApiDocument } from './openapi';

/**
 * `pnpm run openapi:dump` — regenera `documentacion/openapi.json` desde los decorators (M8/B8),
 * reemplazando el esqueleto estático de M0. No levanta el server: crea el `INestApplication` solo
 * para introspeccionar rutas/DTOs vía `SwaggerModule.createDocument`, después lo cierra.
 */
async function main() {
  const app = await NestFactory.create(AppModule, { logger: false });
  const document = buildOpenApiDocument(app);

  const outPath = join(__dirname, '..', 'documentacion', 'openapi.json');
  writeFileSync(outPath, JSON.stringify(document, null, 2) + '\n');
  console.log(`OpenAPI dump escrito en ${outPath}`);

  await app.close();
}

void main();
