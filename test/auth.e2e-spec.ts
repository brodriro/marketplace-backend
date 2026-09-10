import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

/**
 * Requiere una instancia de Postgres accesible vía `DATABASE_URL` (`docker-compose up -d` +
 * `npx prisma migrate dev`) — `PrismaService.onModuleInit` conecta al levantar el módulo, así
 * que este spec no puede correr contra una base mockeada como sí hace `agente-mobile`.
 */
interface AuthTokensBody {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

const expectAuthTokens = (body: unknown): AuthTokensBody => {
  expect(body).toEqual({
    accessToken: expect.any(String) as string,
    refreshToken: expect.any(String) as string,
    expiresIn: expect.any(Number) as number,
  });
  return body as AuthTokensBody;
};

describe('AuthController (e2e)', () => {
  let app: INestApplication<App>;
  const email = `e2e-${Date.now()}@marketplace.dev`;
  const password = 'password123';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: '1',
    });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('registers a new account and returns the token pair', async () => {
    const response = await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({ email, password, name: 'E2E Tester' })
      .expect(201);

    expectAuthTokens(response.body);
  });

  it('rejects a duplicate registration with 409', async () => {
    await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({ email, password, name: 'E2E Tester' })
      .expect(409);
  });

  it('logs in with valid credentials and returns the token pair', async () => {
    const response = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email, password })
      .expect(200);

    expectAuthTokens(response.body);
  });

  it('ya no responde sin el prefijo /v1 (alias VERSION_NEUTRAL removido en M8)', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(404);
  });

  it('rejects invalid credentials with 401', async () => {
    await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email, password: 'wrong-password' })
      .expect(401);
  });

  it('rejects a malformed payload with 400', async () => {
    await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({ email: 'not-an-email', password: '123', name: '' })
      .expect(400);
  });

  it('returns the authenticated profile from /me', async () => {
    const login = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email, password })
      .expect(200);
    const { accessToken } = expectAuthTokens(login.body);

    const response = await request(app.getHttpServer())
      .get('/v1/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(response.body).toMatchObject({ email, name: 'E2E Tester' });
    expect(response.body).not.toHaveProperty('passwordHash');
  });

  it('rejects /me without a token with 401', async () => {
    await request(app.getHttpServer()).get('/v1/me').expect(401);
  });

  describe('refresh token rotation', () => {
    let refreshToken: string;

    beforeEach(async () => {
      const login = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email, password })
        .expect(200);
      refreshToken = expectAuthTokens(login.body).refreshToken;
    });

    it('rotates the pair and invalidates the presented refresh token', async () => {
      const rotated = await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .send({ refreshToken })
        .expect(200);
      const next = expectAuthTokens(rotated.body);
      expect(next.refreshToken).not.toEqual(refreshToken);

      // el refresh viejo ya no sirve
      await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .send({ refreshToken })
        .expect(401);
    });

    it('revokes the whole family when a rotated token is reused', async () => {
      const rotated = await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .send({ refreshToken })
        .expect(200);
      const next = expectAuthTokens(rotated.body);

      // reusar el viejo (ya revocado) dispara la revocación de la familia
      await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .send({ refreshToken })
        .expect(401);

      // y por lo tanto el token nuevo, de la misma familia, también queda muerto
      await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .send({ refreshToken: next.refreshToken })
        .expect(401);
    });

    it('logout revokes the refresh token (idempotent)', async () => {
      await request(app.getHttpServer())
        .post('/v1/auth/logout')
        .send({ refreshToken })
        .expect(204);

      await request(app.getHttpServer())
        .post('/v1/auth/logout')
        .send({ refreshToken })
        .expect(204);

      await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .send({ refreshToken })
        .expect(401);
    });

    it('rejects an unknown refresh token with 401', async () => {
      await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .send({ refreshToken: 'not-a-real-token' })
        .expect(401);
    });
  });
});
