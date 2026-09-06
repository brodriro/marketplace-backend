# tasks.md — marketplace-backend

> Tareas activas. Al completar una: moverla a [`handoff.md`](handoff.md) (entrada nueva arriba).
> Contexto y decisiones abiertas en [`plan.md`](plan.md).

## Retomar acá

**Plan E2E cross-repo activo.** M0 (freeze de contrato) cerrado el 2026-09-06:
`documentacion/openapi.json` + sección "Próxima versión (v1)" en `API.md`. Contrato canónico en
`demoCompose/docs/plan-e2e.md` §6. Lo próximo es **M1 · B1** (auth con refresh). Sin cambios de
código todavía.

Pendiente de antes: rama `chore/docs-restructure` sin merge (se coordina con los 3 repos) y el
**redeploy de `api.brodriro.dev`** desde `master` (ver blocked).

## doing

- **M1 · B1 · Auth con refresh** — implementado en `feat/e2e-m1-auth-refresh`, sin merge.
  `RefreshToken` + migración `20260906222633_add_refresh_token` (aplicada al RDS pre-prod),
  `POST /auth/refresh` + `/auth/logout`, rotación + detección de reuso por familia, access→15m,
  `login`/`register` devuelven `AuthTokens`, `/v1` vía `enableVersioning` (+ alias `VERSION_NEUTRAL`
  hasta M8), desactivar usuario revoca sus familias. e2e 13/13 + smoke `:3000` OK. Falta: revisión
  de la sesión app (C2) + decidir merge/flag-day del `/v1` + commit.

## E2E — lane de `@backend` (secuenciada; contrato congelado en `plan-e2e.md` §6)

- **M1 · B1 · Auth con refresh.** ✅ hecho (rama `feat/e2e-m1-auth-refresh`, ver "doing").
- **M2 · B2 · Dominio carrito.** 🚧 borrador en `feat/e2e-m2-cart` (stack sobre M1, sin merge):
  modelos `Cart`/`CartItem` + migración `20260906225213_add_cart` (RDS pre-prod), `CartModule` con
  los 6 endpoints, precio vivo, `variantId|sku` en escritura, merge `max(local,server)`. Smoke con
  curl OK. Falta: dedupe real de `Idempotency-Key` (llega en M5), tests e2e, revisión C1, merge.
- **M3 · B6 · Admin (parte 1).** Extender la app Next.js `admin/` + REST `src/admin/*`: Productos
  CRUD + lista de Pedidos. Sesión propia + CSRF. Depende de M1.
- **M4 · B3 + B5 · Ciclo de vida + eventos.** Migración de enum (`processing→preparing` +
  `paid/cancelled/refunded`), `OrderStatusHistory`, matriz de transiciones (`409 +
  allowedTransitions`), `POST /orders/:id/cancel`, timeline real. Modelo `Notification` +
  `NotificationType`, `POST /notifications/read-all`, 3 triggers. Depende de M3.
- **M5 · B4 · Pago Stripe test.** SDK `stripe`, PaymentIntent en `POST /orders`,
  `POST /webhooks/stripe` (raw body), `POST /orders/:id/confirm` (demo), tabla `IdempotencyKey`,
  barrido de `pending_payment` vencidos, `insufficientStockSkus` en el `409` de stock. Depende de
  M1 + M4.
- **M6 · B7 · i18n del seed (acotado).** Categorías/`store`/descripciones/colores → es-419; search
  matchea `description`. Paralelo desde M0.
- **M7 · B6 · Admin polish.** Analytics, usuarios + rol, monitor de alertas, config del agente,
  `AuditLog`. Depende de M3.
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
