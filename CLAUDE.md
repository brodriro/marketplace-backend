# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Documentación

El contexto base está en documentacion/context.md — léelo al empezar cualquier tarea.
- documentacion/plan.md    — dirección, hitos, decisiones abiertas, coordinación cross-repo
- documentacion/tasks.md   — tareas activas (todo/doing/blocked) + "retomar acá"
- documentacion/handoff.md — log de tareas completadas (más reciente arriba)
Para generar/retomar una tarea: parte de context.md y toma de plan.md / tasks.md lo necesario.
Al completar una tarea: muévela de tasks.md a handoff.md (entrada nueva arriba: fecha · qué · por qué · archivos clave · follow-ups).

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

`POST /orders` runs in a single Prisma transaction: validates stock for **all** variants first,
then decrements and computes `total` from each variant's product `price` at purchase time — if any
item lacks stock, nothing is persisted and it returns `409 { error, insufficientStockSkus: [...] }`
(all short SKUs at once; changed from a `400` + text in M5). It also writes the genesis
`OrderStatusHistory` row (`pending_payment`, `actorType: buyer`).

**M4 (`feat/e2e-m4-lifecycle`, task B3):** the 7-state enum is
`pending_payment · paid · preparing · shipped · delivered · cancelled · refunded` (`processing`
was renamed to `preparing`). Transitions are validated against the matrix in
`src/orders/order-transitions.ts` (frozen contract `demoCompose/docs/plan-e2e.md` §6.3) — an
illegal transition returns `409 { error, allowedTransitions: [...] }`. `preparing → shipped`
requires `trackingNumber` + `trackingCarrier`; any `→ refunded` requires `reason` (stored as the
history row's `note`). `→ cancelled` restocks every line item (`refunded` does not — §6.3).
`PATCH /admin/orders/:id/status`
with no `status` (or the same status) is still a tracking-only update — no transition, no history.
`POST /orders/:id/cancel` is the buyer's only transition: `pending_payment → cancelled` only,
`{ reason? }` body, same `404` for "not found" and "not yours".

`GET /orders/:id.timeline` is now built from `OrderStatusHistory` rows ordered by `createdAt`
(`[{ status, at, actorType }]`), not inferred from `status` + timestamps. Every transition (admin
or buyer) also fires an `order_status_changed` `Notification` for the order's user (best-effort —
a notification failure is logged, never rethrown).

**Discount codes (2026-09-11):** an optional `discountCode` in `POST /orders` is validated against
`PromoCode` (`OrdersService.applyDiscount`, same 404-on-invalid-or-expired rule as
`GET /promo-codes/:code`) and applied to `total` **inside** the transaction, before stock is
decremented — this reversed the earlier "client computes the discounted total" design (still
reflected in `GET /promo-codes/:code`, which stays preview-only/non-mutating). `minPurchase` is
checked against the full subtotal (`409 { error, minPurchase }` if short); `appliesToCategory`
scopes the discount to that category's share of the subtotal, clamping `fixed_amount` so `total`
never goes negative. `discountCode` (normalized upper-case) and `discountAmount` are persisted on
`Order` and both are part of the `Idempotency-Key` request hash. The same `404`/`code`
(`invalid_discount_code`) shape is used by both endpoints for consistency.

**Cart-level `discountCode` (2026-09-12):** `PATCH /cart { discountCode }` persists (or, with
`null`, clears) a code on `Cart` so a conversational checkout doesn't have to re-send it every
turn — `CartService.setDiscountCode` only validates existence/expiry (delegates to
`PromoCodesService.validate`, same 404 shape), **not** `minPurchase` (subtotal-dependent, still
enforced by `OrdersService.applyDiscount` at order time). This is passive storage only — nothing
reads `Cart.discountCode` to auto-fill `POST /orders`; the checkout caller still has to pass
`discountCode` explicitly, just sourced from `GET /cart` instead of having to remember it.
`CartService.clear()` also nulls it out, same as it does for items.

### Payments — provider-agnostic (M5, `feat/e2e-m5-payments`, task B4)

The backend is **not tied to Stripe**. `src/payments/payment-provider.ts` defines a
`PaymentProvider` interface (`createIntent`, `verifyWebhook`, `publishableKey`, `supportsWebhook`,
`allowsUnverifiedConfirm`); `PaymentsModule` picks the implementation from `PAYMENT_PROVIDER`:
- **`bypass`** (default) — `src/payments/bypass.provider.ts`. No external call: `createIntent`
  returns a synthetic `clientSecret`, `supportsWebhook=false`, and confirmation is skipped. **It
  charges nothing.** Used for dev + the E2E loop. **Must be swapped for a real provider before
  friend & family / production — see `documentacion/plan.md` "Pendiente para producción".**
- **`stripe`** — `src/payments/stripe.provider.ts`. Real Stripe test; the 3 `STRIPE_*` keys are
  then required (Zod-refined at boot).

`POST /orders` requires an `Idempotency-Key` header (client-origin: Android → agent → header;
`400` if missing from M5). The `IdempotencyKey` row (`@@unique([userId, key])`) is the lock:
created empty up front, filled with the response on success, **deleted if order creation fails**
so the client can retry. Same key + same body (item order doesn't matter — hashed normalized) →
the stored response is replayed; same key + different body → `409` with no `insufficientStockSkus`.

`PAYMENTS_ENABLED` (env, default `true`) gates the flow: `true` → `provider.createIntent()`, store
`Order.paymentIntentId`, return `{ order, payment: { provider, clientSecret, publishableKey } }`,
cart cleared later on `→ paid`; `false` (M2→M4 window) → no intent, return `{ order }`, cart
cleared at creation.

`pending_payment → paid` is a **system** transition (`OrdersService.markPaidBySystem`, idempotent):
`POST /webhooks/stripe` (version-neutral, no auth — signature verified by the provider over
`req.rawBody`; `main.ts` boots with `rawBody: true`; `404` if the active provider has no webhooks),
or `POST /orders/:id/confirm` (allowed when `provider.allowsUnverifiedConfirm` — always for
`bypass`, only with `STRIPE_DEMO_CONFIRM=true` for `stripe`; else `404`). Both clear the cart and
fire the `order_status_changed` notification. `OrderPaymentSweepService` (`@Cron` every minute)
cancels `pending_payment` orders older than `ORDER_PAYMENT_TTL_MIN` (default 30) and restocks.
The system transition above (`markPaidBySystem`) stamps `e2eRunId` into `OrderStatusHistory.meta`
when the triggering request carries a valid `X-E2E-Run` header. Admin-driven transitions
(`PATCH /admin/orders/:id/status`) do **not** — there it lands in `AuditLog.meta` instead, via
`AuditInterceptor`.

### Notifications: `Notification` model (delivery) vs `StockAlert` (subscription)

**M4 (`feat/e2e-m4-lifecycle`, task B5).** `StockAlert` is still the *subscription*, created via
`POST /products/:id/alerts` unchanged. `Notification` is the *delivery*: one row per fired event.
Three `NotificationType`s: `order_status_changed` (order transitions), `back_in_stock` (a
variant's stock goes `0 → >0` in `ProductsService.updateVariant`), `price_drop` (a product's
`price` decreases in `ProductsService.update`). `back_in_stock` / `price_drop` only notify users
with a matching un-fired `StockAlert`, and flip that alert's `notified` flag.

`GET /notifications` reads `Notification` and serializes the §6.4 wire:
`{ id, type, title, body, read (=`readAt != null`), createdAt, deepLink: { type: "order"|"product", id },
data: {...}, product }` — `product` is non-null only for `back_in_stock`/`price_drop`; `notified`
is kept as a back-compat mirror of `read`. `PATCH /notifications/:id/read` +
`POST /notifications/read-all` (`{ count }`). The `emit*` methods never throw.

Pre-`master`/pre-M4 behaviour (still live on `master`): no `Notification` model —
`GET /notifications` / `PATCH /notifications/:id/read` read and update `StockAlert` directly,
`StockAlert.notified` being the read flag.

### Color is a lookup table, not a FK

`Color` (name/value) is a catalog of valid color values, but `ProductVariant.color` is a plain
string column, not a foreign key — validity is enforced in the DTO layer, not the DB. Since M6/B7
(`feat/e2e-m7-admin-polish`) the catalog values are es-419 (`Negro`/`Azul`/`Verde`/`Rojo`/`Celeste`)
via the data migration `20260909180000_i18n_es419_catalog` (also translates category names/subtitles
and `Product.store`). `GET /products/search` tokenizes `q` and matches each token against `name`,
`description`, **or** a visible variant's `color`.

### Admin polish (M7 / B6, `feat/e2e-m7-admin-polish`)

Read-only dashboards under `src/admin/`: `GET /admin/analytics` (orders by status, revenue,
7/30-day counts, catalog + low-stock counts, top products), `GET /admin/analytics/low-stock`,
`GET /admin/monitor/notifications` + `/stock-alerts` (global views), `GET /admin/agent-config`
(md5 checksum of a canonical catalog serialization + counts). Not audited (GET). The Next.js
`admin/` app has matching pages.

**Admin session is dual-mode.** The mobile `Authorization: Bearer` still works everywhere. The
admin app now also authenticates by **httpOnly cookie**: `POST /admin/auth/login` (checks
`role: admin`) sets `admin_session` (access, httpOnly), `admin_refresh` (refresh, httpOnly),
`admin_csrf` (JS-readable); `POST /admin/auth/refresh` rotates them from the cookie;
`GET /admin/auth/session` introspects. `JwtStrategy` extracts the JWT from the Bearer header **or**
the `admin_session` cookie. `AdminCsrfGuard` (`APP_GUARD`) enforces double-submit CSRF
(`X-CSRF-Token` == `admin_csrf` cookie) on `/admin/*` mutations **only when cookie-authed** — Bearer
requests skip it. `main.ts` uses `cookie-parser` and CORS `credentials: true`.

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
