# plan.md — marketplace-backend

> Dirección, hitos, decisiones de diseño abiertas y estado de coordinación cross-repo.
> Las tareas concretas viven en [`tasks.md`](tasks.md); lo terminado en [`handoff.md`](handoff.md).

## Dirección

El backend ya cubre el flujo completo que consume la app Android (catálogo, búsqueda, favoritos,
reviews, pedidos, alertas de stock) y la integración con el agente conversacional A2A
(`agente-mobile`).

**Plan E2E cross-repo — CERRADO 2026-09-10** ("loop completo app + dashboard admin", coordinado con
`demoCompose` y `agente-mobile`; canónico en `demoCompose/docs/plan-e2e.md`). `@backend` llevó el
grueso: auth con roles + refresh, carrito persistido, ciclo de vida del pedido con historial y
eventos, pago provider-agnostic, extender el admin, OpenAPI + `/v1`. **M0→M8 completos y mergeados**
en `origin/master` — no queda nada de esta lane en rama. Dos corridas del loop, ambas **6/6 §4
verdes**: `e2e-M8-20260910-01` y una adicional `e2e-M8-20260910-02` pedida esa misma noche. Detalle
en `handoff.md`, lane completa en [`tasks.md`](tasks.md).

**Cierre es de código/deploy, no del loop de validación:** el usuario decidió **no** desplegar a
prod (`api.brodriro.dev` descartado — el dominio ni resuelve); todo corre en localhost/RDS
pre-prod. Repo consolidado en una sola rama (`master`) — ramas y worktrees zombie ya borrados.
Único follow-up no bloqueante de esta lane: `@nestjs/swagger` + `openapi:dump` (ver `tasks.md`).

## Hitos

- ✅ API base + módulos por feature (auth, users, categories, products, favorites, reviews,
  orders, notifications) — en `master`.
- ✅ Panel admin (sub-app `admin/`) con CRUD de productos y categorías.
- ✅ Promo codes (`GET /promo-codes/:code`), autogeneración de SKU en el panel, nombres de
  producto en español — **en `master`**, migraciones aplicadas al RDS, validado en la prueba
  conjunta 2026-08-27.
- ✅ Reestructura de docs (este layout de 4 archivos) — mergeada a `master` (PR #1) en los 3 repos.
- ✅ Plan E2E · M0 (freeze de contrato) — `documentacion/openapi.json` + sección v1 de `API.md`
  (2026-09-06). Contrato en `demoCompose/docs/plan-e2e.md` §6.
- ✅ Plan E2E · **M1→M8 en `master`** — auth+refresh, carrito persistido, admin+audit, ciclo de
  vida del pedido con historial + notificaciones + correlación E2E (`X-E2E-Run`), pago
  provider-agnostic (`bypass` default / `stripe`), search por tokens + i18n es-419 del catálogo,
  admin polish (analytics/monitor/agent-config) + sesión admin cookie httpOnly/CSRF, cutover `/v1`
  (remoción de `VERSION_NEUTRAL`). Loops E2E M4 (`e2e-M4-2026090{8,9}`), M5 (`e2e-M5-20260909-01`) y
  el loop completo M8 (`e2e-M8-20260910-01` y `-02`) verdes.
- ✅ Consolidación post-corridas (2026-09-10/11): repo en una sola rama (`master`), ramas/worktrees
  zombie borrados, docs corregidos para reflejar la corrida `-02`. Deploy de prod **descartado por
  el usuario** — ver "Pendiente para producción" y "Servers" más abajo (quedan como registro, no
  como bloqueo).

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
(testeo con usuarios beta) y del despliegue a producción** — es decir, **no bloqueantes hoy**: el
usuario decidió el 2026-09-10 no desplegar a prod (ver `handoff.md`), así que esta sección queda
como referencia para si se retoma, no como trabajo pendiente activo.

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
- **Deploy a `api.brodriro.dev`** — **descartado por el usuario (2026-09-10)**, no solo pendiente:
  el dominio ni siquiera resuelve hoy. Ver "Servers" más abajo.

## Coordinación cross-repo

Sistema de 3 repos: `agente-mobile` (agente conversacional A2A) · `marketplace-backend` (este) ·
`demoCompose` (app Android + plan de diseño + catálogo A2UI).

### Quién es canónico de qué

Ver la tabla de contratos en [`context.md`](context.md). Resumen: shape de la API y formato de
SKU → acá; catálogo A2UI / `catalog.schema.json` y plan de diseño global → `demoCompose`;
contrato de integración del agente → `reference/handoff-integracion-agente.md` de acá.

### Servers

- **`api.brodriro.dev`** — prod, **sin uso activo**: el dominio ni siquiera resuelve, y el usuario
  decidió (2026-09-10) no perseguir el redeploy — todo el loop E2E corrió contra localhost + RDS
  pre-prod. El **RDS pre-prod** tiene las 13 migraciones aplicadas (M0→M8, verificado
  `migrate status`), así que si se retoma el redeploy no necesita paso de migración extra.
- **`:3000` local** — server de las pruebas conjuntas y del loop E2E (`node dist/main.js`, apunta al
  RDS pre-prod). Los background tasks del harness mueren a los minutos; se corre detached
  (`Start-Process -WindowStyle Hidden`) y se baja con `Stop-Process` por PID / `Get-NetTCPConnection -LocalPort 3000`.
  A veces lo levanta la sesión `agente-mobile` para grabar / correr e2e; devuelve el puerto al terminar.

### Trenes de deploy

- **Catálogo A2UI v0.6.0 / v0.7.0 / v0.7.1** — vive en `demoCompose` + `agente-mobile`.
  `marketplace-backend` **no cambió** para ese tren.
- **Merge de docs** (`chore/docs-restructure`) — ✅ hecho en los 3 repos (este repo: PR #1).
- **Redeploy de `api.brodriro.dev`** — ❌ descartado por el usuario, no en curso.

### Quién bloquea a quién

- Nada de `marketplace-backend` bloquea hoy a los otros repos: el tren v0.7.x del catálogo no lo
  toca, y el redeploy de prod que bloqueaba a `agente-mobile`/`HttpPromoCodeRepository` contra
  `api.brodriro.dev` quedó sin efecto al descartarse el deploy — todos corren contra `:3000` local.
