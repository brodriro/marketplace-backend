import {
  ValidationPipe,
  VERSION_NEUTRAL,
  VersioningType,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AppConfig } from './config/configuration';

async function bootstrap() {
  // `rawBody: true` deja `req.rawBody` (Buffer) disponible para verificar la firma del webhook de
  // Stripe (`POST /webhooks/stripe`), que necesita los bytes exactos, no el JSON ya parseado.
  const app = await NestFactory.create(AppModule, { rawBody: true });

  const configService = app.get(ConfigService<AppConfig, true>);

  // Versionado por URI (plan E2E, hito M1): el contrato v1 vive bajo `/v1/...`.
  // `VERSION_NEUTRAL` mantiene las rutas sin prefijo respondiendo durante el cutover de los
  // clientes (app + agente); se remueve en M8 cuando los tres estén en `/v1`.
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: ['1', VERSION_NEUTRAL],
  });

  app.use(helmet());
  app.enableCors({
    origin: configService.get('cors.origins', { infer: true }),
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.listen(configService.get('port', { infer: true }));
}
void bootstrap();
