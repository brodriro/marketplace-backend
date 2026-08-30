# plan.md — marketplace-backend

> Dirección, hitos, decisiones de diseño abiertas y estado de coordinación cross-repo.
> Las tareas concretas viven en [`tasks.md`](tasks.md); lo terminado en [`handoff.md`](handoff.md).

## Dirección

El backend ya cubre el flujo completo que consume la app Android (catálogo, búsqueda, favoritos,
reviews, pedidos, alertas de stock) y la integración con el agente conversacional A2A
(`agente-mobile`). El foco ahora es **consolidar**: llevar a `master` + prod lo que se validó en
la prueba conjunta del 2026-08-27 y cerrar los pendientes menores sin dueño.

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
- ⏳ Cerrar pendientes post-prueba (ver `tasks.md`).

## Decisiones de diseño abiertas

- **`400` de stock insuficiente sin campo estructurado.** Hoy el mensaje es
  `Stock insuficiente para <sku>` y el agente parsea el texto best-effort. Propuesta: agregar
  `insufficientStockSkus: string[]` al body del error. Requiere coordinar el cambio con
  `agente-mobile` (consume ambos lados). — sin dueño de fecha.
- **Usuarios throwaway de la opción B se acumulan.** `POST /auth/register` de la auth del agente
  crea `agent+<contextId>@agent.brodriro.dev` por sesión A2A y nada los limpia. Eventual job de
  limpieza. — sin dueño.
- **Prefijo de categoría en el SKU** — evaluado y **descartado** (reescribir 79 SKU existentes es
  breaking, sin ganancia funcional). Si se retoma, es una migración de datos deliberada y
  coordinada con `mobile` + `agente-mobile`.
- **`/cart` server-side + usuario técnico / API key** — evaluado y **descartado**: el agente va
  por carrito in-memory + auth opción B. No hay código muerto de esto.

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
