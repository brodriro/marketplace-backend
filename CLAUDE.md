# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

NestJS 11 REST backend for a marketplace app (companion to an Android app in a separate
`demoCompose` repo). Replaces that app's static mock (`feed.json`) with real persistence in
PostgreSQL via Prisma 7. The canonical design doc (`docs/plan-marketplace-backend.md`) lives in
the `demoCompose` repo, not here — `README.md` and `documentacion/API.md` in this repo are the
local sources of truth (the latter is generated from the actual code, not the plan).

Commit messages, code comments, and docs in this repo are written in Spanish.

## Commands

```bash
pnpm install

docker-compose up -d              # Postgres on :5432 (user/pass/db: marketplace)
npx prisma migrate dev --name X   # apply/create a migration
npx prisma db seed                # idempotent — re-running does not duplicate data
npx prisma studio                 # browse the DB

pnpm run start:dev                # watch mode, port from PORT (.env), default 5000
pnpm run build                    # -> dist/main.js
pnpm run lint                     # eslint --fix
pnpm run format                   # prettier --write

pnpm test                         # unit tests (jest, rootDir: src, *.spec.ts)
pnpm test -- users.service        # run a single unit test file by name pattern
pnpm run test:watch
pnpm run test:cov
pnpm run test:e2e                 # supertest, *.e2e-spec.ts — requires Postgres up and migrated
```

`.env` is required (copy from `.env.example`); `JWT_SECRET` and `DATABASE_URL` in particular.
Env vars are validated at boot via Zod (`src/config/env.validation.ts`) — a missing/invalid var
throws on startup, not at first use.

## Architecture

Standard Nest feature-module layout: one `*.module.ts` / `*.controller.ts` / `*.service.ts` (+
`dto/`) per domain folder under `src/` (`auth`, `users`, `categories`, `products`, `favorites`,
`reviews`, `orders`, `notifications`). All feature modules are wired in `src/app.module.ts`.

### Prisma 7 has no datasource in `schema.prisma`/`.env`

Unlike older Prisma, the datasource connection is *not* configured declaratively. It's built
explicitly in two separate places that must be kept in sync:
- `prisma.config.ts` — used by the Prisma CLI (migrate, studio, seed), reads `DATABASE_URL` via
  `dotenv/config`.
- `src/prisma/prisma.service.ts` — used by the running app. `PrismaService` extends the generated
  `PrismaClient` and constructs it with an explicit `@prisma/adapter-pg` driver adapter, wired to
  Nest's lifecycle (`$connect`/`$disconnect` in `onModuleInit`/`onModuleDestroy`).

The Prisma client is generated into `src/generated/prisma` (gitignored) via
`prisma generate` — runs automatically after `pnpm install` and after `prisma migrate dev`.
Import it from `../generated/prisma/client`, not `@prisma/client`.

### Auth/Users module cycle, and why `JwtAuthModule` exists

`AuthService` (register/login) depends on `UsersService`. Several feature modules (`Users` for
`/me`, `Favorites`, `Orders`, `Reviews`, `Notifications`, `Products` for `/alerts`) need the JWT
guard to protect routes. If the guard lived inside `AuthModule`, `UsersModule` would need to
import `AuthModule` and vice versa — a cycle. The fix: `JwtAuthGuard`/`JwtStrategy` live in their
own `src/auth/jwt-auth.module.ts`, depending on neither `AuthModule` nor `UsersModule`, and every
module that needs auth imports `JwtAuthModule` directly instead of `AuthModule`.

### Decimal and DateTime fields serialize as strings

`Product.price`, `Order.total`, `OrderItem.unitPrice` are Prisma `Decimal` — they serialize to
JSON as **strings** (e.g. `"199.99"`), not numbers. `DateTime` fields also serialize as ISO-8601
strings. This is the wire contract clients depend on (see `documentacion/API.md`) — don't
"fix" it by coercing to `number` in a service/controller.

### Orders

`POST /orders` runs in a single Prisma transaction: validates stock per variant, decrements
stock, and computes `total` from each variant's product `price` at purchase time — if any item
lacks sufficient stock, nothing is persisted (error message: `Stock insuficiente para <sku>`).

`GET /orders/:id` returns a synthetic `timeline` derived from `status` + `createdAt`/`updatedAt`
(fixed order `pending_payment → processing → shipped → delivered`) — there is no order-status-
history table in the schema. Both "order doesn't exist" and "order exists but belongs to another
user" return the same `404` (no ownership-vs-existence leak).

### Notifications are stock alerts, not a separate table

There's no `Notification` model. `GET /notifications` / `PATCH /notifications/:id/read` read and
update the `StockAlert` table (created via `POST /products/:id/alerts`); `StockAlert.notified`
is the read/unread flag.

### Color is a lookup table, not a FK

`Color` (name/value) is a catalog of valid color values, but `ProductVariant.color` is a plain
string column, not a foreign key — validity is enforced in the DTO layer, not the DB.

### Global setup (`src/main.ts` / `src/app.module.ts`)

- `helmet()` + CORS restricted to `cors.origins` (from `CORS_ORIGINS` env, comma-separated).
- Global `ValidationPipe({ whitelist, forbidNonWhitelisted, transform })` — DTOs are the
  enforcement point for request shape; unknown fields are rejected, not silently dropped.
- Global rate limiting via `@nestjs/throttler`: 100 req/60s per IP (`APP_GUARD` in
  `app.module.ts`).
- Auth is JWT Bearer with no refresh token — tokens expire per `JWT_EXPIRES_IN` (default `1d`)
  and the client just logs in again.

### Seeding

`prisma/seed.ts` transforms `prisma/seed-data/feed.json` (a 1:1 copy of the Android app's mock)
into DB rows: catalog (colors/categories/products/variants with deterministic stock), a demo user
(`SEED_DEMO_EMAIL`/`SEED_DEMO_PASSWORD`), synthetic reviewers, favorites, and one shipped order.
It's idempotent — safe to re-run, e.g. after `prisma migrate reset`.
