# API — marketplace-backend

Documentación generada a partir del código real (`src/**/*.controller.ts`, `*.service.ts`,
`*.dto.ts`, `prisma/schema.prisma`), no del plan original — es la fuente de verdad para
implementar cualquier cliente (Android incluido).

Todo lo que sigue describe la **versión actual (v0)** en `master`. La sección de abajo resume el
contrato **v1** (plan E2E) que todavía no está implementado.

> ⚠️ **Desactualizado (M0→M8 ya mergeados y cerrados, 2026-09-10):** el marco "v0 actual / v1
> pendiente" de este archivo quedó viejo — **v1 es la versión actual**, `VERSION_NEUTRAL` ya se
> removió (M8: rutas sin `/v1` → `404`, salvo el webhook del proveedor) y todos los deltas de abajo
> están implementados. Este documento sigue siendo la referencia legible; el contrato máquina real
> ahora se genera desde los decorators (`@nestjs/swagger`) — `GET /docs` (Swagger UI) contra un
> backend levantado, o `pnpm run openapi:dump` para volcarlo a `openapi.json`. Hasta que alguien
> reescriba este archivo desde cero, leer los "✅ implementado" de abajo como el contrato vigente,
> no como pendiente.

---

## Próxima versión (v1) — contrato E2E congelado (M0, 2026-09-06)

> Estado: **implementado y en `master` (M1→M8), no "congelado, sin implementar"** — ver nota de
> arriba. El contrato máquina completo vive en [`openapi.json`](openapi.json), generado desde los
> decorators (`pnpm run openapi:dump`) — ya no es el esqueleto estático de M0. El plan y los hitos:
> `demoCompose/docs/plan-e2e.md` §6. Esta sección lista sólo los **deltas** contra la v0 documentada
> más abajo.

### Base path

Todas las rutas se sirven bajo **`/v1/...`** (`app.enableVersioning({ type: URI })`). El alias sin
prefijo (`VERSION_NEUTRAL`) que existió durante el cutover **se removió en M8** — una ruta sin
`/v1` da `404`. `GET /docs` (Swagger UI, sin `/v1`) sirve el contrato generado desde los decorators;
`pnpm run openapi:dump` vuelca el mismo documento a `documentacion/openapi.json`. Breaking futuro →
`/v2`. **Excepción:** `POST /webhooks/stripe` se monta sin el prefijo `/v1` (decisión propia del
controller, no un alias temporal).

### Auth: par access + refresh — ✅ implementado (M1, rama `feat/e2e-m1-auth-refresh`)

- `accessToken` JWT HS256, claims `{ sub, email, role, typ: "access", iat, exp }`, **TTL 15m**
  (`JWT_ACCESS_EXPIRES_IN`).
- `refreshToken` **opaco** (32B base64url), **TTL 30d** (`JWT_REFRESH_EXPIRES_IN`), guardado
  hasheado (sha256) en tabla `refresh_tokens` (`RefreshToken { userId, tokenHash, familyId,
  expiresAt, revokedAt?, replacedById?, userAgent?, createdAt }`, migración
  `20260906222633_add_refresh_token`).
- `POST /auth/login` (`200`) y `POST /auth/register` (`201`) devuelven
  `{ accessToken, refreshToken, expiresIn }` — **aditivo**: `accessToken` sigue estando, los
  clientes v0 no se rompen. `expiresIn` = segundos del access (para refresh preventivo).
- `POST /auth/refresh { refreshToken }` → `200` con par nuevo; **rota** (revoca el presentado,
  setea `replacedById`). Presentar un refresh desconocido/vencido → `401`. Presentar uno ya
  revocado (reuso) → se revoca **toda la `familyId`** y responde `401` → re-login.
- `POST /auth/logout { refreshToken }` → `204` (revoca el presentado + su familia; idempotente). No
  hay denylist de access: el access vale hasta su `exp`.
- `Role` sigue siendo `user | admin` (sin cambio). El seed ya crea `admin@marketplace.dev`
  (`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`).
- Desactivar un usuario (`PATCH /admin/users/:id/active`) revoca todas sus familias de refresh.
- El **agente conversacional** verifica el access token y **no** recibe refresh token; su cuenta
  efímera (opción B) se elimina en M1 (propagación de bearer real). La verificación puede ser por
  firma (secreto compartido) o por introspección vía `GET /me` (200 = válido, 401 = expirado) —
  esto último evita compartir el `JWT_SECRET`. Decisión de A4.

### Carrito persistido — 🚧 borrador (M2, rama `feat/e2e-m2-cart`)

Fuente de verdad única para app y agente. Modelos `Cart` (1:1 usuario) + `CartItem`
(`@@unique([cartId, variantId])`). `GET /cart` sin ítems → `200 { items: [], itemCount: 0,
subtotal: "0.00" }` (no `404`). `POST /cart/items` acepta `Idempotency-Key` opcional (2026-09-11) —
mismo lock-y-replay que `POST /orders` sobre la tabla `IdempotencyKey`: misma key + mismo body →
replay de la respuesta guardada (no duplica cantidad ante un retry); misma key + body distinto →
`409`; sin header → comportamiento de siempre (`increment`). A diferencia de `/orders`, acá **no**
es obligatoria. El carrito **no** valida stock (eso es `POST /orders`). `GET /cart` omite las
líneas cuya variante/producto quedó `visible:false` (soft-deleted); `POST /cart/items` y
`/cart/merge` con una variante `visible:false` → `404`.

| Método | Ruta | Notas |
|---|---|---|
| GET | `/cart` | Carrito del usuario. Vacío (no `404`) si no tiene. **Precio vivo**: `unitPrice`/`lineTotal`/`subtotal` se recalculan con el `price` actual en cada request. |
| POST | `/cart/items` | Body `{ variantId \| sku, quantity }` — acepta cualquiera de los dos, se resuelve server-side. `quantity` se **suma** a la línea existente (nunca crea dos líneas). Acepta `Idempotency-Key` opcional. |
| PATCH | `/cart/items/:variantId` | Body `{ quantity }` — cantidad **absoluta**; `0` borra la línea. |
| DELETE | `/cart/items/:variantId` | Quita una línea. |
| PATCH | `/cart` | Body `{ discountCode: string \| null }` (2026-09-12) — persiste (o `null` limpia) un código de descuento a nivel carrito, para que un checkout conversacional no tenga que repetirlo turno a turno. Solo valida existencia/vigencia (mismo `404 { error, code: "invalid_discount_code" }` que `GET /promo-codes/:code`) — **no** valida `minPurchase` (depende del subtotal al momento de pagar; eso lo re-chequea `POST /orders`). El código persistido **no** se aplica solo — quien arma el checkout debe seguir mandando `discountCode` en `POST /orders` (leyéndolo de `GET /cart` en vez de tener que recordarlo). |
| DELETE | `/cart` | Vacía el carrito (ítems **y** `discountCode`). |
| POST | `/cart/merge` | Body `{ items: [{ variantId\|sku, quantity }] }` — merge del carrito local al login. Unión de líneas, `quantity = max(local, server)` (idempotente). El cliente limpia su carrito local tras el `200`. |

Respuesta de todos (salvo notas en contrario): `{ items: [{ variantId, sku, productId, name, color,
image, quantity, unitPrice, lineTotal }], itemCount, subtotal, discountCode: string | null }`.

### Ciclo de vida del pedido (M4)

- **Enum nuevo:** `pending_payment, paid, preparing, shipped, delivered, cancelled, refunded`.
  Migración: `processing` → **`preparing`**; se agregan `paid`, `cancelled`, `refunded`.
- **Matriz de transiciones** (fuera de esto → `409 { error, allowedTransitions: [...] }`):

  | desde | hacia | quién |
  |---|---|---|
  | `pending_payment` | `paid` | **system** (webhook Stripe) / `POST /orders/:id/confirm` (demo) |
  | `pending_payment` | `cancelled` | **buyer** (`POST /orders/:id/cancel`, sólo en este estado) o admin — restock |
  | `paid` | `preparing` | admin |
  | `paid` | `cancelled` | admin → dispara refund → `refunded` |
  | `preparing` | `shipped` | admin (exige `trackingNumber` + `trackingCarrier`) |
  | `shipped` | `delivered` | admin |
  | `paid` / `preparing` / `shipped` / `delivered` | `refunded` | admin (con `reason`) |

- Tabla `OrderStatusHistory { orderId, fromStatus, toStatus, actorType (system|admin|buyer),
  actorUserId?, reason?, meta?, createdAt }` — una fila por transición.
- `GET /orders/:id` → `timeline` deja de ser sintético, sale del historial real, pero **mantiene la
  forma** `[{ status, at }]` (+ `actorType` opcional). Items con `variant.product` expandido.
- Nuevo `POST /orders/:id/cancel` (buyer, sólo `pending_payment`, body `{ reason? }`).
- `PATCH /admin/orders/:id/status` pasa de "sólo avanza en la cadena lineal" (`400`) a la matriz
  (`409` con `allowedTransitions`).
- **Stock:** se descuenta al crear el pedido (como hoy); restock en `cancelled`; barrido de
  `pending_payment` vencidos (`ORDER_PAYMENT_TTL_MIN=30`, default 30 min) → `cancelled` + restock.
- El `409` de `POST /orders` cubre dos casos, distinguibles por la presencia de
  `insufficientStockSkus: string[]`: **presente** → stock insuficiente (reintentable ajustando
  cantidades; antes era sólo el texto `Stock insuficiente para <sku>`); **ausente** → `Idempotency-Key`
  reusada con body distinto (bug del cliente, no reintentable con otro body bajo la misma key).

### Notificaciones = modelo propio (M4)

Se separa **suscripción** de **entrega** (revierte "notifications = stock alerts" del `CLAUDE.md`):

- `StockAlert` (creado por `POST /products/:id/alerts`) sigue siendo la **suscripción**.
- Modelo nuevo `Notification { id, userId, type, title, body, readAt?, productId?, orderId?,
  data Json?, createdAt }`, `NotificationType { order_status_changed, back_in_stock, price_drop }`
  = los eventos **entregados**.
- `GET /notifications` lee `Notification`. Wire:
  ```
  { id, type, title, body, read: <readAt != null>, createdAt,
    deepLink: { type: "order" | "product", id: "<uuid>" },
    data: { toStatus?, fromStatus?, trackingNumber?, carrier?, oldPrice?, newPrice?, sku? },
    product: {…} | null,   // sólo en back_in_stock/price_drop (back-compat app v0)
    notified: <bool> }      // espejo temporal de `read` (back-compat); se retira post-migración
  ```
- `PATCH /notifications/:id/read` (sin cambio) + nuevo `POST /notifications/read-all`.
- **Triggers:** (1) toda transición de estado de pedido → `order_status_changed` al dueño;
  (2) `stock` de variante `0 → >0` con `StockAlert back_in_stock` sin notificar → `back_in_stock`
  por suscriptor; (3) baja de `price` con `StockAlert price_drop` sin notificar → `price_drop`.
  **Por suscripción, no por favoritos.**

### Pago con Stripe test (M5)

- `POST /orders` (con `Idempotency-Key`) → pedido `pending_payment` + Stripe PaymentIntent
  (`amount = total`, `metadata.orderId`). Respuesta: `{ order, payment: { provider: "stripe",
  clientSecret, publishableKey } }`. La `publishableKey` en la respuesta evita un endpoint de config.
- La app confirma con **Stripe Payment Sheet** (`stripe-android`) usando `clientSecret`. Sin WebView,
  sin Checkout Session hosteada.
- `POST /webhooks/stripe` (`payment_intent.succeeded`) — **sin `/v1`**, sin bearer; se verifica la
  firma `Stripe-Signature` contra `STRIPE_WEBHOOK_SECRET` sobre el body crudo (`rawBody: true`, ruta
  excluida del body-parser). → transición `pending_payment → paid` (`actorType: system`), vacía el
  carrito, genera la `Notification`.
- `POST /orders/:id/confirm` — fallback de demo, sólo con `STRIPE_DEMO_CONFIRM=true` (si no, `404`).
  Hace `paymentIntents.retrieve`; si `succeeded` → `paid`. Cubre "el webhook no llega a localhost".
- **Vaciado del carrito:** en la transición a `paid` (con `PAYMENTS_ENABLED=true`, M5+). En la
  ventana M2→M4 (`PAYMENTS_ENABLED=false`) `POST /orders` vacía el carrito al **crear** el pedido.
  App y agente hacen refetch de `GET /cart` post-checkout en ambos casos.
- **`Idempotency-Key`** (header): tabla `IdempotencyKey { key, userId, endpoint, requestHash,
  responseStatus, responseBody, createdAt }`, `@@unique([userId, key])`, TTL 24h. Misma key + mismo
  body → replay de la respuesta guardada; misma key + body distinto → `409`. Key **client-origin**
  (la genera el cliente Android, viaja `metadata.idempotencyKey` → agente → header). Obligatoria en
  `POST /orders`: warn-only hasta M5, `400` si falta desde M5.

### Admin (M3 + M7)

Se **extiende la app Next.js `admin/`** existente y sus controllers REST `src/admin/*` — **no** hay
SSR nuevo.

- **M3 (rama `feat/e2e-m3-admin`):** la app `admin/` pasa a `/v1` y adopta `/auth/refresh`
  (refresh-on-401, JWT en `localStorage` — la sesión cookie+CSRF se difiere a M7). Tabla nueva
  `AuditLog` + `AuditInterceptor` en los `Admin*Controller`: cada POST/PATCH/DELETE con 2xx deja
  una fila (`actorId`, `actorEmail`, `method`, `path`, `resource`=clase controller, `action`=handler,
  `entityId`, `statusCode`, `changes`=body con `password`/tokens redactados). Nuevo endpoint de
  lectura:

  | Método | Ruta | Notas |
  |---|---|---|
  | GET | `/admin/audit-logs?page=&pageSize=&resource=&actorId=` | Paginado `{ data, page, pageSize, total }`, más nuevas primero. `resource` filtra por clase (`AdminProductsController`). |

- **M4:** `PATCH /admin/orders/:id/status` pasa a la matriz (ver arriba) y el filtro `status` de
  `GET /admin/orders` acepta el enum de 7 estados.
- **M7:** sesión propia del admin (cookie httpOnly, no el bearer móvil) + CSRF; página de auditoría;
  analytics; config del agente.

### i18n del seed (M6, acotado)

Nombres de producto ya traducidos (migración `20260827130000`). Falta: nombres/subtítulos de
categorías, `store`, descripciones, display-names de `Color` → es-419. `GET /products/search` pasa a
matchear también `description`.

---

## Base URL

```
http://<host>:5000/
```

`PORT=5000` (`.env`). En un emulador Android, `<host>` es `10.0.2.2`; en un dispositivo físico en
la misma red, la IP LAN de la máquina que corre el backend.

## Autenticación

JWT Bearer. Los endpoints marcados 🔒 requieren:

```
Authorization: Bearer <accessToken>
```

El token se obtiene de `POST /auth/register` o `POST /auth/login` y no tiene refresh — cuando
vence (`JWT_EXPIRES_IN`, default `1d`), hay que volver a loguear.

> **En `feat/e2e-m1-auth-refresh` (M1) esto cambió:** access token de 15m + refresh token,
> `login`/`register` devuelven `{ accessToken, refreshToken, expiresIn }`, y hay `POST /auth/refresh`
> + `POST /auth/logout`. Ver la sección "Próxima versión (v1) → Auth" arriba. Esta sección se
> reescribe cuando la rama mergee a `master`.

El payload del JWT incluye `sub` (userId), `email` y `role` (`user | admin`) — este último no
necesita ser decodificado por clientes normales, pero los endpoints marcados 🔒🛡️ (admin) lo
exigen: además de un token válido, requieren `role: admin`, si no devuelven `403`. Una cuenta con
`active: false` no puede loguearse (`401` en `POST /auth/login`, mismo mensaje genérico que una
contraseña incorrecta, para no filtrar el estado de la cuenta).

## Formato de error

Formato estándar de Nest (`ValidationPipe`/`HttpException`):

```json
{
  "statusCode": 400,
  "message": "email must be an email" ,
  "error": "Bad Request"
}
```

`message` puede ser `string` o `string[]` (errores de validación de `class-validator`, uno por
campo inválido).

## Nota importante de tipos: `Decimal` viaja como `string`

Prisma serializa sus campos `Decimal` (`Product.price`, `Order.total`, `OrderItem.unitPrice`)
como **string** en el JSON de respuesta (`"199.99"`, no `199.99`) — es el comportamiento default
de `decimal.js` al pasar por `JSON.stringify`. Cualquier cliente tipado (Retrofit/Gson incluido)
tiene que declarar esos campos como `String` y convertirlos explícitamente a número donde haga
falta, o el parseo del JSON falla. Los campos `DateTime` (`createdAt`, `updatedAt`, etc.) también
viajan como `string` (ISO-8601).

## Rate limiting

`@nestjs/throttler`: 100 requests / 60s por IP, global. Excederlo devuelve `429`.

---

## Auth

### `POST /auth/register`

Body:

```json
{ "email": "user@example.com", "password": "mín. 8 caracteres", "name": "string" }
```

`201`:

```json
{ "accessToken": "eyJ..." }
```

Errores: `400` (validación — `email` inválido, `password` < 8 chars, `name` vacío), `409` (ya
existe una cuenta con ese email).

### `POST /auth/login`

Body:

```json
{ "email": "user@example.com", "password": "string" }
```

`200`: `{ "accessToken": "eyJ..." }`

Errores: `400` (validación), `401` (credenciales inválidas).

---

## Users

### `GET /me` 🔒

`200`:

```json
{
  "id": "uuid",
  "email": "string",
  "name": "string",
  "avatarUrl": "string | null",
  "role": "user | admin",
  "active": true,
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601"
}
```

(`passwordHash` nunca se expone.) Errores: `401`, `404` (no debería pasar en uso normal).

---

## Categories

### `GET /categories`

`200`: array de:

```json
{ "id": "uuid", "name": "string", "subtitle": "string | null", "image": "string | null" }
```

Edición del catálogo de categorías: ver **Admin → Categorías** (`/admin/categories`).

---

## Products

### `GET /products?page=&pageSize=`

Query: `page` (int, default `1`, mín `1`), `pageSize` (int, default `20`, `1..100`).

`200`:

```json
{
  "items": [ /* Product con variants, ver abajo */ ],
  "page": 1,
  "pageSize": 20,
  "total": 20
}
```

Forma de cada `Product` en `items`:

```json
{
  "id": "uuid",
  "categoryId": "uuid",
  "name": "string",
  "description": "string",
  "image": "string | null",
  "price": "199.99",
  "store": "string",
  "status": "Hot | New | Normal | Popular",
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601",
  "variants": [
    { "id": "uuid", "productId": "uuid", "color": "string", "sku": "string", "stock": 12 }
  ]
}
```

**`sku` de variante** — identificador estable de la variante (no el `id` uuid). Esquema canónico:
`<slug(nombre del producto)>-<slug(color)>` en minúsculas y solo `[a-z0-9-]`
(p. ej. `wireless-mouse-blue`, `portable-ssd-1tb-lightblue`); si dos variantes colisionarían,
la segunda lleva sufijo `-2`, `-3`, … Es único (`@unique` en la DB) y es el `value` que los
clientes A2UI (`VariantSelector`) y el agente conversacional usan para referirse a una variante
en carrito/stock. El backend lo autogenera con este esquema si no se envía uno explícito al crear
la variante (ver **Admin → Productos**); una vez creado no cambia solo (renombrar el producto no
reescribe SKUs existentes) salvo que se lo regenere o edite a mano desde el panel admin.

### `GET /products/:id`

`200`: el `Product` de arriba (con `variants`) + dos campos agregados:

```json
{
  "...": "...",
  "averageRating": 4.3,
  "reviewCount": 7
}
```

`averageRating` es `0` si el producto no tiene reseñas todavía. Errores: `404`.

### `GET /products/search?q=&category=&minPrice=&maxPrice=&color=&sortBy=&cursor=&pageSize=`

Todos los query params son opcionales:

| Param | Tipo | Notas |
|---|---|---|
| `q` | string | busca en `name` (contains, case-insensitive) |
| `category` | string (uuid) | filtra por `categoryId` exacto |
| `minPrice` / `maxPrice` | number | filtro de rango sobre `price` |
| `color` | string | producto tiene al menos una variante con ese color |
| `sortBy` | `price_asc \| price_desc \| newest` | default `newest` |
| `cursor` | string (uuid de producto) | paginación por cursor — pasar el `nextCursor` de la respuesta anterior |
| `pageSize` | number | default `20`, `1..100` |

`200`:

```json
{ "items": [ /* Product con variants */ ], "nextCursor": "uuid | null" }
```

### `POST /products/:id/alerts` 🔒

Body:

```json
{ "type": "back_in_stock" | "price_drop" }
```

`201`: el `StockAlert` creado (ver forma en **Notifications**). Errores: `400` (validación),
`404` (producto no existe).

---

## Favorites 🔒 (todos los endpoints)

### `GET /favorites`

`200`: array de:

```json
{
  "userId": "uuid",
  "productId": "uuid",
  "createdAt": "ISO-8601",
  "product": { /* Product con variants */ }
}
```

### `POST /favorites/:productId`

Idempotente (upsert) — marcar como favorito un producto ya favorito no falla, no duplica.
`201`/`200`: el registro de favorito (sin `product` anidado). Errores: `404` (producto no
existe).

### `DELETE /favorites/:productId`

`204` sin body. No falla si no era favorito (delete silencioso).

---

## Reviews

### `GET /products/:productId/reviews`

Público, sin auth. `200`: array de:

```json
{
  "id": "uuid",
  "productId": "uuid",
  "userId": "uuid",
  "rating": 5,
  "comment": "string | null",
  "createdAt": "ISO-8601"
}
```

### `POST /products/:productId/reviews` 🔒

Body:

```json
{ "rating": 1, "comment": "opcional" }
```

`rating` entero `1..5`. `201`: la `Review` creada. Errores: `400` (validación), `404` (producto
no existe), `409` (el usuario ya dejó una reseña para este producto — 1 por usuario/producto).

---

## Orders 🔒 (todos los endpoints)

### `GET /orders`

`200`: array de `Order` con `items`. Cada line item trae `variant` acotado a `color` y `sku`
(suficiente para pintar la fila); el `variant.product` completo solo se expande en `GET /orders/:id`.

```json
{
  "id": "uuid",
  "userId": "uuid",
  "status": "pending_payment | paid | preparing | shipped | delivered | cancelled | refunded",
  "total": "349.00",
  "shippingCity": "string",
  "etaDays": 5,
  "trackingNumber": "string | null",
  "trackingCarrier": "string | null",
  "discountCode": "string | null",
  "discountAmount": "0.00",
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601",
  "items": [
    {
      "id": "uuid",
      "orderId": "uuid",
      "variantId": "uuid",
      "quantity": 1,
      "unitPrice": "349.00",
      "variant": { "color": "string", "sku": "string" }
    }
  ]
}
```

### `GET /orders/:id`

`200`: el `Order` de arriba, pero con `items[].variant` (incluyendo `variant.product`) expandido,
más un `timeline` **derivado del historial real** (`OrderStatusHistory`), ordenado por `createdAt`:

```json
{
  "...": "...",
  "items": [
    {
      "id": "uuid",
      "orderId": "uuid",
      "variantId": "uuid",
      "quantity": 1,
      "unitPrice": "349.00",
      "variant": { "id": "uuid", "color": "string", "sku": "string", "stock": 12, "product": { "...": "Product completo" } }
    }
  ],
  "timeline": [
    { "status": "pending_payment", "at": "ISO-8601", "actorType": "buyer" },
    { "status": "paid", "at": "ISO-8601", "actorType": "system" },
    { "status": "preparing", "at": "ISO-8601", "actorType": "admin" }
  ]
}
```

`timeline` es una fila por transición ocurrida (incluida la génesis `pending_payment` al crear el
pedido); `actorType ∈ system | buyer | admin`. Errores: `404` (no existe o no pertenece al
usuario autenticado — ambos casos devuelven el mismo 404, no se filtra por ownership vs.
inexistencia).

### `POST /orders`

Body:

```json
{
  "shippingCity": "string",
  "items": [ { "variantId": "uuid", "quantity": 1 } ],
  "discountCode": "string opcional"
}
```

`items` no puede ser vacío. Crea la orden en estado `pending_payment`, descuenta stock de cada
variante, calcula el subtotal a partir del `price` del producto en el momento de la compra y
escribe la fila génesis de historial — todo en una única transacción de Prisma: si algún ítem no
tiene stock suficiente, no se persiste nada.

Si viene `discountCode`, se valida contra `PromoCode` (mismo criterio que
`GET /promo-codes/:code`) y se aplica al subtotal **antes** de crear el pedido — `total` en la
respuesta ya es el monto final (post-descuento; es lo que se cobra vía `payment.clientSecret`).
`appliesToCategory` (si el código lo trae) acota el descuento a la porción del subtotal de ítems
de esa categoría — nunca deja el `total` negativo (`fixed_amount` se clampea al subtotal elegible).
`discountAmount` en la respuesta es lo restado; `discountCode` queda normalizado a mayúsculas.
`Idempotency-Key` + mismo body (incluyendo `discountCode`) → replay de la respuesta guardada.

`201`: el `Order` creado, misma forma que `GET /orders` (cada `item` con `variant: { color, sku }`,
sin el `product` completo). Errores: `400` (validación del body, o stock insuficiente — mensaje
`Stock insuficiente para <sku>`); `404` genérico `{ statusCode, message, error }` si algún
`variantId` no existe, **o** `404 { error, code: "invalid_discount_code" }` (shape distinta, ver
§ Promo codes) si `discountCode` es inválido/expiró; `409 { error, minPurchase }` si el subtotal no
alcanza el `minPurchase` del código.

### `POST /orders/:id/cancel`  — M4

Cancelación por el comprador. Body opcional `{ "reason": "string" }` (se guarda como `note` en la
fila de historial). Solo procede desde `pending_payment`; repone el stock de cada línea, pasa el
pedido a `cancelled`, escribe la fila de historial (`actorType: buyer`) y dispara un
`Notification` `order_status_changed`. `200`: el `Order` con `timeline`. Errores: `404` (no existe
o no es del usuario), `409 { error, allowedTransitions: [...] }` (el pedido no está en
`pending_payment`).

---

## Notifications 🔒 (todos los endpoints)

`Notification` es una tabla propia (entrega), separada de `StockAlert` (suscripción, vía
`POST /products/:id/alerts`). Se escribe una fila por evento: `order_status_changed` (cada
transición de un pedido del usuario), `back_in_stock` (stock de una variante `0 → >0`),
`price_drop` (baja de precio de un producto). `back_in_stock` / `price_drop` solo llegan a
usuarios con un `StockAlert` no disparado del tipo correspondiente.

### `GET /notifications`

`200`: array de (wire §6.4):

```json
{
  "id": "uuid",
  "type": "order_status_changed | back_in_stock | price_drop",
  "title": "string",
  "body": "string",
  "read": false,
  "notified": false,
  "createdAt": "ISO-8601",
  "deepLink": { "type": "order | product", "id": "uuid" },
  "data": {
    "fromStatus": "paid", "toStatus": "preparing",
    "trackingNumber": "string", "carrier": "string",
    "oldPrice": 120, "newPrice": 99, "sku": "string"
  },
  "product": { "...": "Product — solo en back_in_stock / price_drop, si no null" }
}
```

`data` trae solo las claves del evento (`fromStatus`/`toStatus`/`trackingNumber`/`carrier` para
`order_status_changed`; `oldPrice`/`newPrice` para `price_drop`; `sku` para `back_in_stock`).
`notified` es un espejo back-compat de `read`.

### `PATCH /notifications/:id/read`

Marca la notificación como leída (`readAt`). `200`: la notificación con el wire de arriba.
Errores: `404` (no existe o no pertenece al usuario).

### `POST /notifications/read-all`  — M4

Marca todas las no leídas del usuario. `200`: `{ "count": <n> }`.

---

## Banners

### `GET /banners`

Público, sin auth. Banners promocionales activos, ordenados por `sortOrder` ascendente. `200`:
array de:

```json
{
  "id": "uuid",
  "store": "string",
  "description": "string",
  "image": "string",
  "active": true,
  "sortOrder": 0,
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601"
}
```

---

## Promo codes

### `GET /promo-codes/:code`

Público, sin auth. Valida un código de descuento para la tool `apply_discount_code` del agente
conversacional. `:code` se normaliza a mayúsculas en el lookup (`welcome10` == `WELCOME10`).

`200`:

```json
{
  "code": "WELCOME10",
  "type": "percentage | fixed_amount",
  "value": "10.00",
  "appliesToCategory": "uuid | null",
  "minPurchase": "0.00",
  "validFrom": "ISO-8601",
  "validUntil": "ISO-8601"
}
```

- `value` y `minPurchase` son `Decimal` → viajan como **string** (`"10.00"`), igual que
  `price`/`total`.
- `type: "percentage"` → `value` es el porcentaje de descuento (`"10.00"` = 10 %).
  `type: "fixed_amount"` → `value` es el monto a descontar, en la misma moneda que `price`.
- `appliesToCategory` (si no es `null`) es un `Category.id` — el descuento aplica solo a ítems de
  esa categoría. `minPurchase` es el subtotal mínimo para que el código sea válido.
- Este endpoint es de **preview**: valida el código sin tocar ningún pedido — usalo para mostrarle
  el descuento al usuario antes de pagar. `POST /orders` (§ Orders) hace la validación real y
  **aplica** el descuento al `total` cuando se manda `discountCode` en el body.

Errores: `404 { error, code: "invalid_discount_code" }` si el código no existe **o** si `now` está
fuera de `[validFrom, validUntil]` (expirado o todavía no vigente) — ambos casos devuelven el mismo
`404`. El campo `code` (no confundir con el código del promo) es lo que distingue este error del
`404` genérico de Nest (`{ statusCode, message, error }`) que devuelven otros endpoints — pensado
para que un consumidor no tenga que matchear el string de `error` (pedido de integración, 2026-09-12).
`POST /orders` usa el mismo shape cuando `discountCode` es inválido.

Códigos sembrados por `prisma/seed.ts`: `WELCOME10` (10 % global), `ENVIOGRATIS`
(`fixed_amount` 15, `minPurchase` 100), `CATEGORIA20` (20 % acotado a una categoría,
`minPurchase` 50) y `EXPIRADO5` (vencido a propósito, siempre `404`).

---

## Admin 🔒🛡️

Todos los endpoints de esta sección requieren JWT válido **y** `role: admin` (`RolesGuard`) —
`401` sin token, `403` con token válido pero rol `user`. Pensados para el dashboard de
administración (`admin/`), no para el cliente Android.

**Borrado lógico**: el `DELETE` de productos, variantes y banners nunca hace un `DELETE`
físico en la base — internamente es un `UPDATE` que apaga `visible` (`true → false`).
El registro deja de aparecer en cualquier listado (público y admin) pero sigue existiendo en la
DB, así que pedidos ya creados que referencian ese producto/variante no se ven afectados. No hay
endpoint para revertirlo (restaurar `visible: true`) — por ahora es solo vía acceso directo a la
base. `Product`/`ProductVariant`/`Banner` tienen el campo `visible` en el schema; no se expone
para editar desde ningún DTO. **Excepción**: `DELETE /admin/categories/:id` sí es un borrado
físico (`Category` no tiene `visible`) y solo se permite sobre categorías sin productos.

### Productos — `/admin/products`

| Método | Ruta | Body / Query | Notas |
|---|---|---|---|
| GET | `/admin/products?page=&pageSize=&category=` | — | Igual forma que `GET /products` |
| GET | `/admin/products/:id` | — | Igual forma que `GET /products/:id` |
| POST | `/admin/products` | `{ categoryId, name, description, image?, price, store, status?, variants: [{ color, sku?, stock? }] }` | Crea el producto y sus variantes en una transacción. `sku` es **opcional**: si se omite, el backend lo autogenera con el esquema canónico `<slug(nombre)>-<slug(color)>` (+ sufijo `-N` si choca); si se envía, debe ser `[a-z0-9-]` (segmentos separados por un guión). `image` (si viene) debe ser una URL válida. `404` si `categoryId` no existe o algún `color` no está en el catálogo de `Color`. `409` si el nombre ya existe en la categoría o un `sku` explícito está duplicado. |
| PATCH | `/admin/products/:id` | Cualquier subconjunto de `categoryId/name/description/image/price/store/status` | `image` acepta una URL válida o `null` (para quitar la imagen). `404` si el producto (o la nueva `categoryId`) no existe. Renombrar el producto **no** reescribe los `sku` de sus variantes. |
| DELETE | `/admin/products/:id` | — | Borrado lógico (ver nota arriba) |
| POST | `/admin/products/:id/variants` | `{ color, sku?, stock? }` | `sku` opcional — mismo autogenerado/validación que en `POST /admin/products`. `404` producto no existe o color inválido; `409` si un `sku` explícito choca con otro. |
| PATCH | `/admin/products/:id/variants/:variantId` | Subconjunto de `color/sku/stock` | `sku` debe ser `[a-z0-9-]`. `404`/`409` igual que arriba |
| POST | `/admin/products/:id/variants/:variantId/regenerate-sku` | — | Regenera el `sku` de la variante con el esquema canónico a partir del nombre actual del producto + el color de la variante (+ sufijo `-N` si choca con otra). Devuelve la variante actualizada. `404` si la variante no existe. Pensado para el botón "regenerar SKU" del panel. |
| DELETE | `/admin/products/:id/variants/:variantId` | — | Borrado lógico (ver nota arriba) |

### Categorías — `/admin/categories`

| Método | Ruta | Body | Notas |
|---|---|---|---|
| GET | `/admin/categories` | — | Array completo (misma forma que `GET /categories`, sin paginar) |
| GET | `/admin/categories/:id` | — | Una categoría; `404` si no existe |
| POST | `/admin/categories` | `{ name, subtitle?, image? }` | `image` (si viene) debe ser URL válida. `409` si el `name` ya existe |
| PATCH | `/admin/categories/:id` | Subconjunto de `{ name, subtitle, image }` | `404` si no existe; `409` si el nuevo `name` choca con otra categoría |
| DELETE | `/admin/categories/:id` | — | **Borrado físico** (no hay `visible` en `Category`). `409` si la categoría tiene productos asociados — hay que reasignarlos o eliminarlos primero |

### Banners — `/admin/banners`

CRUD estándar: `GET` (paginado, todos los visibles — activos e inactivos), `GET /:id`, `POST`
(`{ store, description, image, active?, sortOrder? }`), `PATCH /:id` (parcial), `DELETE /:id`
(borrado lógico, ver nota arriba). `active` y `visible` son independientes: `active` lo controla
el admin para pausar/reactivar sin perder el registro; `visible` es exclusivamente el borrado
lógico y no se expone para editar.

### Pedidos — `/admin/orders`

| Método | Ruta | Notas |
|---|---|---|
| GET | `/admin/orders?page=&pageSize=&status=` | Pedidos de **todos** los usuarios (a diferencia de `GET /orders`), incluye `user` (sin `passwordHash`) |
| GET | `/admin/orders/:id` | Igual forma que `GET /orders/:id` + `user`; `404` simple (sin el enmascarado ownership-vs-inexistencia de la versión no-admin) |
| PATCH | `/admin/orders/:id/status` | Body: `{ status?, trackingNumber?, trackingCarrier? }` — `status` solo puede avanzar (`pending_payment → processing → shipped → delivered`), nunca retroceder (`400` si se intenta); tracking se puede setear independientemente del estado |

### Usuarios — `/admin/users`

| Método | Ruta | Notas |
|---|---|---|
| GET | `/admin/users?page=&pageSize=` | Nunca expone `passwordHash` |
| GET | `/admin/users/:id` | — |
| PATCH | `/admin/users/:id` | Body: subconjunto de `{ email, name, avatarUrl }` |
| PATCH | `/admin/users/:id/role` | Body: `{ role: "user" \| "admin" }` — `400` si el admin autenticado intenta revocarse su propio rol |
| PATCH | `/admin/users/:id/active` | Body: `{ active: boolean }` — `400` si el admin autenticado intenta desactivarse a sí mismo; un usuario con `active: false` no puede loguearse |

---

## Resumen de rutas

| Método | Ruta | Auth |
|---|---|---|
| POST | `/auth/register` | No |
| POST | `/auth/login` | No |
| GET | `/me` | Sí |
| GET | `/categories` | No |
| GET | `/products` | No |
| GET | `/products/search` | No |
| GET | `/products/:id` | No |
| POST | `/products/:id/alerts` | Sí |
| GET | `/favorites` | Sí |
| POST | `/favorites/:productId` | Sí |
| DELETE | `/favorites/:productId` | Sí |
| GET | `/products/:productId/reviews` | No |
| POST | `/products/:productId/reviews` | Sí |
| GET | `/orders` | Sí |
| GET | `/orders/:id` | Sí |
| POST | `/orders` | Sí |
| GET | `/notifications` | Sí |
| PATCH | `/notifications/:id/read` | Sí |
| GET | `/banners` | No |
| GET | `/promo-codes/:code` | No |
| GET | `/admin/products` | Admin |
| GET | `/admin/products/:id` | Admin |
| POST | `/admin/products` | Admin |
| PATCH | `/admin/products/:id` | Admin |
| DELETE | `/admin/products/:id` | Admin |
| POST | `/admin/products/:id/variants` | Admin |
| PATCH | `/admin/products/:id/variants/:variantId` | Admin |
| POST | `/admin/products/:id/variants/:variantId/regenerate-sku` | Admin |
| DELETE | `/admin/products/:id/variants/:variantId` | Admin |
| GET | `/admin/categories` | Admin |
| GET | `/admin/categories/:id` | Admin |
| POST | `/admin/categories` | Admin |
| PATCH | `/admin/categories/:id` | Admin |
| DELETE | `/admin/categories/:id` | Admin |
| GET | `/admin/banners` | Admin |
| GET | `/admin/banners/:id` | Admin |
| POST | `/admin/banners` | Admin |
| PATCH | `/admin/banners/:id` | Admin |
| DELETE | `/admin/banners/:id` | Admin |
| GET | `/admin/orders` | Admin |
| GET | `/admin/orders/:id` | Admin |
| PATCH | `/admin/orders/:id/status` | Admin |
| GET | `/admin/users` | Admin |
| GET | `/admin/users/:id` | Admin |
| PATCH | `/admin/users/:id` | Admin |
| PATCH | `/admin/users/:id/role` | Admin |
| PATCH | `/admin/users/:id/active` | Admin |
