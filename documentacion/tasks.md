# tasks.md — marketplace-backend

> Tareas activas. Al completar una: moverla a [`handoff.md`](handoff.md) (entrada nueva arriba).
> Contexto y decisiones abiertas en [`plan.md`](plan.md).

## Retomar acá

**Plan E2E cross-repo activo.** M0+M1+M2 en `master` (`9f75272`), verificados e2e por la sesión app
(checkpoint #1). **M3** (admin) en curso en `feat/e2e-m3-admin` — ver "doing". Orden acordado
M3→M4→M5 en serie. Contrato canónico en `demoCompose/docs/plan-e2e.md` §6; `documentacion/openapi.json`
lo refleja.

Servers de prueba levantados: backend `node dist/main.js` en `:3000` y admin `pnpm run dev` en
`:3500` (PIDs en `%TEMP%\mb-m1.pid` / `%TEMP%\mb-admin.pid`), ambos contra el RDS pre-prod.

Pendiente de antes: rama `chore/docs-restructure` sin merge y el **redeploy de `api.brodriro.dev`**
desde `master` (ver blocked).

## doing

- **M4 · B3 + B5 · Ciclo de vida + notificaciones** — en `feat/e2e-m4-lifecycle @ 9dd1b23` (cortada
  de `feat/e2e-m3-admin` `c94c6cd`), pusheada, sin merge. Commits: `c056b8e` (Capa 2 correlación) +
  `9dd1b23` (B3/B5). **Código completo, build/lint/tsc/unit verdes.**
  **Migraciones aplicadas al RDS pre-prod (2026-09-08)** (`20260907130000_add_audit_log_meta` +
  `20260907140000_add_order_lifecycle_and_notifications`, `migrate deploy` OK, verificado por query).
  Falta: **reiniciar `:3000` con el código de M4** (proceso del lado del usuario) → ahí demoCompose
  corre C4/C5/C10 y agente corre A3. e2e backend de orders/notif: sin specs, verificación app-side.
  Detalle:
  - Enum `OrderStatus` 7 estados (`processing`→`preparing` + `paid`/`cancelled`/`refunded`),
    `OrderStatusHistory` + fila génesis en `POST /orders`, matriz `src/orders/order-transitions.ts`
    → `409 { error, allowedTransitions }`, `preparing→shipped` exige tracking, `→refunded` exige
    `reason`, restock en `cancelled`/`refunded`, `timeline` del historial real (`+actorType`).
  - `POST /orders/:id/cancel` (buyer, solo `pending_payment`).
  - `Notification` + `NotificationType`, `GET /notifications` wire §6.4, `PATCH /:id/read`,
    `POST /notifications/read-all`, triggers `order_status_changed` / `back_in_stock` / `price_drop`
    (los 2 últimos por suscripción `StockAlert`).

- **M3 · B6 · Admin** — en `feat/e2e-m3-admin` `c94c6cd`, pusheado, sin merge. Backend: `AuditLog` + migración
  `20260907005057_add_audit_log` (RDS pre-prod), `AuditInterceptor` en los 5 `Admin*Controller`
  (registra POST/PATCH/DELETE exitosos), `GET /v1/admin/audit-logs` paginado. App Next.js `admin/`:
  cutover del base URL a `/v1`, `api.login` devuelve el par + `api.logout`, refresh-on-401 con
  retry único (`api-client.ts`), `.env.local` → `192.168.31.63:3000/v1`, `CORS_ORIGINS` del backend
  suma el origen LAN del admin. Build admin verde, e2e backend 13/13, smoke OK (login admin +
  PATCH variante → fila de auditoría). Falta: verificación criterio #1/#2 del loop por la sesión
  app + commit + merge. Sesión cookie+CSRF → diferida a M7 (decisión del usuario: opción B).

## E2E — lane de `@backend` (secuenciada; contrato congelado en `plan-e2e.md` §6)

- **M1 · B1 · Auth con refresh.** ✅ en `master` (`9f75272`). Verificado e2e por la app (checkpoint #1).
- **M2 · B2 · Dominio carrito.** ✅ en `master` (`9f75272`). Verificado e2e por la app (checkpoint #1:
  carrito de la app = carrito del backend). Pendiente: dedupe real de `Idempotency-Key` (M5).
- **M3 · B6 · Admin (parte 1).** 🚧 en `feat/e2e-m3-admin` (ver "doing"). `AuditLog` + interceptor +
  `GET /admin/audit-logs`; app Next.js `admin/` cutover a `/v1` + refresh-on-401. Productos CRUD y
  lista de Pedidos ya existían. Sesión cookie+CSRF → M7 (opción B).
- **M4 · B3 + B5 · Ciclo de vida + eventos.** 🚧 código completo + migraciones aplicadas al RDS
  (ver "doing"). Falta reinicio de `:3000` con código M4 + verificación e2e app-side.
- **M5 · B4 · Pago Stripe test.** SDK `stripe`, PaymentIntent en `POST /orders`,
  `POST /webhooks/stripe` (raw body), `POST /orders/:id/confirm` (demo), tabla `IdempotencyKey`,
  barrido de `pending_payment` vencidos, `insufficientStockSkus` en el `409` de stock. Depende de
  M1 + M4.
- **M6 · B7 · i18n del seed (acotado).** Categorías/`store`/descripciones/colores → es-419; search
  matchea `description`. Paralelo desde M0.
- **M7 · B6 · Admin polish.** Analytics, monitor de alertas, config del agente, página de
  `AuditLog` (la tabla + captura ya están en M3), **sesión admin cookie httpOnly + CSRF** (movida
  desde M3 por decisión del usuario). Depende de M3.
- **M8 · B8 + deploy.** `@nestjs/swagger` → `GET /docs` + `pnpm run openapi:dump`. Migraciones al
  RDS en orden + redeploy `api.brodriro.dev` + ensayo E2E del loop. Depende de M2..M7.

## blocked

- **Redeploy de `api.brodriro.dev` desde el `master` actual.**
  Bloquea: endpoint `GET /promo-codes/:code` y SKU opcional del panel **en prod**; `agente-mobile`
  espera esto para que `HttpPromoCodeRepository` ande contra prod y no solo contra `:3000` local.
  El merge a `master` ya está hecho y pusheado; el RDS ya tiene las migraciones `20260827120000`
  + `20260827130000` → el redeploy no necesita paso de migración. El 2026-08-27 el proceso
  deployado corría código previo — falta verificar si sigue así. Espera: OK del usuario / acceso al deploy.

## todo

- **`400` de stock insuficiente → campo estructurado.** Agregar `insufficientStockSkus: string[]`
  al body del error de `POST /orders` (hoy solo el texto `Stock insuficiente para <sku>`).
  Coordinar el cambio con `agente-mobile` (parsea el string best-effort hoy). Sin dueño de fecha.
- **Job de limpieza de usuarios throwaway (opción B).** `POST /auth/register` del agente crea
  `agent+<contextId>@agent.brodriro.dev` por sesión A2A; nada los borra, `users` acumula.
  Sin dueño.
- **Merge coordinado de `chore/docs-restructure`** en los 3 repos (agente-mobile y demoCompose ya
  lo tienen en rama). Sin merge unilateral.

## Notas

- Cliente Android: el fallback de `GET /me` (§16) no se auto-recupera tras un fallo transitorio.
  Es tarea del repo `demoCompose`, se anota acá solo como referencia cruzada.
