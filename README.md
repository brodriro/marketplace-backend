# marketplace-backend

Backend REST en NestJS (arquitectura por defecto — `*.module.ts`/`*.controller.ts`/`*.service.ts` por
feature) para el marketplace de `demoCompose`. Reemplaza el mock estático de la app Android
(`app/src/main/assets/mocks/feed.json`) con persistencia real en PostgreSQL.

Ver `docs/plan-marketplace-backend.md` (repo `demoCompose`) para el plan completo: diagnóstico,
modelo de datos, endpoints y justificación de cada decisión de stack.

## Stack

- NestJS 11 + pnpm
- PostgreSQL + Prisma 7 (`@prisma/adapter-pg`, cliente generado en `src/generated/prisma`)
- JWT (`@nestjs/jwt` + `passport-jwt`) + `bcrypt` para password hashing
- `class-validator`/`class-transformer` (`ValidationPipe` global), `helmet`, `@nestjs/throttler`

## Setup

```bash
pnpm install

cp .env.example .env
# completar JWT_SECRET (y ajustar DATABASE_URL si no usás el docker-compose de abajo)

docker-compose up -d          # Postgres local en :5432
npx prisma migrate dev --name init
npx prisma db seed            # transforma prisma/seed-data/feed.json (copia 1:1 del mock Android)

pnpm run start:dev
```

El seed crea un usuario demo (`SEED_DEMO_EMAIL`/`SEED_DEMO_PASSWORD` en `.env`, default
`demo@marketplace.dev` / `demo12345`), 3 usuarios reviewer sintéticos, el catálogo completo
(colores/categorías/productos/variantes con stock determinístico), 4 favoritos y 1 pedido
`shipped` para el usuario demo. Es idempotente — correrlo de nuevo no duplica datos.

## Endpoints

Base: `POST /auth/register`, `POST /auth/login`, `GET /me`, `GET /categories`,
`GET /products`, `GET /products/:id`.

Nuevos (§6 del plan): `GET|POST|DELETE /favorites`, `GET|POST /products/:id/reviews`,
`GET|POST /orders` + `GET /orders/:id`, `GET /products/search`,
`POST /products/:id/alerts` + `GET /notifications` + `PATCH /notifications/:id/read`.

Todos los endpoints salvo auth/catálogo requieren `Authorization: Bearer <accessToken>`.

## Comandos

```bash
pnpm run start:dev     # watch mode
pnpm run build         # dist/main.js
pnpm run lint
pnpm test              # unit (jest)
pnpm run test:e2e      # e2e (supertest) — requiere Postgres levantado y migrado
npx prisma studio      # explorar la base
```

## Notas de implementación

- **Prisma 7**: el datasource ya no se conecta desde `schema.prisma`/`.env` directo — vive en
  `prisma.config.ts` (usado por la CLI) y en `PrismaService` (usado por la app), que arma un
  `PrismaClient` con `@prisma/adapter-pg` explícito. Ver `src/prisma/prisma.service.ts`.
- **Ciclo Auth↔Users**: `AuthService` necesita `UsersService` (login/register) y varios módulos
  necesitan el guard JWT (`Users` para `/me`, `Favorites`, `Orders`, `Reviews`, `Notifications`,
  `Products` para `/alerts`). El guard/estrategia viven en `JwtAuthModule`, sin depender de
  `UsersModule`, evitando el ciclo — ver el comentario en `src/auth/jwt-auth.module.ts`.
- **`GET /orders/:id`**: el `timeline` es derivado de `status` + `createdAt`/`updatedAt`, no hay
  tabla de historial de estados en el modelo (no está en el diagrama ER del plan).
