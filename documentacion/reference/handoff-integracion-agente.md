# Handoff — integración `agente-mobile` ↔ `marketplace-backend`

> Estado al 2026-08-27. Coordinación hecha entre esta sesión y la sesión Claude del repo
> `agente-mobile` (repo del agente conversacional A2A). Este doc es para retomar mañana.

## Contexto

El `agente-mobile` deja de usar repos mock y pasa a leer/escribir todo contra este backend real
(hoy apunta a `http://localhost:3000`, prod `api.brodriro.dev`). Ya hizo smoke test A2A OK
contra el backend real (`search_products` → producto real → surface A2UI).

## Contratos confirmados al agente (ya usables, sin cambios de backend)

- `GET /products/search?q&category&minPrice&maxPrice&color&sortBy&cursor&pageSize` → `{items, nextCursor}`.
  `sortBy` = `price_asc|price_desc|newest` (default `newest`). `category` = uuid exacto. `pageSize` 1..100.
- `GET /products/:id` → Product + `variants[].stock` + `averageRating` + `reviewCount`.
- `GET /products?page&pageSize` → `{items, page, pageSize, total}`.
- `GET /categories` → `[{id(uuid), name, subtitle, image}]`.
- `GET /banners` (público), `GET /products/:productId/reviews` (público).

### Correcciones que el agente aplica en su lado (estaban mal en su mock)

- `POST /orders` body real: `{ shippingCity: string, items: [{ variantId: uuid, quantity: int }] }`.
  Es **`variantId`**, no `productId`+`sku` — el agente lo resuelve vía `GET /products/:id` (`variants[].id`).
- No hay objeto `shipping{}` ni costo de envío: campos planos `shippingCity` + `etaDays` (fijo = 5).
- `total`/`unitPrice`/`value`/`minPurchase` son `Decimal` → viajan como **string**.
- Orden nace en `pending_payment`. No hay endpoint de pago/confirm. El avance de estado es admin-only
  (`PATCH /admin/orders/:id/status`, solo avanza).
- `GET /orders/:id` existe, con `timeline` sintético. "No existe" y "no es tuyo" → mismo `404`.
- Favorites: `GET /favorites` trae `product` anidado; `POST/DELETE /favorites/:productId` (productId en el path).

## Decisiones tomadas

| Tema | Decisión | Quién |
|---|---|---|
| **Auth del agente** | Opción **B**: el agente hace `POST /auth/register` de un usuario efímero por sesión A2A (`agent+<contextId>@agent.brodriro.dev`, password random guardado en estado de sesión). `409` → `login`. Token vencido → re-`login` (nunca re-`register`). **Sin cambios de backend.** | usuario de `agente-mobile` |
| **Carrito** | **In-memory en el agente**. NO se construye `/cart` server-side. | ambos usuarios |
| **Usuario técnico fijo** | **Descartado** (el agente se auto-registra, opción B). | usuario de este repo |
| **Promo codes** | **Sí**, `GET /promo-codes/:code` de solo validación. Implementado (ver abajo). | ambos usuarios |

> Nota: el usuario de este repo primero pidió `/cart` server-side + usuario técnico; se revirtió
> al conocer que el `agente-mobile` ya iba por opción B + carrito in-memory. No quedó código muerto.

### Datos sobre `POST /auth/register` confirmados al agente

- Acepta emails arbitrarios (solo valida formato, sin verificación de mailbox ni allowlist).
- Password: solo `@MinLength(8)`, nada de complejidad.
- Devuelve `{ accessToken }` en el `201` (mismo shape que `login`). `role` siempre `user`.
- Rate limit global: 100 req/60s por IP (aplica a `/auth/*` igual). Sin refresh token.
- Los users throwaway no se limpian solos — `users` va a acumular. Eventual job de limpieza = pendiente sin dueño.

## Implementado esta ronda: `GET /promo-codes/:code`

Módulo nuevo `src/promo-codes/` (module + controller + service). Público, sin auth.

- Respuesta `200`: `{ code, type, value, appliesToCategory, minPurchase, validFrom, validUntil }`.
  `value`/`minPurchase` son `Decimal` → **string**. `type` = `percentage | fixed_amount`.
  `appliesToCategory` = `Category.id` (no-FK) o `null`.
- `404` si el código no existe **o** si `now ∉ [validFrom, validUntil]`. `:code` case-insensitive (upper).
- No devuelve `id`/`createdAt`/`updatedAt`. El backend NO aplica el descuento en `POST /orders`.

### Archivos tocados

- `prisma/schema.prisma` — enum `PromoCodeType` + modelo `PromoCode` (`@@map("promo_codes")`).
- `prisma/migrations/20260827120000_add_promo_codes/migration.sql` — **escrita a mano** en formato
  Prisma (no se pudo correr `migrate dev`: no hay Docker/Postgres en el entorno de la sesión).
- `src/promo-codes/{promo-codes.module,promo-codes.controller,promo-codes.service}.ts`.
- `src/app.module.ts` — `PromoCodesModule` en `imports`.
- `prisma/seed.ts` — bloque "Seeding promo codes" con 4 códigos (idempotente, upsert por `code`).
- `documentacion/API.md` — sección "Promo codes" + fila en la tabla de rutas.

`nest build` y `prisma generate` OK. Sin commit todavía. Los 9 errores de lint en `prisma/seed.ts`
son **pre-existentes en `master`** (no se tocaron).

### Códigos sembrados (para tests del agente)

| code | type | value | appliesToCategory | minPurchase | vigencia |
|---|---|---|---|---|---|
| `WELCOME10` | percentage | `"10.00"` | null | `"0.00"` | 2025→2030 (vigente) |
| `ENVIOGRATIS` | fixed_amount | `"15.00"` | null | `"100.00"` | 2025→2030 (vigente) |
| `CATEGORIA20` | percentage | `"20.00"` | uuid 1ª categoría (alfabética) | `"50.00"` | 2025→2030 (vigente) |
| `EXPIRADO5` | percentage | `"5.00"` | null | `"0.00"` | 2024 (siempre `404`) |

## Pendiente para mañana

1. **[bloqueante para el agente]** Aplicar la migración en el server que consume el agente:
   ```bash
   docker-compose up -d
   npx prisma migrate dev        # aplica 20260827120000_add_promo_codes
   npx prisma db seed
   ```
   Verificar `GET /promo-codes/welcome10` → `200` y `GET /promo-codes/expirado5` → `404`.
   Si `migrate dev` detecta drift con la migración escrita a mano, dejar que Prisma la regenere
   (`migrate reset` en dev) y comparar el SQL.
2. **Avisar al `agente-mobile`** cuando la migración esté aplicada (localhost:3000 y/o prod) — está
   esperando esa confirmación para cablear `HttpPromoCodeRepository` (hoy `apply_discount_code` en mock).
3. **Commit** de los cambios de promo codes (mensaje en español, según convención del repo).
4. **Deploy a prod** (`api.brodriro.dev`) cuando corresponda: migración + seed.
5. Opcional/sin dueño: job de limpieza de usuarios throwaway generados por la opción B.

## SKU de variante — esquema canónico (2026-08-27, pedido de `mobile`)

Contexto: el `VariantSelector` (catálogo A2UI v0.4.0) usa `variant.sku` como `value` canónico
del chip, y `agente-mobile` keyea carrito/stock por `sku` + `productId`. Se pidió "SKUs reales"
y autogeneración editable desde el panel admin.

**Estado real de la DB (verificado):** las 79 variantes **ya tenían** SKU real, único y con
sentido (`<slug(producto)>-<slug(color)>`, p. ej. `wireless-mouse-blue`). No hacía falta ninguna
migración de datos ni backfill — la columna `product_variants.sku` es `NOT NULL @unique` y está
100 % poblada, 0 colisiones. La premisa "el campo existe pero no tiene SKUs con sentido" era
incorrecta.

**Esquema canónico (formalizado en código):** `<slug(nombre del producto)>-<slug(color)>`,
minúsculas, `[a-z0-9-]`, segmentos separados por un guión. Colisión → sufijo `-2`, `-3`, …
Definición única en `src/products/sku.util.ts` (`buildSkuBase` / `resolveUniqueSku`), que también
usa `prisma/seed.ts`. **No** lleva prefijo de categoría: el nombre de producto ya es único por
categoría y el slug resulta único a nivel catálogo; agregar categoría obligaría a reescribir los
79 SKU existentes (breaking para cualquier cliente que ya los referencie) sin ganancia funcional.
Si se quisiera el prefijo igual, sería una migración de datos deliberada y coordinada — hoy NO
está hecha.

**Cambios de backend en esta ronda:**
- `sku` pasa a ser **opcional** en `POST /admin/products` y `POST /admin/products/:id/variants`.
  Omitido → autogenerado con el esquema. Enviado → se respeta (validado `[a-z0-9-]`), choque = `409`.
- Nuevo endpoint `POST /admin/products/:id/variants/:variantId/regenerate-sku` (admin) — regenera
  el SKU desde el nombre actual del producto + color. Para el botón "regenerar" del panel.
- Editar el SKU a mano ya funcionaba vía `PATCH /admin/products/:id/variants/:variantId`.
- Renombrar un producto **no** reescribe los SKU de sus variantes (los SKU son strings
  persistidos; solo cambian si se regeneran/editan explícitamente).
- `documentacion/API.md` actualizado (sección "`sku` de variante" + tabla admin).

**Para `agente-mobile` / `mobile`:** pueden asumir el formato `<slug(producto)>-<slug(color)>`
en sus builders, pero el SKU es un opaco estable — no lo parseen para deducir producto/color,
usen los campos. `build` y `tsc` OK; sin migración de schema (no hubo cambio de modelo).

## Nombres de producto EN→ES (2026-08-27, pedido del usuario)

Migración de datos `prisma/migrations/20260827130000_translate_product_names_to_es/migration.sql`
(escrita a mano, sin cambio de schema): 19 `UPDATE "products" SET name=... WHERE name=<inglés>`.
`Smartwatch X1` se mantiene (nombre de modelo). Los 2 productos de test fuera del catálogo
(`ZZ Test Img Prod`, `Producto Soft Delete Test`, ambos soft-deleted) no se tocan.

`prisma/seed-data/feed.json` actualizado en paralelo (mismos 19 nombres) para que un seed sobre
DB limpia genere los nombres en español y el upsert por `categoryId_name` no cree duplicados.

**Solo cambia `products.name`.** No toca descripción, store, imágenes ni SKUs. Los
`product_variants.sku` ya persistidos NO cambian (siguen con el slug inglés, p. ej.
`wireless-mouse-blue`) — son opacos y estables. Solo el slug base de SKUs generados a futuro para
variantes nuevas saldrá del nombre en español.

**Caveat de reseed:** no correr `prisma db seed` contra una DB que ya tiene el catálogo en inglés
*después* de aplicar esta migración sin antes migrar — el seed haría match por nombre en español,
no encontraría los productos (aún en inglés si la migración no corrió) y crearía duplicados. Orden
correcto: `migrate deploy` (aplica la traducción) → `db seed` (idempotente). En `migrate reset` no
hay problema: migraciones sobre base vacía (UPDATE no-op) y el seed inserta desde el `feed.json` ya
en español.

Impacto en clientes: `mobile` (Android) muestra `name` en vivo desde el API, sin caché persistente
→ transparente. Nombres editables desde el panel admin si alguna traducción no encaja.

## Prueba conjunta 2026-08-27 — 4/4 verde

Las tres sesiones (`backend`, `mobile`/Android, `mobile-agente`) corrieron un test end-to-end.

**Entorno del test:** app Android (release) y agente (`:2500`) → `http://192.168.31.63:3000/`
(server local corriendo la rama `feat/catalog-promo-sku-es-names`, `node dist/main.js` como
proceso detached del sistema) → **mismo RDS** de `api.brodriro.dev` (ya migrado). `api.brodriro.dev`
deployado NO se tocó (sigue con código previo, sin endpoint promo).

**Resultado:** los 4 puntos pasan.
1. Nombres ES en vivo en grilla/detalle/carrito/chat/favoritos.
2. Registro + login real (`POST /auth/*`).
3. Flujo completo Home→detalle→favorito→carrito→`POST /orders` (con `variantId`)→"Payment
   successful". Order creada, visible en My Orders, favorito persiste.
4. Chat A2UI: `ProductItem` + `VariantSelector` con las variantes reales.

**Hallazgo corregido en el acto:** `GET /orders` devolvía line items sin datos de variante
→ Android mostraba "Color: -". Ahora `GET /orders` y la respuesta de `POST /orders` incluyen
`items[].variant: { color, sku }` (commit `554cc70`). `GET /orders/:id` sin cambios.

**Pendientes post-prueba (sin apuro, sin dueño de fecha):**
- Backend: `400` de stock insuficiente debería devolver el/los SKU en un campo estructurado
  (`insufficientStockSkus`) en vez de solo en el texto — el agente hoy parsea el string best-effort.
- Backend: mergear `feat/catalog-promo-sku-es-names` a master y redeployar `api.brodriro.dev`
  (para que el endpoint promo y el SKU opcional del panel estén en prod, no solo en el `:3000` local).
- Backend: job de limpieza de usuarios throwaway de la opción B (`agent+<contextId>@...`).
- Cliente (`mobile`): fallback de `GET /me` (§16) no se recupera solo tras un fallo transitorio.

## Lo que NO se hizo (a propósito)

- `/cart` server-side y modelos `Cart`/`CartItem` — descartado.
- Usuario técnico / API key / rol de servicio — descartado.
- Aplicar el descuento en `POST /orders` — fuera de alcance; el total con descuento lo calcula el agente.
- Migración de datos de SKU / prefijo de categoría en el SKU — innecesaria (ver sección SKU).
