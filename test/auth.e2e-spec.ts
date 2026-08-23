import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

/**
 * Requiere una instancia de Postgres accesible vía `DATABASE_URL` (`docker-compose up -d` +
 * `npx prisma migrate dev`) — `PrismaService.onModuleInit` conecta al levantar el módulo, así
 * que este spec no puede correr contra una base mockeada como sí hace `agente-mobile`.
 */
describe('AuthController (e2e)', () => {
  let app: INestApplication<App>;
  const email = `e2e-${Date.now()}@marketplace.dev`;
  const password = 'password123';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
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

  it('registers a new account and returns an access token', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password, name: 'E2E Tester' })
      .expect(201);

    expect(response.body).toEqual({ accessToken: expect.any(String) as string });
  });

  it('rejects a duplicate registration with 409', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password, name: 'E2E Tester' })
      .expect(409);
  });

  it('logs in with valid credentials', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);

    expect(response.body).toEqual({ accessToken: expect.any(String) as string });
  });

  it('rejects invalid credentials with 401', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'wrong-password' })
      .expect(401);
  });

  it('rejects a malformed payload with 400', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'not-an-email', password: '123', name: '' })
      .expect(400);
  });

  it('returns the authenticated profile from /me', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);

    const response = await request(app.getHttpServer())
      .get('/me')
      .set('Authorization', `Bearer ${login.body.accessToken as string}`)
      .expect(200);

    expect(response.body).toMatchObject({ email, name: 'E2E Tester' });
    expect(response.body).not.toHaveProperty('passwordHash');
  });

  it('rejects /me without a token with 401', async () => {
    await request(app.getHttpServer()).get('/me').expect(401);
  });
});
