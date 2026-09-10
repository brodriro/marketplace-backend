import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AppConfig } from './config/configuration';

async function bootstrap() {
  // `rawBody: true` deja `req.rawBody` (Buffer) disponible para verificar la firma del webhook de
  // Stripe (`POST /webhooks/stripe`), que necesita los bytes exactos, no el JSON ya parseado.
  const app = await NestFactory.create(AppModule, { rawBody: true });

  const configService = app.get(ConfigService<AppConfig, true>);

  // Versionado por URI (plan E2E, hito M1): el contrato v1 vive bajo `/v1/...`.
  // El alias sin prefijo (`VERSION_NEUTRAL`) que sostuvo el cutover de los clientes (app + agente)
  // se removió en M8 — los tres ya pegan a `/v1`. El webhook del proveedor mantiene su ruta sin
  // prefijo por decisión propia (`@Controller({ version: VERSION_NEUTRAL })` en `webhooks/`).
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: configService.get('cors.origins', { infer: true }),
    credentials: true, // el panel admin manda la cookie de sesión (M7)
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
