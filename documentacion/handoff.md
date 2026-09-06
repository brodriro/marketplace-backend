# handoff.md — marketplace-backend

> Log reverso de tareas completadas (más reciente arriba). Entradas de 3-6 líneas:
> **fecha · qué · por qué · archivos clave · follow-ups**. Se mantienen ~20 entradas / ~90 días —
> el archivo real es `git log`. El detalle profundo de la integración con el agente está en
> [`reference/handoff-integracion-agente.md`](reference/handoff-integracion-agente.md).

---

## 2026-09-06 · Plan E2E · M2 / B2 — carrito persistido (borrador, rama, sin merge)

- **Qué:** rama `feat/e2e-m2-cart` (stack sobre `feat/e2e-m1-auth-refresh`). Modelos `Cart`
  (1:1 usuario) + `CartItem` (`@@unique([cartId, variantId])`, FK a `ProductVariant`), migración
  `20260906225213_add_cart` **aplicada al RDS pre-prod**. `src/cart/` (module + controller +
  service + 3 DTO): `GET /cart`, `POST /cart/items`, `PATCH /cart/items/:variantId`,
  `DELETE /cart/items/:variantId`, `DELETE /cart`, `POST /cart/merge`. Precio **vivo** (se
  recalcula con `product.price` en cada respuesta; `Decimal.toFixed(2)` → string). Escritura acepta
  `variantId` **o** `sku` (exactamente uno, si no `400`). `merge` = unión con
  `quantity = max(local, server)`. `GET /cart` sin ítems → `200 {items:[],itemCount:0,
  subtotal:"0.00"}` (no `404`). `Idempotency-Key` se acepta pero **todavía no deduplica** (tabla
  `IdempotencyKey` llega en M5/B4). El carrito no valida stock (eso es `POST /orders`).
- **Por qué:** hito M2 — fuente de verdad única del carrito para app (C1) y agente (A1).
- **Archivos clave:** `prisma/schema.prisma` + `prisma/migrations/20260906225213_*`, `src/cart/**`,
  `src/app.module.ts`.
- **Verificación:** `tsc`/lint limpios, `pnpm test` 1/1, smoke con curl contra `:3000` → RDS los 6
  endpoints + errores (400 sin key, 404 sku inválido, 404 patch de línea inexistente).
- **Soft-delete:** `merge`/`addItem` con variante `visible:false` → `404`. `GET /cart` **omite**
  las líneas cuya variante/producto quedó `visible:false` (la fila queda en la DB) — el cliente
  nunca ve un ítem fantasma.
- **Follow-ups:** tests e2e del carrito; commit + merge coordinado con M1.

## 2026-09-06 · Plan E2E · M1 / B1 — auth con refresh + `/v1` (rama, sin merge)

- **Qué:** rama `feat/e2e-m1-auth-refresh`. Modelo `RefreshToken` (+ migración
  `20260906222633_add_refresh_token`, **aplicada al RDS pre-prod**). `AuthService` emite par
  access (JWT 15m, claim `typ:"access"`) + refresh opaco (32B base64url, hash sha256 en DB, TTL
  30d). `POST /auth/refresh` (rota + revoca el presentado; reuso de uno revocado → revoca la
  `familyId` entera). `POST /auth/logout` (204 idempotente). `login`/`register` devuelven
  `{ accessToken, refreshToken, expiresIn }` (aditivo). `main.ts` → `enableVersioning` URI
  `['1', VERSION_NEUTRAL]` (rutas bajo `/v1` **y** sin prefijo durante el cutover; el alias se
  saca en M8). `UsersService.setActive(false)` revoca las familias del usuario. Config: env
  `JWT_ACCESS_EXPIRES_IN` / `JWT_REFRESH_EXPIRES_IN` (reemplazan `JWT_EXPIRES_IN`).
- **Por qué:** hito M1 del plan E2E — cerrar G1 (sin roles/refresh; el authenticator de la app
  re-logueaba entero).
- **Archivos clave:** `prisma/schema.prisma` + `prisma/migrations/20260906222633_*`,
  `src/auth/{auth.service,auth.controller,jwt-payload.type,jwt-auth.module,duration.util}.ts`,
  `src/auth/dto/refresh.dto.ts`, `src/main.ts`, `src/config/{configuration,env.validation}.ts`,
  `src/users/users.service.ts`, `.env.example`, `test/auth.e2e-spec.ts`.
- **Verificación:** `pnpm test` 1/1, `pnpm run test:e2e` 13/13 (incluye rotación/reuso/logout +
  prefijo `/v1`), lint limpio, smoke con curl contra `:3000` → RDS pre-prod OK.
- **Follow-ups:** merge + flag-day del `/v1` coordinado con app/agente (hoy `VERSION_NEUTRAL` deja
  todo sin romper). Commit pendiente (esperando revisión C2 de la sesión app). `admin@marketplace.dev`
  ya lo sembraba el seed. **Infra tocada aparte:** `test/jest-e2e.json` + `jest` de `package.json`
  ganan `moduleNameMapper` para el `.js` del cliente Prisma 7, y `test:e2e` corre con
  `--experimental-vm-modules` (antes el suite e2e no levantaba — pre-existente en `master`).
  `nest build` sigue necesitando borrar `tsconfig.build.tsbuildinfo` si deja `dist/` a medias
  (ver memoria `build-empty-dist-tsbuildinfo`).

## 2026-09-06 · Plan E2E cross-repo — M0 (freeze de contrato)

- **Qué:** coordinación con las sesiones `demoCompose` y `agente-mobile` del plan E2E "loop completo
  app + admin". Se congeló el contrato v1: auth con par access+refresh (access 15m, refresh opaco
  30d con rotación + detección de reuso), `/cart` persistido (precio vivo, merge `max(local,server)`),
  ciclo de vida del pedido de 7 estados + matriz de transiciones + `OrderStatusHistory`, modelo
  `Notification` propio (separa suscripción de entrega), pago Stripe test (PaymentIntent + Payment
  Sheet), `Idempotency-Key` client-origin, rutas bajo `/v1`. Se escribió el esqueleto de
  `documentacion/openapi.json` + la sección "Próxima versión (v1)" de `API.md`.
- **Por qué:** cerrar las brechas para un E2E production-ish (roles reales, pago, fulfilment con
  eventos, carrito compartido) antes de arrancar la implementación (M1).
- **Archivos clave:** `documentacion/openapi.json` (nuevo), `documentacion/API.md`, `CLAUDE.md`
  (nota "notifications = stock alerts" marcada v0 + delta M4). Plan canónico:
  `demoCompose/docs/plan-e2e.md` §6.
- **Follow-ups:** M1 (auth + refresh + `/v1` + seed `admin@marketplace.dev`) — ver `tasks.md`.
  Decisión del usuario: admin = extender la Next.js `admin/` existente, no SSR. Sin cambios de
  código todavía.

## 2026-08-29 · Reestructura de docs (layout de 4 archivos)

- **Qué:** `documentacion/` pasa a `context.md` / `plan.md` / `tasks.md` / `handoff.md`; sección
  `## Documentación` agregada a `CLAUDE.md`; `handoff-integracion-agente.md` movido a
  `reference/`. `API.md` se queda como referencia (se genera del código).
- **Por qué:** modelo común coordinado entre los 3 repos del sistema (agente-mobile,
  marketplace-backend, demoCompose) para retomar tareas desde un contexto base estable.
- **Archivos clave:** `documentacion/{context,plan,tasks,handoff}.md`, `CLAUDE.md`,
  `src/products/sku.util.ts` (path del comentario actualizado).
- **Follow-ups:** merge coordinado de `chore/docs-restructure` en los 3 repos (sin merge unilateral).

## 2026-08-27 · Prueba conjunta end-to-end 4/4 + fix `GET /orders`

- **Qué:** las 3 sesiones (backend, Android, agente A2A) corrieron un test e2e contra el RDS:
  nombres ES en vivo, auth real, flujo Home→carrito→`POST /orders`→pago, chat A2UI con
  `VariantSelector`. Pasaron los 4 puntos. Hallazgo corregido en el acto: `GET /orders` y la
  respuesta de `POST /orders` ahora incluyen `items[].variant: { color, sku }` (Android mostraba
  "Color: -").
- **Por qué:** validar la rama `feat/catalog-promo-sku-es-names` antes del merge a master / redeploy.
- **Archivos clave:** commits `554cc70`, `f06fae4`.
- **Follow-ups:** (merge a `master` ya hecho, `3ab22f4`…`f06fae4`) redeploy de `api.brodriro.dev`;
  `400` de stock con `insufficientStockSkus`; job de limpieza de usuarios throwaway. Ver `tasks.md`.

## 2026-08-27 · Fix seed: buscar variantes por (producto, color)

- **Qué:** el seed buscaba variantes por SKU derivado del nombre; al traducir nombres a ES no las
  encontró y creó 74 variantes duplicadas (79→153). Se borraron las 74 (ninguna en pedidos) y el
  seed ahora matchea por `(productId, color)`.
- **Por qué:** efecto colateral de la traducción de nombres; el seed debía seguir siendo idempotente.
- **Archivos clave:** `prisma/seed.ts`, commit `ae95df8`.
- **Follow-ups:** ninguno.

## 2026-08-27 · Promo codes + autogeneración de SKU + nombres de producto en español

- **Qué:** módulo `src/promo-codes/` (`GET /promo-codes/:code`, solo validación, público). `sku`
  opcional en `POST /admin/products` y `.../variants` con autogeneración + endpoint
  `regenerate-sku`. Migración de datos que traduce 19 `products.name` EN→ES (solo `name`).
  Migraciones `20260827120000` + `20260827130000` escritas a mano y **aplicadas al RDS** + seed.
- **Por qué:** pedidos de `agente-mobile` (promo codes) y `mobile` (SKUs editables en el panel) +
  del usuario (catálogo en español).
- **Archivos clave:** `prisma/schema.prisma`, `prisma/migrations/20260827*`, `src/promo-codes/`,
  `src/products/sku.util.ts`, `prisma/seed.ts`, `prisma/seed-data/feed.json`, `documentacion/API.md`,
  commit `3ab22f4`.
- **Follow-ups:** merge a `master` hecho después (`master` ya los contiene); falta redeploy de
  `api.brodriro.dev` (el 2026-08-27 el deployado seguía sin estos endpoints).

## 2026-08-26 · Panel admin — CRUD de productos y categorías

- **Qué:** módulos del dashboard admin (sub-app `admin/`) con operaciones CRUD para productos y
  categorías.
- **Archivos clave:** commit `f855488`, `admin/`.
- **Follow-ups:** `admin/` mantiene su propio `CLAUDE.md` / `AGENTS.md`, fuera del alcance de estos docs.
