# tasks.md — marketplace-backend

> Tareas activas. Al completar una: moverla a [`handoff.md`](handoff.md) (entrada nueva arriba).
> Contexto y decisiones abiertas en [`plan.md`](plan.md).

## Retomar acá

**Plan E2E cross-repo — M0→M8 COMPLETOS (código).** Estado al 2026-09-10:

- **En `master` (`ef97de5`):** M0..M4 (PRs #2/#3/#4), M6/B7 search por tokens (PR #4),
  M5 pago provider-agnostic con `bypass` por defecto (PR #7), M6/B7 datos i18n es-419 + M7/B6
  admin polish + sesión admin cookie httpOnly/CSRF (PR #8).
- **Pusheadas, sin merge — el PR lo abre el usuario:**
  - `feat/e2e-m8-v1-cutover @ 3309fb6` — M8 · remoción del alias `VERSION_NEUTRAL`; la API vive
    solo bajo `/v1` (rutas sin prefijo → 404; el webhook del proveedor conserva su ruta propia).
  - `chore/docs-handoff-restructure @ 31ede3a` — convención de compresión de `handoff.md`
    (10 completas + 1 línea) + entrada M8 + este `tasks.md`/`plan.md`.
- **Migraciones RDS pre-prod al día (13/13, verificadas):** `_add_audit_log`,
  `_add_audit_log_meta`, `_add_order_lifecycle_and_notifications`, `20260908180000`
  (payments / `IdempotencyKey` / `Order.paymentIntentId` / `OrderStatusHistory.meta`),
  `20260909180000_i18n_es419_catalog`.
- **Ensayo del loop `e2e-M8-20260910-01` (2026-09-10):** 6/6 criterios §4 verdes (app-side por
  demoCompose, server-side acá; readout en `demoCompose/docs/screenshots/e2e-M8/README`).

**Falta (todo del usuario / post-merge):** ver "blocked" y "todo".

## doing

- _(nada en progreso)_

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
    2026-09-10. _Follow-up_: `"remera negra"` (fem.) todavía necesita stemming para matchear.
- **M7 · B6 · Admin polish.** ✅ `master` (PR #8). `GET /admin/analytics` (+`/low-stock`),
  `/admin/monitor/{notifications,stock-alerts}`, `/admin/agent-config`; páginas Next.js. Sesión
  admin **dual-mode**: Bearer + cookie httpOnly + CSRF double-submit (`AdminCsrfGuard` `APP_GUARD`).
  _Follow-up_: test runtime del login por cookie del panel contra un backend levantado.
- **M8 · B8 + deploy.** ⏳ Parcial.
  - ✅ Cutover `/v1` (remoción de `VERSION_NEUTRAL`) — `feat/e2e-m8-v1-cutover @ 3309fb6`, sin merge.
  - ✅ Ensayo E2E del loop completo — `e2e-M8-20260910-01`, 6/6 §4.
  - ⏳ `@nestjs/swagger` → `GET /docs` + `pnpm run openapi:dump` — **no hecho** (ver "todo").
  - ⏳ Redeploy `api.brodriro.dev` + migraciones en orden — **no hecho** (ver "blocked").

## blocked

- **Redeploy de `api.brodriro.dev` desde el `master` actual.** El merge a `master` de M0..M7 ya
  está; el RDS ya tiene todas las migraciones (13/13). Bloquea: endpoint `GET /promo-codes/:code`
  + SKU opcional del panel + todo M1..M7 **en prod**, y la re-verificación del loop post-redeploy.
  Espera: OK del usuario / acceso al deploy. Tras el redeploy: cutover de `MARKETPLACE_BASE_URL`
  (lo coordina demoCompose / `@agente`).

## todo

- **M8 · `@nestjs/swagger` + `openapi:dump`.** Agregar `@nestjs/swagger`, exponer `GET /docs`,
  script `pnpm run openapi:dump` que regenere `documentacion/openapi.json` desde los decoradores
  (hoy `openapi.json` es el esqueleto de M0, refleja el contrato pero no se genera del código).
- **Merge a `master` de `feat/e2e-m8-v1-cutover` + `chore/docs-handoff-restructure`.** Lo abre/
  mergea el usuario (sin `gh` CLI acá; no se mergea a master desde background).
- **Borrar ramas remote zombie:** `feat/e2e-m3-admin`, `feat/catalog-promo-sku-es-names`
  (`git push origin --delete …` — acción del usuario, el classifier lo bloquea acá).
- **Job de limpieza de usuarios throwaway (opción B).** `agent+<contextId>@agent.brodriro.dev`
  por sesión A2A; nada los borra. Sin dueño.
- **Merge coordinado de `chore/docs-restructure`** en los 3 repos (agente-mobile y demoCompose ya
  lo tienen en rama). Sin merge unilateral.

## Notas

- Cliente Android: el fallback de `GET /me` (§16) no se auto-recupera tras un fallo transitorio.
  Tarea de `demoCompose`, referencia cruzada.
- `discountCode` en `POST /orders` se acepta y hashea pero **no se aplica al `total`** (integración
  con `promo-codes` = follow-up sin dueño).
- Transiciones admin de pedido: `e2eRunId` va a `AuditLog.meta`, **no** a `OrderStatusHistory.meta`
  (solo el tramo system lo estampa en el history). El wording de la sección Payments de `CLAUDE.md`
  quedó impreciso en ese punto.
