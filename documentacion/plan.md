# plan.md — marketplace-backend

> Dirección, hitos, decisiones de diseño abiertas y estado de coordinación cross-repo.
> Las tareas concretas viven en [`tasks.md`](tasks.md); lo terminado en [`handoff.md`](handoff.md).

## Dirección

El backend ya cubre el flujo completo que consume la app Android (catálogo, búsqueda, favoritos,
reviews, pedidos, alertas de stock) y la integración con el agente conversacional A2A
(`agente-mobile`).

**Foco actual: plan E2E cross-repo** ("loop completo app + dashboard admin", coordinado con
`demoCompose` y `agente-mobile`; canónico en `demoCompose/docs/plan-e2e.md`). `@backend` llevó el
grueso: auth con roles + refresh, carrito persistido, ciclo de vida del pedido con historial y
eventos, pago provider-agnostic, extender el admin, OpenAPI + `/v1`. **M0→M8 completos en código**
(2026-09-10); ensayo del loop `e2e-M8-20260910-01` 6/6 §4 verde. Lane detallada en
[`tasks.md`](tasks.md).

Queda **consolidar / desplegar**: mergear `feat/e2e-m8-v1-cutover` + `chore/docs-handoff-restructure`
(usuario), `@nestjs/swagger` + `openapi:dump` (cola de M8), y el redeploy de `api.brodriro.dev`
desde `master` + cutover de `MARKETPLACE_BASE_URL`.

## Hitos

- ✅ API base + módulos por feature (auth, users, categories, products, favorites, reviews,
  orders, notifications) — en `master`.
- ✅ Panel admin (sub-app `admin/`) con CRUD de productos y categorías.
- ✅ Promo codes (`GET /promo-codes/:code`), autogeneración de SKU en el panel, nombres de
  producto en español — **ya en `master`** (`3ab22f4`…`f06fae4`, pusheado a `origin/master`) y
  **migraciones aplicadas al RDS**, validado en la prueba conjunta. Falta confirmar el **redeploy
  de `api.brodriro.dev`** desde el `master` actual (el 2026-08-27 el deployado corría código previo).
- ✅ Reestructura de docs (este layout de 4 archivos) — rama `chore/docs-restructure`, sin merge;
  el merge de los 3 repos se coordina junto.
- ✅ Plan E2E · M0 (freeze de contrato) — `documentacion/openapi.json` + sección v1 de `API.md`
  (2026-09-06). Contrato en `demoCompose/docs/plan-e2e.md` §6.
- ✅ Plan E2E · **M1→M7 en `master` (`ef97de5`)** — auth+refresh, carrito persistido, admin+audit,
  ciclo de vida del pedido con historial + notificaciones + correlación E2E (`X-E2E-Run`), pago
  provider-agnostic (`bypass` default / `stripe`), search por tokens + i18n es-419 del catálogo,
  admin polish (analytics/monitor/agent-config) + sesión admin cookie httpOnly/CSRF. Loops E2E M4
  (`e2e-M4-2026090{8,9}`) y M5 (`e2e-M5-20260909-01`) verdes.
- 🔷 Plan E2E · **M8** — cutover `/v1` (remoción de `VERSION_NEUTRAL`) en `feat/e2e-m8-v1-cutover`
  (sin merge); ensayo del loop completo `e2e-M8-20260910-01` **6/6 §4 verde** (2026-09-10). Falta:
  merge + `@nestjs/swagger`/`openapi:dump` + redeploy.
- ⏳ Consolidar: merge de las 2 ramas de docs/M8, redeploy `api.brodriro.dev`, `openapi:dump`.

## Decisiones de diseño abiertas

- **`400` de stock insuficiente sin campo estructurado.** Hoy el mensaje es
  `Stock insuficiente para <sku>` y el agente parsea el texto best-effort. **Resuelto en el plan
  E2E:** se agrega `insufficientStockSkus: string[]` al body del `409` como parte de M5/B4.
- **Usuarios throwaway de la opción B se acumulan.** `POST /auth/register` de la auth del agente
  crea `agent+<contextId>@agent.brodriro.dev` por sesión A2A y nada los limpia. **El plan E2E
  (M1/A4) elimina la cuenta efímera**: el agente pasa a propagar el bearer real del usuario. Queda
  pendiente sólo un cleanup one-shot de los `agent+*` ya creados.
- **Prefijo de categoría en el SKU** — evaluado y **descartado** (reescribir 79 SKU existentes es
  breaking, sin ganancia funcional). Si se retoma, es una migración de datos deliberada y
  coordinada con `mobile` + `agente-mobile`.
- **`/cart` server-side** — antes descartado (el agente iba por carrito in-memory + auth opción B).
  **Revertido por el plan E2E** (decisión del usuario 2026-09-06): el carrito pasa a ser persistido
  en el backend (`Cart`/`CartItem`), fuente de verdad única para app y agente; el agente lo consume
  vía proxy con propagación del bearer real (se elimina la cuenta efímera de la opción B). Ver M2.
  El "usuario técnico / API key" sigue descartado.

## Pendiente para producción

Cosas que están OK para dev / el e2e del loop pero **hay que resolver antes de friend & family
(testeo con usuarios beta) y del despliegue a producción**.

- **Proveedor de pago real.** M5/B4 dejó el pago detrás de una interfaz (`PaymentProvider`,
  `src/payments/`) y el proveedor activo por defecto es **`bypass`**: no llama a ningún servicio
  externo, entrega un `clientSecret` sintético y **`POST /orders/:id/confirm` marca el pedido
  `paid` sin verificar ningún cobro**. Sirve para no atarse a un proveedor y para correr el e2e
  completo sin cuenta de Stripe.
  Contrato de respuesta de `POST /orders` (igual para cualquier proveedor):
  `{ order, payment: { provider, clientSecret, publishableKey } }`. El cliente **branchea por
  `payment.provider`**: `"bypass"` → saltear la pantalla de pago y llamar directo a
  `POST /orders/:id/confirm`; `"stripe"` → Payment Sheet real. M5 ya está en `master` (PR #7); el
  ensayo M8 (`e2e-M8-20260910-01`, 2026-09-10) corrió el loop entero con `bypass` contra el RDS
  pre-prod.
  **Antes de F&F / prod:** setear `PAYMENT_PROVIDER=stripe` (o implementar otro proveedor: una
  clase que cumpla `PaymentProvider` + su rama en `PaymentsModule`), cargar sus credenciales,
  configurar el webhook (`POST /webhooks/stripe`, firma), y `STRIPE_DEMO_CONFIRM=false` para que
  `POST /orders/:id/confirm` NO acepte confirmaciones sin verificar. El flujo F&F debe correr un
  cobro real de sandbox de punta a punta (Payment Sheet → webhook → `paid`), no el bypass.
- **Redeploy de `api.brodriro.dev`** — ver "Trenes de deploy" más abajo.

## Coordinación cross-repo

Sistema de 3 repos: `agente-mobile` (agente conversacional A2A) · `marketplace-backend` (este) ·
`demoCompose` (app Android + plan de diseño + catálogo A2UI).

### Quién es canónico de qué

Ver la tabla de contratos en [`context.md`](context.md). Resumen: shape de la API y formato de
SKU → acá; catálogo A2UI / `catalog.schema.json` y plan de diseño global → `demoCompose`;
contrato de integración del agente → `reference/handoff-integracion-agente.md` de acá.

### Servers

- **`api.brodriro.dev`** — prod. Apunta al **RDS** compartido. El **RDS ya tiene** las
  migraciones `20260827120000` (promo codes) y `20260827130000` (nombres ES) aplicadas + seed.
  El código promo/SKU/ES ya está en `master`; **falta confirmar que el proceso deployado se
  redeployó** desde el `master` actual (el 2026-08-27 corría código previo, sin endpoint promo).
- **`:3000` local** — usado en las pruebas conjuntas (`node dist/main.js`, apunta al mismo RDS).
  Los background tasks del harness mueren a los minutos; se corre detached
  (`Start-Process -WindowStyle Hidden`) y se baja con `Stop-Process` por PID / `Get-NetTCPConnection -LocalPort 3000`.
  A veces lo levanta la sesión `agente-mobile` para grabar / correr e2e; devuelve el puerto al terminar.

### Trenes de deploy

- **Catálogo A2UI v0.6.0 / v0.7.0 / v0.7.1** — vive en `demoCompose` + `agente-mobile`.
  `marketplace-backend` **no cambió** para ese tren.
- **Merge de docs** (`chore/docs-restructure`) — los 3 repos lo tienen en rama; se mergean juntos.
- **Redeploy de `api.brodriro.dev`** desde el `master` actual — el merge a `master` ya está
  hecho y pusheado; el RDS ya está migrado, así que el redeploy no necesita paso de migración
  extra. Desbloquea el endpoint promo y el SKU opcional del panel en prod.

### Quién bloquea a quién

- `agente-mobile` ya cableó `HttpPromoCodeRepository`; funciona contra el `:3000` local (que
  corre `master`) pero **no contra `api.brodriro.dev` hasta confirmar/hacer el redeploy**.
- Nada de `marketplace-backend` bloquea hoy a los otros repos para el tren v0.7.x del catálogo.
