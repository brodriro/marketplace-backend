# tasks.md — marketplace-backend

> Tareas activas. Al completar una: moverla a [`handoff.md`](handoff.md) (entrada nueva arriba).
> Contexto y decisiones abiertas en [`plan.md`](plan.md).

## Retomar acá

**Plan E2E cross-repo activo.** **M0→M4 en `master` (`59707b4`)** (PRs #2, #3, #4 — este último
también trajo B7 search por tokens). El loop E2E de M4 (demoCompose C4/C5/**C10** + agente A3)
cerró el 2026-09-08: `plan-e2e.md §7.1/§7.4` fila M4 → `coord-test-ready = y`. **Próximo backend:
M5 · B4 (Stripe).** Contrato canónico en `demoCompose/docs/plan-e2e.md` §6; `documentacion/openapi.json`
lo refleja.

Migraciones del RDS pre-prod al día: `…_add_audit_log`, `…_add_audit_log_meta`,
`…_add_order_lifecycle_and_notifications` aplicadas y verificadas (2026-09-08).

Pendiente de antes: rama `chore/docs-restructure` sin merge y el **redeploy de `api.brodriro.dev`**
desde `master` (ver blocked).

## doing

- **M6 · B7 · parte de datos (i18n es-419).** El search por tokens ya está en `master` (PR #4).
  Falta traducir `categories.name` / `store` / `products.description` / display-names de `Color` a
  es-419: migración de datos (como `20260827130000` hizo con `products.name`) + actualizar
  `seed-data/feed.json`. Sin esto "remera negra" aún no matchea (color en variantes/desc en inglés).
  Toca datos del RDS pre-prod → decisión del usuario.

- **M3 §7.1 — tramo admin de la prueba coordinada.** Falta el PATCH admin real (price + stock de
  una variante de un producto de Home) para que demoCompose confirme el data-plane read-only y
  `AuditLog.meta.e2eRunId` capture el `runId` del tramo admin. Lo dispara el usuario / sesión con
  el admin a mano.

## E2E — lane de `@backend` (secuenciada; contrato congelado en `plan-e2e.md` §6)

- **M1 · B1 · Auth con refresh.** ✅ en `master` (`9f75272`). Verificado e2e por la app (checkpoint #1).
- **M2 · B2 · Dominio carrito.** ✅ en `master` (`9f75272`). Verificado e2e por la app (checkpoint #1:
  carrito de la app = carrito del backend). Pendiente: dedupe real de `Idempotency-Key` (M5).
- **M3 · B6 · Admin (parte 1).** ✅ en `master` (`c94c6cd` vía PR #2). `AuditLog` + `AuditInterceptor`
  en los 5 `Admin*Controller` + `GET /admin/audit-logs`; app Next.js `admin/` cutover a `/v1` +
  refresh-on-401. Sesión cookie+CSRF → M7 (opción B). Falta solo el tramo admin de §7.1 (ver "doing").
- **M4 · B3 + B5 · Ciclo de vida + eventos.** ✅ en `master` (`9dd1b23`/`c056b8e` vía PR #2;
  `4371187` interceptor `[e2e]` global vía PR #3). Migraciones aplicadas al RDS pre-prod. Loop E2E
  C10 verde 2026-09-08 (`runId e2e-M4-20260908-01`: 3 tramos de carrito app↔agente↔backend
  verificados live; `POST /v1/cart/items 201` con `X-E2E-Run` en `mb-3000.log`). `§7.1/§7.4` M4 → `y`.
  Pendiente menor: specs e2e backend de orders/notif (no bloqueante); slots `e2eRunId` en
  `OrderStatusHistory.meta` / `Notification.data` no se hicieron — se agregan con la migración de M5
  si demoCompose los quiere para el lifecycle de pedido.
- **M5 · B4 · Pago Stripe test.** SDK `stripe`, PaymentIntent en `POST /orders`,
  `POST /webhooks/stripe` (raw body), `POST /orders/:id/confirm` (demo), tabla `IdempotencyKey`,
  barrido de `pending_payment` vencidos, `insufficientStockSkus` en el `409` de stock,
  `pending_payment → paid` (actor `system`). **Fold-in acordado con demoCompose:**
  `OrderStatusHistory.meta.e2eRunId` en la migración de M5. Depende de M1 + M4 (ambas en master).
- **M6 · B7 · i18n del seed (acotado).** Paralelo desde M0.
  - ✅ **Search por tokens sobre `name` + `description`** — en `master` (`aa877cc`/`9e26d54` vía
    PR #4). `q` se tokeniza; cada palabra tiene que estar en `name` OR `description`.
    `products.service.spec.ts` 4/4 + smoke RDS. Cierra el "search matchea `description`" del spec.
  - ⏳ **Parte de datos (no hecha):** ver "doing".
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
