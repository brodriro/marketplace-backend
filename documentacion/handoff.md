# handoff.md — marketplace-backend

> Log reverso de tareas completadas (más reciente arriba). Entradas de 3-6 líneas:
> **fecha · qué · por qué · archivos clave · follow-ups**. Se mantienen ~20 entradas / ~90 días —
> el archivo real es `git log`. El detalle profundo de la integración con el agente está en
> [`reference/handoff-integracion-agente.md`](reference/handoff-integracion-agente.md).

---

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
