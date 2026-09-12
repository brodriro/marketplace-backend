# tasks.md — marketplace-backend

> Tareas activas. Al completar una: moverla a [`handoff.md`](handoff.md) (entrada nueva arriba).
> Contexto y decisiones abiertas en [`plan.md`](plan.md).

## Retomar acá

**Plan E2E cross-repo — HILO CERRADO 2026-09-10.**

M0→M8 code-complete en `origin/master @ 0213307` (PR #10 = cutover a `/v1` puro + remoción del alias
`VERSION_NEUTRAL`; PR #9 = docs). 13/13 migraciones en el **RDS pre-prod** (verificadas).
`PAYMENT_PROVIDER` default `bypass` (pago provider-agnostic desde M5 — NO Stripe obligatorio).

- **Entregables:** ensayo `e2e-M8-20260910-01` (2026-09-10, 3 sesiones, 1 pasada) **y** una corrida
  adicional `e2e-M8-20260910-02` pedida por el usuario esa misma noche (post-cierre, sin resetear
  datos) — **ambas 6/6 criterios §4 del loop verdes** (app-side por demoCompose, server-side acá).
  Readout `-01`: `demoCompose/docs/screenshots/e2e-M8/README`. Readout `-02`: detalle en
  `handoff.md` + `demoCompose/docs/plan-e2e.md` §7.4 + `docs/screenshots/e2e-M8-02/`.
- **Decisión del usuario (2026-09-10): NO hay deploy de prod. Todo corre en localhost.** El cutover a
  `api.brodriro.dev` queda **descartado** — el dominio ni siquiera resuelve. `:3000` sirve `/v1`
  sobre el RDS pre-prod; `demoCompose/buildTypes.gradle` se queda en `192.168.31.63:3000/v1/`. Esto
  es sobre código/deploy — no impidió la corrida `-02` (smoke-test adicional, no reabre el hilo).
- **Repo limpio post-corridas:** `master` local sincronizado con `origin/master`; ramas y worktrees
  zombie (`feat/e2e-m3-admin`, `chore/docs-handoff-restructure`, `chore/docs-sync`,
  `feat/e2e-m5-payments`, `feat/e2e-m8-v1-cutover`, `feat/catalog-promo-sku-es-names`) borrados —
  todas eran ancestros de `origin/master`, ya mergeadas vía PR.
- **No queda nada activo del hilo E2E.** Los follow-ups que sobreviven son no bloqueantes — ver "todo".
- **Bonus cerrado 2026-09-11:** e2e dedicado de `track_order`, 7/7 estados de `OrderStatus`
  verificados (nativo + chat). Detalle en [`handoff.md`](handoff.md).
- **Bonus cerrado 2026-09-11/12:** los 2 últimos follow-ups del backlog (`discountCode` aplicado al
  `total` en `POST /orders` + stemming de color en `search`), más 2 rondas de coordinación con
  `agente` que salieron de eso (`code: "invalid_discount_code"` estructurado en el 404, y
  `PATCH /cart` para persistir `discountCode` entre turnos de checkout). `agente` y `mobile` ya
  confirmaron sus lados. Detalle completo en [`handoff.md`](handoff.md) (4 entradas).

## doing

_(nada activo — ver "Retomar acá" y [`handoff.md`](handoff.md) para lo último cerrado.)_

## E2E — lane de `@backend` (contrato congelado en `plan-e2e.md` §6)

- **M0 · Freeze de contrato.** ✅ 2026-09-06. `documentacion/openapi.json` + sección v1 de `API.md`.
- **M1 · B1 · Auth con refresh.** ✅ `master` (`9f75272`). Verificado e2e (checkpoint #1).
- **M2 · B2 · Dominio carrito.** ✅ `master` (`9f75272`). Dedupe real de `Idempotency-Key` → llegó en M5.
- **M3 · B6 · Admin (parte 1) + audit.** ✅ `master` (PR #2). `AuditLog` + `AuditInterceptor` en los
  5 `Admin*Controller` + `GET /admin/audit-logs`; `admin/` cutover a `/v1` + refresh-on-401.
  §7.1 tramo admin cerrado 2026-09-09 (`e2e-M4-20260909-01`).
- **M4 · B3 + B5 · Ciclo de vida + eventos.** ✅ `master` (PRs #2/#3). 7 estados + matriz de
  transiciones + `OrderStatusHistory`; `Notification` (order_status_changed / back_in_stock /
  price_drop); interceptor `[e2e]` global. Loop C4/C5/C10 verde. Migraciones aplicadas al RDS.
- **M5 · B4 · Pago (provider-agnostic).** ✅ `master` (PR #7). `PaymentProvider` + `bypass` (default,
  no cobra) / `stripe`; `IdempotencyKey` (lock + replay por `(userId,key)+requestHash`);
  `insufficientStockSkus` en el `409`; `markPaidBySystem` (webhook / confirm / sweep `@Cron`).
  e2e conjunto `e2e-M5-20260909-01` verde (nativo C3 + hand-off C6/A2).
- **M6 · B7 · i18n del seed (acotado).** ✅ `master`.
  - Search por tokens sobre `name` / `description` / color de variante visible (PRs #4 + #8).
  - Datos es-419: migración `20260909180000_i18n_es419_catalog` (categorías + `store` +
    `colors.name` + `product_variants.color`) + `seed-data/feed.json` (PR #8). Aplicada al RDS
    2026-09-10. Stemming de género en el match de color (`"remera negra"` → `Negro`) cerrado
    2026-09-11, ver `handoff.md`.
- **M7 · B6 · Admin polish.** ✅ `master` (PR #8). `GET /admin/analytics` (+`/low-stock`),
  `/admin/monitor/{notifications,stock-alerts}`, `/admin/agent-config`; páginas Next.js. Sesión
  admin **dual-mode**: Bearer + cookie httpOnly + CSRF double-submit (`AdminCsrfGuard` `APP_GUARD`).
  _Follow-up_: test runtime del login por cookie del panel contra un backend levantado.
- **M8 · B8 + deploy.** ✅ Cerrado 2026-09-10 (parcial — deploy de prod descartado por el usuario).
  - ✅ Cutover `/v1` (remoción de `VERSION_NEUTRAL`) — `origin/master @ 0213307` (PR #10).
  - ✅ Ensayo E2E del loop completo — `e2e-M8-20260910-01`, 6/6 §4. **Entregable final del hilo.**
  - ✅ `@nestjs/swagger` → `GET /docs` + `pnpm run openapi:dump` — cerrado 2026-09-11, ver `handoff.md`.
  - ❌ Redeploy `api.brodriro.dev` — **descartado**: sin deploy de prod, todo localhost.

## blocked

- _(nada — el redeploy de `api.brodriro.dev` lo descartó el usuario el 2026-09-10; sin deploy de
  prod, todo localhost. El cutover de `MARKETPLACE_BASE_URL` que dependía de esto queda sin efecto.)_

## todo

- **Job de limpieza de usuarios throwaway (opción B).** `agent+<contextId>@agent.brodriro.dev`
  por sesión A2A, de antes de M1/A4 (ver corrección en `reference/handoff-integracion-agente.md`);
  nada los borra. Sin dueño.
- **`GET /products/search` no matchea `store` ni nombre de categoría** (solo `name` / `description`
  / color de variante — ver M6 arriba). Detectado 2026-09-12 chequeando un reporte de `agente` que
  resultó ser otra cosa (ver Notas); no bloquea nada (`agente` tiene RC1 como red de seguridad para
  "no encontré nada"). Sin dueño ni caso concreto que lo dispare todavía.

## Notas

- Cliente Android: el fallback de `GET /me` (§16) no se auto-recupera tras un fallo transitorio.
  Tarea de `demoCompose`, referencia cruzada.
- **2026-09-12 · falsa alarma de `agente`:** reportaron 2 pendientes ("nuestro" lado) que resultaron
  ser su propio `tasks.md` desactualizado, no gaps reales: (1) el search ya matchea `description`
  desde M6 (verificado en vivo: "mecánico" → encuentra "Teclado Gamer" por su descripción), y (2) el
  `e2eRunId` en `AuditLog` para `PATCH /admin/orders/:id/status` es M3, cerrado 2026-09-09. `agente`
  confirmó y corrigió su lado (`master @ 6fb0897`). Sin acción de nuestro lado más allá del ítem de
  `store`/categoría de arriba, que sí es real pero no relacionado con lo que reportaron.
