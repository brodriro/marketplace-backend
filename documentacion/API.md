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

`200`: array de `Order` con `items` (sin el detalle de `variant`/`product` anidado):

```json
{
  "id": "uuid",
  "userId": "uuid",
  "status": "pending_payment | processing | shipped | delivered",
  "total": "349.00",
  "shippingCity": "string",
  "etaDays": 5,
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601",
  "items": [
    { "id": "uuid", "orderId": "uuid", "variantId": "uuid", "quantity": 1, "unitPrice": "349.00" }
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

`201`: el `Order` creado con `items` (forma de `GET /orders`, sin `variant` expandido). Errores:
`400` (validación del body, o stock insuficiente — mensaje `Stock insuficiente para <sku>`),
`404` (algún `variantId` no existe).

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
