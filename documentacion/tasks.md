# tasks.md — marketplace-backend

> Tareas activas. Al completar una: moverla a [`handoff.md`](handoff.md) (entrada nueva arriba).
> Contexto y decisiones abiertas en [`plan.md`](plan.md).

## Retomar acá

Rama `chore/docs-restructure` creada con este layout de docs (sin merge — se coordina con los 3
repos). El código promo/SKU/ES ya está en `master` y pusheado; lo que queda es **confirmar el
redeploy de `api.brodriro.dev`** desde el `master` actual (ver blocked) y los pendientes menores
en todo.

## doing

- _(nada en curso)_

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
