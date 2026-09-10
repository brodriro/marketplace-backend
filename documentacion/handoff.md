# handoff.md — marketplace-backend

> Log reverso de tareas completadas (más reciente arriba). Entradas de 3-6 líneas:
> **fecha · qué · por qué · archivos clave · follow-ups**. Se mantienen ~20 entradas / ~90 días —
> el archivo real es `git log`. El detalle profundo de la integración con el agente está en
> [`reference/handoff-integracion-agente.md`](reference/handoff-integracion-agente.md).

---

## 2026-09-09 · Plan E2E · M6/B7-data + M7/B6 admin polish (rama `feat/e2e-m7-admin-polish`)

- **`feat/e2e-m7-admin-polish`** (de `origin/master 57f9d22`), pusheada, sin merge. Commits:
  `fe79cbe` (endpoints analytics/monitor/agent-config) · `a7ae19b` (M6/B7-data) · `dd32d4a` (UI
  admin + fix drift M4/M6) · `205b0df` (backend cookie/CSRF) · `816a741` (admin/ a modo cookie).
- **M6/B7-data:** migración `20260909180000_i18n_es419_catalog` (categorías, `products.store`,
  `colors.name` + `product_variants.color` → es-419) **+ `feed.json`** + `search` matchea color de
  variante. **Migración SIN aplicar al RDS** (classifier bloqueó `migrate deploy`) — acción del
  usuario.
- **M7/B6 backend:** `GET /admin/analytics` (+`/low-stock`), `GET /admin/monitor/{notifications,
  stock-alerts}`, `GET /admin/agent-config` (checksum md5 del catálogo). Users mgmt ya estaba.
  Sesión admin **dual-mode**: se agregó cookie httpOnly + CSRF (`POST /admin/auth/login|refresh|
  logout`, `GET /admin/auth/session`, `JwtStrategy` lee Bearer O cookie, `AdminCsrfGuard`
  double-submit solo para cookie). Bearer intacto. Smoke curl del flujo cookie/CSRF: login→3
  cookies, GET con cookie→200, PATCH sin `X-CSRF-Token`→403, con token→200, no-admin→403.
- **M7/B6 UI (`admin/`):** páginas `/analytics` `/monitor` `/audit-logs` `/agent-config` +
  nav; fix drift: `OrderStatus` a 7 estados, `ADMIN_ALLOWED_TRANSITIONS` (matriz §6.3),
  `KNOWN_COLORS` es-419, `status-badge` 7 estados, `orders/[id]` usa la matriz. `next build` verde.
  ⚠️ El login por cookie del panel **no se probó en runtime** (sin click-through acá) — testear
  contra un backend levantado; si falla, el backend sigue soportando Bearer.
- **Coordinadas del 2026-09-09** (`:3000` = master, runId `e2e-M4-20260909-01`): M3 §7.1 (PATCH
  admin price 99.99→89.99 + variant stock 20→33, delta confirmado read-only en la app,
  `AuditLog.meta.e2eRunId` en las 6 PATCH → §7.1 M3 fila `y`) + C4/C5 (§4 #4: `daf1ad38`
  `preparing`→`shipped`+tracking → 2 `Notification order_status_changed`, deep-link a pedido OK;
  §4 #5: restock crossbody-bag-green 0→10 → `Notification back_in_stock`, `StockAlert` `notified`,
  deep-link a producto OK). demoCompose: los 2 escenarios ✅.
- **Follow-ups:** aplicar la migración `20260909180000` al RDS; merge del PR; test runtime del
  login por cookie; `"remera negra"` (fem.) necesita stemming.

## 2026-09-09 · Plan E2E · M5/B4 — e2e conjunto CERRADO (3 tiers)

- **Corrida `e2e-M5-20260909-01`, 2 escenarios contra `:3000` (`feat/e2e-m5-payments @ ae5564c`,
  `PAYMENT_PROVIDER=bypass`, RDS pre-prod):**
  - **Nativo (C3):** app → carrito → checkout → PaymentScreen → confirm bypass → `PaymentSuccessScreen`.
    `mb-3000.log`: `POST /v1/orders 201` + `POST /v1/orders/<id>/confirm 200`. Order `b9df9d26…` →
    `paid`; `OrderStatusHistory` `paid/system.meta.e2eRunId = "e2e-M5-20260909-01"` (verificado en RDS).
  - **Hand-off del chat (C6/A2):** agente `checkout` → `POST /orders 201` (crea `daf1ad38…`); CTA
    `client:navigate` interceptado por el VM → PaymentScreen → confirm 200 (app). Order `daf1ad38…`
    → `paid` + fold-in estampado.
  - 3 tiers verdes (app logcat + `:2500` + `mb-3000.log`), cero 5xx.
- **Fix `ae5564c`:** la respuesta de `POST /orders` traía `order.paymentIntentId: null` (snapshot
  de dentro de la tx) — ahora se refleja el id en memoria tras el update.
- **Follow-up M8:** el `MarketplaceHttpClient` del agente pega a `POST /orders` **sin `/v1`** —
  anda por el alias `VERSION_NEUTRAL`, que M8 remueve. Anotado para `@agente`.
- **Pendiente:** merge de `feat/e2e-m5-payments` (`@ ae5564c`) → `master` (PR). C3/C6 de demoCompose
  van por su propio PR (`feat/e2e-c3-c6-checkout`).

## 2026-09-08 · Plan E2E · M5/B4 pago (provider-agnostic, bypass por defecto) — rama `feat/e2e-m5-payments`

- **`feat/e2e-m5-payments`** (cortada de `origin/master 59707b4`), pusheada, sin merge. Código
  completo, `tsc` + `nest build` + eslint + jest verdes. Migración **aplicada al RDS pre-prod**
  (`20260908180000`, verificada por query). `:3000` levantado con el código M5.
- **Provider-agnostic** (decisión del usuario 2026-09-08): el pago está detrás de
  `PaymentProvider` (`src/payments/payment-provider.ts`). `PAYMENT_PROVIDER` elige la impl:
  - **`bypass`** (default, `bypass.provider.ts`) — sin servicio externo, `clientSecret` sintético,
    `supportsWebhook=false`, `POST /orders/:id/confirm` marca `paid` sin verificar cobro. **No
    cobra.** Documentado en `plan.md` → "Pendiente para producción": cambiar a proveedor real
    antes de F&F/prod.
  - **`stripe`** (`stripe.provider.ts`) — Stripe test real; las 3 `STRIPE_*` keys pasan a ser
    obligatorias (Zod).
- **Schema** (`20260908180000`, aditivo, aplicado): `IdempotencyKey` (`@@unique([userId,key])`,
  `requestHash`, `response Json`), `Order.paymentIntentId`, `OrderStatusHistory.meta` (fold-in
  `e2eRunId` acordado con demoCompose).
- **Código:** `@nestjs/schedule` + `stripe` (sólo lo usa `stripe.provider`). `main.ts` →
  `rawBody:true`. `OrdersService.create` reescrito: idempotencia (lock por la fila
  `IdempotencyKey`, replay por `(userId,key)`+`requestHash` normalizado, `409` sin
  `insufficientStockSkus` si el body difiere), stock valida-todo-antes → `409 { insufficientStockSkus }`,
  `payment.createIntent()` + `{ order, payment { provider, clientSecret, publishableKey } }` si
  `PAYMENTS_ENABLED`. `markPaidBySystem` (idempotente) para webhook/confirm/sweep.
  `WebhooksController` (`VERSION_NEUTRAL`; `404` si el provider no expone webhooks).
  `OrderPaymentSweepService` (`@Cron` c/min). Unit: `orders.service.spec.ts` (idempotencia + stock).
- **Follow-ups:** `discountCode` se acepta y hashea pero no se aplica al `total` (integración
  `promo-codes` = follow-up). Regenerar `openapi.json` es M8 (ya refleja el contrato M5 con
  `provider: "stripe"` — ahora `provider` puede ser `"bypass"`). **Antes de F&F/prod:** proveedor
  real + webhook + `STRIPE_DEMO_CONFIRM=false` (ver `plan.md`).

## 2026-09-08 · Plan E2E · M6/B7 search por tokens (rama `feat/e2e-m6-i18n-seed`)

- **`feat/e2e-m6-i18n-seed @ aa877cc`** (cortada de `origin/master 829e0e7` = M0..M4 mergeado),
  pusheada, sin merge.
- `ProductsService.search`: `q` se parte en tokens y cada uno tiene que aparecer en `name` **o**
  `description` (`AND` de `OR`s, insensible a mayúsculas). Antes matcheaba la frase completa contra
  `name` solo — "bolso de cuero" / "zapatillas correr" no encontraban nada. Sin `q` (o solo
  espacios) no agrega filtro de texto; category/price/color intactos.
- `src/products/products.service.spec.ts` nuevo — 4 casos (tokenización, espacios, sin `q`,
  filtros combinados). `nest build` + `tsc -p tsconfig.build.json` + eslint verdes; smoke contra el
  RDS pre-prod (instancia temporal `:3001`): 5 consultas multi-palabra → 1 resultado correcto c/u.
- **Pendiente de B7 (parte de datos, no hecha):** `categories.name` / `products.description` /
  display-names de `Color` → es-419 + migración de datos + `seed-data/feed.json`. Sin eso "remera
  negra" no matchea. Toca el RDS pre-prod → espera decisión del usuario.

## 2026-09-07 · Plan E2E · M3 commiteado/pusheado + M4/B3+B5 código (rama `feat/e2e-m4-lifecycle`)

- **M3 / B6:** el WIP que estaba sin commitear se cerró en `feat/e2e-m3-admin` (`c94c6cd`) y se
  pusheó a `origin`. Sin merge — espera verificación app-side + el PATCH pre-prod de la prueba
  coordinada §7.1 (lo dispara el usuario, ninguna sesión en background).
- **Correlación E2E Capa 2** (`c056b8e`, plan-e2e.md §7.2): `AuditInterceptor` lee `X-E2E-Run`
  (regex `^e2e-M\d+-\d{8}-\d{2}$`) → `AuditLog.meta.e2eRunId`; cliente admin `rawRequest()` manda
  el header si `NEXT_PUBLIC_E2E_RUN`. Migración `20260907130000_add_audit_log_meta` (aditiva) **sin
  aplicar**.
- **M4 / B3 + B5** (rama `feat/e2e-m4-lifecycle`, código completo, sin aplicar migración, sin merge):
  - **Schema:** enum `OrderStatus` 7 estados (`processing`→`preparing`, +`paid/cancelled/refunded`),
    enum `OrderActorType`, `OrderStatusHistory`, enum `NotificationType`, `Notification`. Migración
    `20260907140000_add_order_lifecycle_and_notifications` (hand-written: `ALTER TYPE` + 2 tablas +
    FKs + backfill de fila génesis por pedido existente).
  - **B3:** `src/orders/order-transitions.ts` (matriz §6.3) → `409 { error, allowedTransitions }`.
    `POST /orders` escribe fila génesis. `updateStatus` (admin): valida matriz, exige tracking en
    `→shipped` y `reason` en `→refunded`, restock solo en `cancelled` (§6.3), escribe historial
    (`actorType: admin`, `actorId`), dispara notificación. `PATCH /admin/orders/:id/status` sin
    `status` sigue siendo update de tracking solo. `POST /orders/:id/cancel` (buyer, solo
    `pending_payment`, `{reason?}`). `timeline` de `GET /orders/:id` sale de `OrderStatusHistory`
    (`+actorType`).
  - **B5:** `NotificationsService` reescrito — `Notification` para entrega, `StockAlert` sigue
    siendo la suscripción. `GET /notifications` serializa el wire §6.4 (`read`, `deepLink`, `data`,
    `product` solo en back_in_stock/price_drop, `notified` espejo). `POST /notifications/read-all`
    (`{count}`). Triggers: `emitOrderStatusChanged` (post-tx, best-effort), `emitBackInStock`
    (`ProductsService.updateVariant`, stock 0→>0), `emitPriceDrop` (`ProductsService.update`, baja
    de precio). Los `emit*` nunca lanzan.
- **Verificación:** `tsc -p tsconfig.build.json` exit 0, `nest build` verde, eslint verde, unit 1/1.
  **NO corrido:** e2e (sin specs backend de orders/notif — la verificación es app-side por C4/C5).
- **Migraciones aplicadas al RDS pre-prod (2026-09-08):** `20260907130000_add_audit_log_meta` +
  `20260907140000_add_order_lifecycle_and_notifications` vía `prisma migrate deploy`. `migrate
  status` → "up to date" (11/11). Verificado por query directa: `audit_logs.meta`, tablas
  `order_status_history` / `notifications`, enums `OrderStatus` (7 valores, `processing` renombrado),
  `OrderActorType`, `NotificationType`; backfill de fila génesis corrió dentro del deploy.
- **`:3000` sirviendo M4 (2026-09-08):** `node dist/main.js` desde el worktree, contra el RDS
  pre-prod. Smoke autenticado OK: `GET /v1/orders/:id` → `timeline:[{status,at,actorType}]`,
  `item.variant.product` anidado, rutas M4 mapeadas. Pedidos preexistentes: génesis backfilled
  `actorType:"system"`.
- **Capa 2 — interceptor global (`4371187`):** `E2eRunLoggerInterceptor` (`APP_INTERCEPTOR`) loguea
  `[e2e] <runId> <method> <path> <status>` por request con header `X-E2E-Run` válido, en TODA ruta.
  Cubre el tramo agente→backend en rutas no-admin (carrito/pedidos de usuario) que no pasan por
  `AuditInterceptor`. No-op sin el header. `AuditLog.meta.e2eRunId` sigue siendo la evidencia del
  tramo admin. §7.2/§7.3 actualizados por demoCompose para reflejar "log line, no fila DB" en
  rutas no-admin.
- **E2E de correlación M4 (C10, 2026-09-08):** demoCompose disparó el turno real
  (`runId=e2e-M4-20260908-01`, "agrega 1 Auriculares Pro negro al carrito"). `mb-3000.log` capturó
  `[e2e] e2e-M4-20260908-01 POST /v1/cart/items 201` + los `GET /v1/cart` alrededor. Tramo
  agente→backend ✅. Falta el grep de `:2500` (agente) para que demoCompose flipee §7.1/§7.4 M4 a
  `coord-test-ready=y`.
- **Follow-ups:** el PATCH admin de M3 para el tramo admin de §7.1; merges de `feat/e2e-m3-admin` +
  `feat/e2e-m4-lifecycle` a master tras el sign-off e2e; specs e2e backend de orders/notif;
  regenerar `openapi.json` (M8); B4/M5 (Stripe, toca `pending_payment → paid`); B7 reseed es-419
  (RC1 — "remera negra" no matchea `name` en inglés).

## 2026-09-07 · Plan E2E · M1+M2 mergeados a master + M3/B6 admin (rama)

- **Merge:** `feat/e2e-m2-cart` (`9f75272` = M0+B1+B2) → `master`, fast-forward, pusheado a
  `origin/master`. La sesión app verificó el checkpoint #1 e2e en emulador (auth+refresh, `/v1`,
  carrito de la app == carrito del backend) antes del merge. Ramas de feature borradas.
- **M3 / B6 (en `feat/e2e-m3-admin`, sin merge):**
  - Backend: modelo `AuditLog` + migración `20260907005057_add_audit_log` (RDS pre-prod).
    `AuditInterceptor` (`src/admin/audit/`) en los 5 `Admin*Controller` — escribe una fila por
    POST/PATCH/DELETE con 2xx (`actorId/email`, `resource`=clase, `action`=handler, `entityId`,
    `changes`=body con password/tokens redactados). `GET /v1/admin/audit-logs` paginado
    (`AdminAuditController`, `?page/pageSize/resource/actorId`). Nunca tumba la request si falla.
  - App Next.js `admin/`: `api-client.ts` → base URL `/v1`, `api.login` devuelve `{accessToken,
    refreshToken, expiresIn}`, `api.logout` (POST `/auth/logout`), **refresh-on-401 con retry único**
    y guard de refresh en vuelo. `auth.ts` guarda el par (`setTokens`/`clearTokens`). `.env.local`
    → `http://192.168.31.63:3000/v1`. Backend `CORS_ORIGINS` suma `http://192.168.31.63:3500`.
  - Productos CRUD + lista/detalle de Pedidos **ya existían** en la app admin — M3 no los reescribe.
  - **Sesión cookie httpOnly + CSRF: diferida a M7** (decisión del usuario, opción B: el admin
    adopta `/auth/refresh` con el JWT en `localStorage`, mínimo cambio).
- **Verificación:** admin build verde, backend e2e 13/13 + unit 1/1 + lint, smoke: login admin por
  `/v1/auth/login` → PATCH stock de variante → fila en `audit_logs` con el actor y el body; los GET
  no se auditan.
- **Follow-ups:** verificación criterio #1/#2 del loop por la sesión app (edita stock/precio en el
  admin → la app lo ve); commit + merge de `feat/e2e-m3-admin`; endurecer sesión admin en M7.

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
