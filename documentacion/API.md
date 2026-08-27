# API — marketplace-backend

Documentación generada a partir del código real (`src/**/*.controller.ts`, `*.service.ts`,
`*.dto.ts`, `prisma/schema.prisma`), no del plan original — es la fuente de verdad para
implementar cualquier cliente (Android incluido).

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
  "status": "pending_payment | processing | shipped | delivered",
  "total": "349.00",
  "shippingCity": "string",
  "etaDays": 5,
  "trackingNumber": "string | null",
  "trackingCarrier": "string | null",
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
más un `timeline` sintético derivado de `status`/`createdAt`/`updatedAt` (no hay tabla de
historial de estados):

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
    { "status": "pending_payment", "at": "ISO-8601" },
    { "status": "processing", "at": "ISO-8601" }
  ]
}
```

`timeline` incluye solo los estados desde `pending_payment` hasta el `status` actual de la orden
(en el orden fijo `pending_payment → processing → shipped → delivered`). Errores: `404` (no
existe o no pertenece al usuario autenticado — ambos casos devuelven el mismo 404, no se filtra
por ownership vs. inexistencia).

### `POST /orders`

Body:

```json
{
  "shippingCity": "string",
  "items": [ { "variantId": "uuid", "quantity": 1 } ]
}
```

`items` no puede ser vacío. Crea la orden en estado `pending_payment`, descuenta stock de cada
variante y calcula `total` a partir del `price` del producto en el momento de la compra — todo
en una única transacción de Prisma: si algún ítem no tiene stock suficiente, no se persiste nada.

`201`: el `Order` creado, misma forma que `GET /orders` (cada `item` con `variant: { color, sku }`,
sin el `product` completo). Errores: `400` (validación del body, o stock insuficiente — mensaje
`Stock insuficiente para <sku>`), `404` (algún `variantId` no existe).

---

## Notifications 🔒 (todos los endpoints)

Las "notificaciones" son las alertas de stock/precio creadas vía `POST /products/:id/alerts`
(no hay una tabla `Notification` separada — `StockAlert.notified` hace de flag de leído).

### `GET /notifications`

`200`: array de:

```json
{
  "id": "uuid",
  "userId": "uuid",
  "productId": "uuid",
  "type": "back_in_stock | price_drop",
  "notified": false,
  "createdAt": "ISO-8601",
  "product": { /* Product SIN variants */ }
}
```

### `PATCH /notifications/:id/read`

Marca `notified: true`. `200`: el `StockAlert` actualizado (sin `product` anidado). Errores:
`404` (no existe o no pertenece al usuario).

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
- El backend **no** aplica el descuento en `POST /orders` (que no acepta `discountCode`) — este
  endpoint es solo validación; el total con descuento lo calcula el cliente.

Errores: `404` si el código no existe **o** si `now` está fuera de `[validFrom, validUntil]`
(expirado o todavía no vigente) — ambos casos devuelven el mismo `404`.

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
