# handoff.md — marketplace-backend

> Log reverso de tareas completadas (más reciente arriba). **Las ~10 entradas más recientes** van
> completas (3-6 líneas: **fecha · qué · por qué · archivos clave · follow-ups**). **De la entrada 11
> en adelante** se comprimen a una línea: `### AAAA-MM-DD — título` + lo esencial + rama/PR/pointer de
> evidencia — el archivo real es `git log`. El detalle profundo de la integración con el agente está
> en [`reference/handoff-integracion-agente.md`](reference/handoff-integracion-agente.md).

---

## 2026-09-11 (noche) · `discountCode` se aplica al `total` de `POST /orders` + stemming de color en `search`

- **Qué:** dos follow-ups sin dueño que estaban en `tasks.md`, a pedido explícito del usuario:
  1. `POST /orders` ahora valida `discountCode` contra `PromoCode` (`OrdersService.applyDiscount`,
     mismo criterio 404 que `GET /promo-codes/:code`) y lo resta del `total` **antes** de crear el
     pedido — dejó de ser "cálculo exclusivo del cliente" (así estaba documentado en
     `schema.prisma`/`API.md`, y el usuario decidió explícitamente revertir esa decisión). Nuevas
     columnas `Order.discountCode` / `Order.discountAmount` (migración
     `20260912024636_order_discount_fields`, aplicada al RDS pre-prod). `minPurchase` se chequea
     contra el subtotal completo (`409 { error, minPurchase }` si no alcanza); `appliesToCategory`
     acota el descuento a la porción del subtotal de esa categoría; `fixed_amount` se clampea al
     subtotal elegible (nunca deja `total` negativo). `discountCode` se normaliza a mayúsculas y
     entra en el hash de `Idempotency-Key`.
  2. `ProductsService.search`: el match de color ahora compara por raíz (`colorStem`), no por token
     literal — `"remera negra"` no encontraba nada porque el adjetivo femenino no es substring de
     `Negro` (catálogo es-419: Negro/Rojo cambian por género, Azul/Verde/Celeste no). Se recorta la
     vocal final del token (si mide >3) solo para el filtro de color; no toca `name`/`description`.
- **Por qué:** eran los dos últimos ítems del backlog de `tasks.md`, ambos "sin dueño" desde M5/M6.
  El del descuento tenía una decisión de diseño documentada en contra ("el cliente calcula el
  descuento") — se le mostró esa tensión al usuario antes de tocar el contrato, y pidió
  implementarlo igual + avisarle a `agente` para que ajuste su lado.
- **Archivos clave:** `prisma/schema.prisma` (columnas + comentario de `PromoCode` actualizado),
  `prisma/migrations/20260912024636_order_discount_fields/`, `src/orders/orders.service.ts`
  (`applyDiscount` + `create`), `src/orders/dto/create-order.dto.ts`,
  `src/products/products.service.ts` (`colorStem`), specs de ambos servicios,
  `documentacion/{API.md,CLAUDE.md,openapi.json}`.
- **Verificado:** unit tests (`orders.service.spec.ts` +5 casos: percentage, fixed_amount clampeado,
  `appliesToCategory`, `minPurchase` no alcanzado, código inválido/expirado; `products.service.spec.ts`
  +2 casos de stemming) — 15/15 verde. Smoke-test en vivo contra `:3000`/RDS pre-prod: `WELCOME10`
  (10 %) sobre un Teclado Gamer $89.99 → `total: "80.99"`, `discountAmount: "9"`; `EXPIRADO5` → `404`;
  `ENVIOGRATIS` (minPurchase 100) sobre subtotal $89.99 → `409 { minPurchase: "100.00" }`.
- **Coordinación cross-repo (cerrada la misma noche):** avisado `agente`, que ajustó
  `CheckoutUseCase`/`HttpOrderRepository` (su `master @ e8aa69d`) para mandar `discountCode` y usar
  `discountAmount`/`total` de la respuesta en vez de recalcular; `mobile` confirmó que sus 2
  refactors del día (DTO `String→Double`, limpieza de `ensureAuthenticated()`) no tocan checkout y
  que Gson ignora los campos nuevos sin romper nada (sin UI para descuento todavía, no bloqueante).
  A pedido de `agente`, se agregó `code: "invalid_discount_code"` al `404` de `discountCode`
  inválido/expirado (en `POST /orders` **y** `GET /promo-codes/:code`, mismo shape en los dos) para
  que no dependan de matchear el string del mensaje contra el `404` genérico de "variante no
  encontrada". Verificado en vivo post-cambio (`:3000` en watch mode, recompiló solo).
- **Follow-up sin dueño:** `agente` reservó `apply_discount_code` pero nunca lo "wireó" a un tool
  real — queda dormido hasta que lo hagan (tarea de ellos, no bloqueante).

## 2026-09-11 · `POST /cart/items` — soporte de `Idempotency-Key` (opcional)

- **Qué:** `Idempotency-Key` opcional en `POST /cart/items`, mismo lock-y-replay que
  `OrdersService.create` sobre la tabla `IdempotencyKey`: misma key + mismo body → replay de la
  respuesta guardada (no incrementa cantidad de nuevo); misma key + body distinto → `409`; sin
  header → comportamiento de siempre (`increment`). A diferencia de `/orders`, acá **no** es
  obligatoria (carrito no es una operación de una sola vez) — sin header no rompe clientes
  existentes. Verificado en vivo: retry con misma key no duplica, key nueva sí incrementa, mismo
  key + body distinto da `409`.
- **Por qué:** `@app` detectó vía `manage_cart` que un retry ante un transport error duplicaba
  cantidad en el carrito — gap abierto desde `e2e-M8-20260910-02`, sin cerrar hasta ahora.
- **Archivos clave:** `src/cart/cart.service.ts` (`addItem` + `addItemUnchecked` +
  `hashAddItemRequest`/`isEmptyJson`), `src/cart/cart.controller.ts` (header `Idempotency-Key`).
- **Follow-ups:** falta que `@agente` mande el header en `manage_cart` (como ya hace `checkout`)
  para que el fix tenga efecto end-to-end — sin dueño todavía del lado agente.

---

## 2026-09-11 · M8/B8 follow-up · `@nestjs/swagger` + `GET /docs` + `pnpm run openapi:dump`

- **Qué:** `documentacion/openapi.json` ya no es el esqueleto estático de M0 — se genera desde los
  decorators. `GET /docs` (Swagger UI, montado en `main.ts` sin prefijo `/v1`) sirve el mismo
  documento en vivo; `pnpm run openapi:dump` (script nuevo, `src/openapi-dump.ts`) lo vuelca a
  disco booteando un `INestApplication` sin levantar el server. `src/openapi.ts` centraliza el
  `DocumentBuilder` (título, bearer auth, tags) compartido por ambos caminos. Se agregó
  `@ApiTags(...)` a los 22 controllers para que el doc quede agrupado igual que el esqueleto viejo.
  `documentacion/API.md` actualizado para reflejar que esto ya no es pendiente.
- **Por qué:** último follow-up no bloqueante del hito M8 (ver `tasks.md`), pedido explícito del
  usuario tras cerrar el hilo `track_order`.
- **Archivos clave:** `src/main.ts`, `src/openapi.ts`, `src/openapi-dump.ts`, `package.json`
  (`openapi:dump`), `pnpm-workspace.yaml` (`@scarf/scarf: false` — resuelve el warning de builds
  ignorados de pnpm que quedó a mitad, no relacionado a swagger).
- **Follow-ups / gotchas para la próxima vez:** `@nestjs/swagger@latest` instala la v12, que pide
  `@nestjs/common@^12` — este repo sigue en `^11.x`, así que quedó fijado en `@nestjs/swagger@11.4.7`
  (última compatible con Nest 11). Si se actualiza `@nestjs/common` a v12 en el futuro, subir
  `@nestjs/swagger` a la par. Separado: un `tsconfig.build.tsbuildinfo` corrupto puede hacer que
  `tsc`/`nest build` "tengan éxito" sin generar `dist/` — si `dist/main` da `MODULE_NOT_FOUND` pese a
  "0 errors", borrar el `.tsbuildinfo` y recompilar.

---

## 2026-09-11 · E2E `track_order` dedicado (`e2e-M4-20260911-01`) · 7/7 estados de `OrderStatus`

- **Qué:** corrida e2e coordinada entre `@backend`/`@app`/`@agente` para verificar el flujo
  `track_order` (mobile pide estado de pedido en el chat → `agente-mobile` llama la tool →
  `GET /v1/orders/:id` → respuesta renderizada) contra los 7 estados de `OrderStatus`. `paid`,
  `shipped` y `cancelled` ya existían en `demo@marketplace.dev`; se armaron y transicionaron acá
  los 4 que faltaban (`pending_payment`, `preparing`, `delivered`, `refunded`) vía
  `POST /orders` + `POST /orders/:id/confirm` + `PATCH /admin/orders/:id/status`, tageados con el
  `runId` para correlacionar en `mb-3000.log`. Resultado: **7/7 verificados, nativo y por chat**.
  De paso se confirmó el contrato de `GET /orders/:id` (PK exacta vía `prisma.findUnique`, sin
  lookup por prefix/short-id — el gap de ids truncados a 8 chars en `track_order` es de
  `agente-mobile`/UX) y se detectó (y `@app` resolvió de su lado) que
  `POST /products/:id/alerts` no es idempotente (`stockAlert.create` sin `@@unique`).
- **Por qué:** cobertura pendiente desde el cierre del hilo E2E principal (2026-09-10) — hito
  "bonus" no bloqueante, pedido por el usuario para no dejar 4 estados sin ejercitar en el loop.
- **Archivos clave:** `src/orders/order-transitions.ts` (matriz), `src/admin/orders/admin-orders.controller.ts`,
  `src/common/e2e-run-logger.interceptor.ts` (logging por `X-E2E-Run`). IDs de los 4 pedidos
  sintéticos y detalle completo del readout: `demoCompose/docs/plan-e2e.md` §7.4,
  `demoCompose` `handoff.md` 2026-09-11.
- **Follow-ups:** ninguno bloqueante. `StockAlert` sigue sin constraint único (aceptado por ahora,
  mitigado del lado cliente con guard in-flight).

---

## 2026-09-10 · Plan E2E · limpieza de ramas/worktrees zombie (post-corrida `-02`)

- **Qué:** sync de `master` local (estaba 21 commits atrás de `origin/master`, colgado en
  `feat/e2e-m3-admin` desde antes del cierre) + housekeeping de git. Se verificó por ancestría
  (`git merge-base --is-ancestor`) que `feat/e2e-m3-admin`, `chore/docs-handoff-restructure`,
  `chore/docs-sync`, `feat/e2e-m5-payments`, `feat/e2e-m8-v1-cutover` y `feat/catalog-promo-sku-es-names`
  ya eran ancestros de `origin/master` (mergeadas vía PR) → se borraron las 6 ramas locales +
  las 2 remote que quedaban, y se removieron los worktrees zombie `docs-sync` y `e2e-m5-payments`
  (ambos limpios, sin cambios sin commitear).
- **Por qué:** pedido explícito del usuario tras cerrar el hilo — dejar el repo con una sola rama
  viva además de `master`.
- **Qué queda:** worktree `e2e-m7-admin` (rama `docs/e2e-cierre-2026-09-10`, == `origin/master`)
  sin tocar — sirvió `:3000` para la corrida `-02` de abajo y tenía en ese momento los cambios sin
  commitear que se convirtieron en `0b0b0e2` (esta misma serie de entradas).
- **Archivos clave:** ninguno de código — solo refs de git.

## 2026-09-10 · Plan E2E · corrida adicional `e2e-M8-20260910-02` (post-cierre) — 6/6

- **Qué:** pese a la entrada de cierre de abajo (que se escribió/pusheó en paralelo, ver su nota de
  corrección), el usuario pidió una segunda pasada coordinada del loop completo el mismo día — 3
  sesiones (`@backend` / `@app` / `@agente`), mismo mecanismo que `-01` pero sin resetear datos
  (stock/precio ya tocados por `-01`, alertas ya `notified`). **6/6 criterios §4 verdes:**
  - **#1** PATCH admin "Bolso Bandolera" (`bc505132…`): `price 44.99→39.99` + variante Azul
    (`d49492e7…`) `stock 28→35`. 2 `AuditLog` con `meta.e2eRunId`.
  - **#2** carrito desde el chat quedó en 4× Bolso Bandolera Azul (no los 2 pedidos) — **hallazgo
    de `@agente`, no de este repo:** retry no-idempotente en `manage_cart` (reintento reenvió el
    turno en vez de reusar la key).
  - **#3** checkout → `POST /v1/orders 201` (`5604c85c…`, total `159.96` = 4×`39.99`) →
    `.../confirm 200` → `paid`. `order_status_history` fila `paid/system` con `meta.e2eRunId`. El
    retry del turno de pago reusó el mismo `taskId` (resubscribe SSE, no ejercitó `Idempotency-Key`
    real) pero aun así no duplicó la orden (demo 11→12).
  - **#4** PATCH admin `5604c85c…` `paid→preparing→shipped` (+ `TRK-M8-911`/`OCA`). Timeline 4
    estados; 3 `Notification order_status_changed`; 2 `AuditLog` con `meta.e2eRunId` (history de los
    tramos admin queda `meta:null`, igual comportamiento que en `-01`).
  - **#5** ciclo stock Verde (`crossbody-bag-green`, `8d5e94be…`) `15→0→20`, con una `StockAlert`
    nueva (las 2 de seed/‑01 ya estaban `notified:true`) → `Notification back_in_stock` con
    deep-link a producto, alerta pasa a `notified=true`.
  - **#6** search es-419 + `TurnMeta` — cerrado app+agente, sin verificación server-side acá.
- **Runtime:** mismo `:3000` de la corrida `-01` (sin reiniciar), `origin/master @ 0213307`, RDS
  pre-prod (13/13 migraciones). Mutaciones admin ejecutadas vía API (Bearer admin + `X-E2E-Run`); el
  clasificador de permisos de la sesión de backend pidió aprobación explícita del usuario 3 veces
  (una por cada tanda de PATCH admin).
- **Por qué:** validar que el mecanismo del loop (no solo la primera corrida) sobrevive con datos ya
  modificados — nada estaba "fresco".
- **Archivos clave:** ninguno de código — solo API calls + este handoff. Evidencia app-side y
  capturas (16, `docs/screenshots/e2e-M8-02/`) en `demoCompose/docs/plan-e2e.md` §7.4 (rama
  `worktree-e2e-m8-run02-docs`, mergeada a `master` por `@app`, `9c797cf`).
- **Follow-ups:** idempotencia real de `manage_cart`/reintento de turno en `@agente` (no es de este
  repo) · resto de follow-ups sigue en la entrada de cierre de abajo.

## 2026-09-10 · Plan E2E · CIERRE DEL HILO — sin deploy de prod, todo localhost

- **Corrección (misma noche, ver entradas arriba):** esta entrada se escribió/pusheó en paralelo a
  una segunda corrida coordinada que el usuario sí pidió — `e2e-M8-20260910-02`, 6/6 criterios
  verdes. El cierre de abajo es sobre **código/deploy** (no se reabre el hilo de desarrollo, no hay
  plan de prod), no sobre el loop de validación — una corrida adicional de smoke-test no lo contradice.
- **Qué:** el hilo E2E cross-repo (M0→M8, "loop completo app + admin") se da por **cerrado** en
  cuanto a alcance de código/deploy. Decisión del usuario del 2026-09-10 tras el ensayo del loop:
  **no hay deploy de prod, todo corre en localhost.** El cutover a `api.brodriro.dev` (M8/B8) queda
  **descartado** — el dominio ni siquiera resuelve.
- **Estado final del código:** `origin/master @ 0213307`. PR #10 (`feat/e2e-m8-v1-cutover`) = cutover
  a `/v1` puro + remoción del alias `VERSION_NEUTRAL` (rutas sin `/v1` → 404; el webhook del
  proveedor conserva su ruta propia). PR #9 (`chore/docs-handoff-restructure`) = docs. Los dos ya
  mergeados; sus ramas remote fueron borradas.
- **Entregable final = ensayo `e2e-M8-20260910-01`** (2026-09-10, 3 sesiones, 1 pasada, `:3000` sobre
  RDS pre-prod, `PAYMENT_PROVIDER` sin setear → `bypass`): **6/6 criterios §4 del loop verdes**
  (PATCH admin precio/stock → visible en la app · carrito armado desde el chat a precio vivo ·
  checkout desde el chat → `paid` · ciclo de estados admin + timeline + notificaciones ·
  `back_in_stock` · search es-419 + búsqueda vacía). Readout en
  `demoCompose/docs/screenshots/e2e-M8/README`. Detalle en la entrada M8 de abajo.
- **Runtime que queda:** `:3000` sirviendo `/v1` sobre el RDS pre-prod (13/13 migraciones).
  `demoCompose/buildTypes.gradle` apunta a `192.168.31.63:3000/v1/`. `@agente` en `:2500`.
- **Por qué:** el usuario decidió no reintroducir el ciclo de build/deploy de prod para este
  ejercicio; el loop quedó demostrado end-to-end contra localhost + RDS pre-prod, que es suficiente.
- **Archivos clave:** este `handoff.md` + `tasks.md` (hilo marcado cerrado, "blocked" vaciado).
- **Follow-ups (no bloqueantes, hacer solo si el usuario lo pide):**
  `@nestjs/swagger` + `GET /docs` + `pnpm run openapi:dump` (hoy `openapi.json` es el esqueleto de
  M0) · `discountCode` en `POST /orders` se hashea pero no se aplica al `total` · search
  `"remera negra"` (fem.) necesita stemming · wording de la sección Payments de `CLAUDE.md` sobre
  `OrderStatusHistory.meta` + `e2eRunId` impreciso para el path admin (las transiciones admin
  estampan `e2eRunId` solo en `AuditLog`, no en el history; solo el tramo system lo pone en el
  history) · ~~ramas remote zombie a borrar: `feat/e2e-m3-admin`, `feat/catalog-promo-sku-es-names`~~
  hecho (ver entrada de limpieza arriba).

## 2026-09-10 · Plan E2E · M8 — cutover `/v1` + ensayo del loop completo (rama `feat/e2e-m8-v1-cutover`)

- **`feat/e2e-m8-v1-cutover @ 3309fb6`** (de `origin/master ef97de5`), pusheada, **sin merge** (PR lo
  abre el usuario).
- **Cutover `VERSION_NEUTRAL`:** `src/main.ts` → `enableVersioning({ defaultVersion: '1' })` (se saca
  el alias sin prefijo que sostuvo el cutover de app + agente — los tres ya pegan a `/v1`). Rutas sin
  `/v1` → `404`. El webhook del proveedor conserva su ruta sin prefijo por decisión propia del
  controller (`@Controller({ version: VERSION_NEUTRAL })` en `webhooks/`, URL estable en el
  dashboard). `test/auth.e2e-spec.ts` alineado (rutas a `/v1/...`, el caso "responde también bajo
  /v1" pasa a "ya no responde sin /v1" → 404). `tsc` + `eslint` verdes.
- **Ensayo del loop (runId `e2e-M8-20260910-01`, 3 sesiones, 1 pasada):** `:3000` sirviendo
  `feat/e2e-m8-v1-cutover @ 3309fb6` (= `master ef97de5` + el commit del cutover), `PAYMENT_PROVIDER`
  sin setear → `bypass`, RDS pre-prod. **6/6 criterios §4 verdes** (verificación app-side por
  demoCompose, server-side acá):
  - **#1** PATCH admin sobre "Bolso Bandolera" (`bc505132…`): `price 49.99→44.99` + variante Azul
    `stock 23→30`. 2 filas `AuditLog` con `meta.e2eRunId`.
  - **#2** carrito armado desde el chat ("2 Bolso Bandolera azul") aparece en el carrito nativo a
    precio vivo ($44,99 c/u, subtotal $89,98).
  - **#3** checkout desde el chat → `POST /v1/orders 201` (`bec865cd…`) → `POST /orders/:id/confirm
    200` → `paid`. `order_status_history` fila `paid/system` con `meta.e2eRunId`.
  - **#4** PATCH admin `bec865cd…` `paid→preparing→shipped` (+ `TRK-M8-910 / OCA`). Timeline 4
    estados (buyer/system/admin/admin); 3 `Notification order_status_changed`; 2 filas `AuditLog`
    con `meta.e2eRunId`. **Las transiciones admin NO propagan `e2eRunId` a `order_status_history.meta`**
    (queda `null`) — su correlación va por `AuditLog`. Solo el tramo system lo estampa en el history.
  - **#5** `StockAlert back_in_stock` seedeado como demo user (`50c2e058…`), ciclo stock Verde
    (`crossbody-bag-green`) `10→0→15` → `emitBackInStock` → `Notification` (`deepLink` product,
    `data.sku`), `StockAlert.notified=true`.
  - **#6** search es-419 con resultados + búsqueda vacía → affordance "no encontré X" (cerrado
    app+agente, sin PATCH backend).
- **Archivos clave:** `src/main.ts`, `test/auth.e2e-spec.ts`.
- **Follow-ups:** merge de `feat/e2e-m8-v1-cutover` + `chore/docs-handoff-restructure` (PRs los abre
  el usuario); redeploy `api.brodriro.dev` + cutover de `MARKETPLACE_BASE_URL` (lo dispara el
  usuario, post-ensayo); `@nestjs/swagger` `GET /docs` + `pnpm run openapi:dump` (pendiente M8 doc);
  wording de la sección Payments de `CLAUDE.md` sobre `OrderStatusHistory.meta` + `e2eRunId` quedó
  impreciso para el path admin; `discountCode` no se aplica al `total`; `"remera negra"` (fem.)
  necesita stemming. `:3000` (PID 8868) sigue levantado con el build M8.

## 2026-09-09 · Plan E2E · M6/B7-data + M7/B6 admin polish (rama `feat/e2e-m7-admin-polish`)

- **`feat/e2e-m7-admin-polish`** (de `origin/master 57f9d22`), **mergeada — PR #8 → `master @ ef97de5`
  (2026-09-10)**. Commits: `fe79cbe` (endpoints analytics/monitor/agent-config) · `a7ae19b`
  (M6/B7-data) · `dd32d4a` (UI admin + fix drift M4/M6) · `205b0df` (backend cookie/CSRF) · `816a741`
  (admin/ a modo cookie) · `a38806b` (docs).
- **M6/B7-data:** migración `20260909180000_i18n_es419_catalog` (categorías, `products.store`,
  `colors.name` + `product_variants.color` → es-419) **+ `feed.json`** + `search` matchea color de
  variante. **Migración aplicada al RDS pre-prod (2026-09-10)** vía `prisma migrate deploy` (13/13,
  `migrate status` "up to date"). Verificada por query: categorías `Bolsos/Calzado/Electrónica/
  Novedades/Ropa` (+ subtítulos "N productos"), `colors.name` `Negro/Celeste/Azul/Verde/Rojo`,
  `product_variants.color` 100 % es-419 (0 colores EN del set del seed), `products.store` es-419.
  Filas no-seed con `store: "Test"/"ZZ"` y una variante `color: "Brown"` son artefactos previos de
  pruebas admin, ajenos a esta migración.
- **M7/B6 backend:** `GET /admin/analytics` (+`/low-stock`), `GET /admin/monitor/{notifications,
  stock-alerts}`, `GET /admin/agent-config` (checksum md5 del catálogo). Users mgmt ya estaba.
  Sesión admin **dual-mode**: se agregó cookie httpOnly + CSRF (`POST /admin/auth/login|refresh|
  logout`, `GET /admin/auth/session`, `JwtStrategy` lee Bearer O cookie, `AdminCsrfGuard`
  double-submit solo para cookie). Bearer intacto. Smoke curl del flujo cookie/CSRF: login→3
  cookies, GET con cookie→200, PATCH sin `X-CSRF-Token`→403, con token→200, no-admin→403.
- **M7/B6 UI (`admin/`):** páginas `/analytics` `/monitor` `/audit-logs` `/agent-config` +
  nav; fix drift: `OrderStatus` a 7 estados, `ADMIN_ALLOWED_TRANSITIONS` (matriz §6.3),
  `KNOWN_COLORS` es-419, `status-badge` 7 estados, `orders/[id]` usa la matriz. `next build` verde.
  ⚠️ El login por cookie del panel **no se probó en runtime** (sin click-through acá) — testear
  contra un backend levantado; si falla, el backend sigue soportando Bearer.
- **Coordinadas del 2026-09-09** (`:3000` = master, runId `e2e-M4-20260909-01`): M3 §7.1 (PATCH
  admin price 99.99→89.99 + variant stock 20→33, delta confirmado read-only en la app,
  `AuditLog.meta.e2eRunId` en las 6 PATCH → §7.1 M3 fila `y`) + C4/C5 (§4 #4: `daf1ad38`
  `preparing`→`shipped`+tracking → 2 `Notification order_status_changed`, deep-link a pedido OK;
  §4 #5: restock crossbody-bag-green 0→10 → `Notification back_in_stock`, `StockAlert` `notified`,
  deep-link a producto OK). demoCompose: los 2 escenarios ✅.
- **Follow-ups:** test runtime del login por cookie del panel (no probado con click-through);
  `"remera negra"` (fem.) necesita stemming para matchear; reiniciar `:3000` desde el nuevo `master`
  (corría código pre-M6/M7 contra el RDS ya i18n).

## 2026-09-09 · Plan E2E · M5/B4 — e2e conjunto CERRADO (3 tiers)

- **Corrida `e2e-M5-20260909-01`, 2 escenarios contra `:3000` (`feat/e2e-m5-payments @ ae5564c`,
  `PAYMENT_PROVIDER=bypass`, RDS pre-prod):**
  - **Nativo (C3):** app → carrito → checkout → PaymentScreen → confirm bypass → `PaymentSuccessScreen`.
    `mb-3000.log`: `POST /v1/orders 201` + `POST /v1/orders/<id>/confirm 200`. Order `b9df9d26…` →
    `paid`; `OrderStatusHistory` `paid/system.meta.e2eRunId = "e2e-M5-20260909-01"` (verificado en RDS).
  - **Hand-off del chat (C6/A2):** agente `checkout` → `POST /orders 201` (crea `daf1ad38…`); CTA
    `client:navigate` interceptado por el VM → PaymentScreen → confirm 200 (app). Order `daf1ad38…`
    → `paid` + fold-in estampado.
  - 3 tiers verdes (app logcat + `:2500` + `mb-3000.log`), cero 5xx.
- **Fix `ae5564c`:** la respuesta de `POST /orders` traía `order.paymentIntentId: null` (snapshot
  de dentro de la tx) — ahora se refleja el id en memoria tras el update.
- **Follow-up M8:** el `MarketplaceHttpClient` del agente pega a `POST /orders` **sin `/v1`** —
  anda por el alias `VERSION_NEUTRAL`, que M8 remueve. Anotado para `@agente`.
- **Pendiente:** merge de `feat/e2e-m5-payments` (`@ ae5564c`) → `master` (PR). C3/C6 de demoCompose
  van por su propio PR (`feat/e2e-c3-c6-checkout`).

## 2026-09-08 · Plan E2E · M5/B4 pago (provider-agnostic, bypass por defecto) — rama `feat/e2e-m5-payments`

- **`feat/e2e-m5-payments`** (cortada de `origin/master 59707b4`), pusheada, sin merge. Código
  completo, `tsc` + `nest build` + eslint + jest verdes. Migración **aplicada al RDS pre-prod**
  (`20260908180000`, verificada por query). `:3000` levantado con el código M5.
- **Provider-agnostic** (decisión del usuario 2026-09-08): el pago está detrás de
  `PaymentProvider` (`src/payments/payment-provider.ts`). `PAYMENT_PROVIDER` elige la impl:
  - **`bypass`** (default, `bypass.provider.ts`) — sin servicio externo, `clientSecret` sintético,
    `supportsWebhook=false`, `POST /orders/:id/confirm` marca `paid` sin verificar cobro. **No
    cobra.** Documentado en `plan.md` → "Pendiente para producción": cambiar a proveedor real
    antes de F&F/prod.
  - **`stripe`** (`stripe.provider.ts`) — Stripe test real; las 3 `STRIPE_*` keys pasan a ser
    obligatorias (Zod).
- **Schema** (`20260908180000`, aditivo, aplicado): `IdempotencyKey` (`@@unique([userId,key])`,
  `requestHash`, `response Json`), `Order.paymentIntentId`, `OrderStatusHistory.meta` (fold-in
  `e2eRunId` acordado con demoCompose).
- **Código:** `@nestjs/schedule` + `stripe` (sólo lo usa `stripe.provider`). `main.ts` →
  `rawBody:true`. `OrdersService.create` reescrito: idempotencia (lock por la fila
  `IdempotencyKey`, replay por `(userId,key)`+`requestHash` normalizado, `409` sin
  `insufficientStockSkus` si el body difiere), stock valida-todo-antes → `409 { insufficientStockSkus }`,
  `payment.createIntent()` + `{ order, payment { provider, clientSecret, publishableKey } }` si
  `PAYMENTS_ENABLED`. `markPaidBySystem` (idempotente) para webhook/confirm/sweep.
  `WebhooksController` (`VERSION_NEUTRAL`; `404` si el provider no expone webhooks).
  `OrderPaymentSweepService` (`@Cron` c/min). Unit: `orders.service.spec.ts` (idempotencia + stock).
- **Follow-ups:** `discountCode` se acepta y hashea pero no se aplica al `total` (integración
  `promo-codes` = follow-up). Regenerar `openapi.json` es M8 (ya refleja el contrato M5 con
  `provider: "stripe"` — ahora `provider` puede ser `"bypass"`). **Antes de F&F/prod:** proveedor
  real + webhook + `STRIPE_DEMO_CONFIRM=false` (ver `plan.md`).

## 2026-09-08 · Plan E2E · M6/B7 search por tokens (rama `feat/e2e-m6-i18n-seed`)

- **`feat/e2e-m6-i18n-seed @ aa877cc`** (cortada de `origin/master 829e0e7` = M0..M4 mergeado),
  pusheada, sin merge.
- `ProductsService.search`: `q` se parte en tokens y cada uno tiene que aparecer en `name` **o**
  `description` (`AND` de `OR`s, insensible a mayúsculas). Antes matcheaba la frase completa contra
  `name` solo — "bolso de cuero" / "zapatillas correr" no encontraban nada. Sin `q` (o solo
  espacios) no agrega filtro de texto; category/price/color intactos.
- `src/products/products.service.spec.ts` nuevo — 4 casos (tokenización, espacios, sin `q`,
  filtros combinados). `nest build` + `tsc -p tsconfig.build.json` + eslint verdes; smoke contra el
  RDS pre-prod (instancia temporal `:3001`): 5 consultas multi-palabra → 1 resultado correcto c/u.
- **Pendiente de B7 (parte de datos, no hecha):** `categories.name` / `products.description` /
  display-names de `Color` → es-419 + migración de datos + `seed-data/feed.json`. Sin eso "remera
  negra" no matchea. Toca el RDS pre-prod → espera decisión del usuario.

## 2026-09-07 · Plan E2E · M3 commiteado/pusheado + M4/B3+B5 código (rama `feat/e2e-m4-lifecycle`)

- **M3 / B6:** el WIP que estaba sin commitear se cerró en `feat/e2e-m3-admin` (`c94c6cd`) y se
  pusheó a `origin`. Sin merge — espera verificación app-side + el PATCH pre-prod de la prueba
  coordinada §7.1 (lo dispara el usuario, ninguna sesión en background).
- **Correlación E2E Capa 2** (`c056b8e`, plan-e2e.md §7.2): `AuditInterceptor` lee `X-E2E-Run`
  (regex `^e2e-M\d+-\d{8}-\d{2}$`) → `AuditLog.meta.e2eRunId`; cliente admin `rawRequest()` manda
  el header si `NEXT_PUBLIC_E2E_RUN`. Migración `20260907130000_add_audit_log_meta` (aditiva) **sin
  aplicar**.
- **M4 / B3 + B5** (rama `feat/e2e-m4-lifecycle`, código completo, sin aplicar migración, sin merge):
  - **Schema:** enum `OrderStatus` 7 estados (`processing`→`preparing`, +`paid/cancelled/refunded`),
    enum `OrderActorType`, `OrderStatusHistory`, enum `NotificationType`, `Notification`. Migración
    `20260907140000_add_order_lifecycle_and_notifications` (hand-written: `ALTER TYPE` + 2 tablas +
    FKs + backfill de fila génesis por pedido existente).
  - **B3:** `src/orders/order-transitions.ts` (matriz §6.3) → `409 { error, allowedTransitions }`.
    `POST /orders` escribe fila génesis. `updateStatus` (admin): valida matriz, exige tracking en
    `→shipped` y `reason` en `→refunded`, restock solo en `cancelled` (§6.3), escribe historial
    (`actorType: admin`, `actorId`), dispara notificación. `PATCH /admin/orders/:id/status` sin
    `status` sigue siendo update de tracking solo. `POST /orders/:id/cancel` (buyer, solo
    `pending_payment`, `{reason?}`). `timeline` de `GET /orders/:id` sale de `OrderStatusHistory`
    (`+actorType`).
  - **B5:** `NotificationsService` reescrito — `Notification` para entrega, `StockAlert` sigue
    siendo la suscripción. `GET /notifications` serializa el wire §6.4 (`read`, `deepLink`, `data`,
    `product` solo en back_in_stock/price_drop, `notified` espejo). `POST /notifications/read-all`
    (`{count}`). Triggers: `emitOrderStatusChanged` (post-tx, best-effort), `emitBackInStock`
    (`ProductsService.updateVariant`, stock 0→>0), `emitPriceDrop` (`ProductsService.update`, baja
    de precio). Los `emit*` nunca lanzan.
- **Verificación:** `tsc -p tsconfig.build.json` exit 0, `nest build` verde, eslint verde, unit 1/1.
  **NO corrido:** e2e (sin specs backend de orders/notif — la verificación es app-side por C4/C5).
- **Migraciones aplicadas al RDS pre-prod (2026-09-08):** `20260907130000_add_audit_log_meta` +
  `20260907140000_add_order_lifecycle_and_notifications` vía `prisma migrate deploy`. `migrate
  status` → "up to date" (11/11). Verificado por query directa: `audit_logs.meta`, tablas
  `order_status_history` / `notifications`, enums `OrderStatus` (7 valores, `processing` renombrado),
  `OrderActorType`, `NotificationType`; backfill de fila génesis corrió dentro del deploy.
- **`:3000` sirviendo M4 (2026-09-08):** `node dist/main.js` desde el worktree, contra el RDS
  pre-prod. Smoke autenticado OK: `GET /v1/orders/:id` → `timeline:[{status,at,actorType}]`,
  `item.variant.product` anidado, rutas M4 mapeadas. Pedidos preexistentes: génesis backfilled
  `actorType:"system"`.
- **Capa 2 — interceptor global (`4371187`):** `E2eRunLoggerInterceptor` (`APP_INTERCEPTOR`) loguea
  `[e2e] <runId> <method> <path> <status>` por request con header `X-E2E-Run` válido, en TODA ruta.
  Cubre el tramo agente→backend en rutas no-admin (carrito/pedidos de usuario) que no pasan por
  `AuditInterceptor`. No-op sin el header. `AuditLog.meta.e2eRunId` sigue siendo la evidencia del
  tramo admin. §7.2/§7.3 actualizados por demoCompose para reflejar "log line, no fila DB" en
  rutas no-admin.
- **E2E de correlación M4 (C10, 2026-09-08):** demoCompose disparó el turno real
  (`runId=e2e-M4-20260908-01`, "agrega 1 Auriculares Pro negro al carrito"). `mb-3000.log` capturó
  `[e2e] e2e-M4-20260908-01 POST /v1/cart/items 201` + los `GET /v1/cart` alrededor. Tramo
  agente→backend ✅. Falta el grep de `:2500` (agente) para que demoCompose flipee §7.1/§7.4 M4 a
  `coord-test-ready=y`.
- **Follow-ups:** el PATCH admin de M3 para el tramo admin de §7.1; merges de `feat/e2e-m3-admin` +
  `feat/e2e-m4-lifecycle` a master tras el sign-off e2e; specs e2e backend de orders/notif;
  regenerar `openapi.json` (M8); B4/M5 (Stripe, toca `pending_payment → paid`); B7 reseed es-419
  (RC1 — "remera negra" no matchea `name` en inglés).

## 2026-09-07 · Plan E2E · M1+M2 mergeados a master + M3/B6 admin (rama)

- **Merge:** `feat/e2e-m2-cart` (`9f75272` = M0+B1+B2) → `master`, fast-forward, pusheado a
  `origin/master`. La sesión app verificó el checkpoint #1 e2e en emulador (auth+refresh, `/v1`,
  carrito de la app == carrito del backend) antes del merge. Ramas de feature borradas.
- **M3 / B6 (en `feat/e2e-m3-admin`, sin merge):**
  - Backend: modelo `AuditLog` + migración `20260907005057_add_audit_log` (RDS pre-prod).
    `AuditInterceptor` (`src/admin/audit/`) en los 5 `Admin*Controller` — escribe una fila por
    POST/PATCH/DELETE con 2xx (`actorId/email`, `resource`=clase, `action`=handler, `entityId`,
    `changes`=body con password/tokens redactados). `GET /v1/admin/audit-logs` paginado
    (`AdminAuditController`, `?page/pageSize/resource/actorId`). Nunca tumba la request si falla.
  - App Next.js `admin/`: `api-client.ts` → base URL `/v1`, `api.login` devuelve `{accessToken,
    refreshToken, expiresIn}`, `api.logout` (POST `/auth/logout`), **refresh-on-401 con retry único**
    y guard de refresh en vuelo. `auth.ts` guarda el par (`setTokens`/`clearTokens`). `.env.local`
    → `http://192.168.31.63:3000/v1`. Backend `CORS_ORIGINS` suma `http://192.168.31.63:3500`.
  - Productos CRUD + lista/detalle de Pedidos **ya existían** en la app admin — M3 no los reescribe.
  - **Sesión cookie httpOnly + CSRF: diferida a M7** (decisión del usuario, opción B: el admin
    adopta `/auth/refresh` con el JWT en `localStorage`, mínimo cambio).
- **Verificación:** admin build verde, backend e2e 13/13 + unit 1/1 + lint, smoke: login admin por
  `/v1/auth/login` → PATCH stock de variante → fila en `audit_logs` con el actor y el body; los GET
  no se auditan.
- **Follow-ups:** verificación criterio #1/#2 del loop por la sesión app (edita stock/precio en el
  admin → la app lo ve); commit + merge de `feat/e2e-m3-admin`; endurecer sesión admin en M7.

## 2026-09-06 · Plan E2E · M2 / B2 — carrito persistido (borrador, rama, sin merge)

- **Qué:** rama `feat/e2e-m2-cart` (stack sobre `feat/e2e-m1-auth-refresh`). Modelos `Cart`
  (1:1 usuario) + `CartItem` (`@@unique([cartId, variantId])`, FK a `ProductVariant`), migración
  `20260906225213_add_cart` **aplicada al RDS pre-prod**. `src/cart/` (module + controller +
  service + 3 DTO): `GET /cart`, `POST /cart/items`, `PATCH /cart/items/:variantId`,
  `DELETE /cart/items/:variantId`, `DELETE /cart`, `POST /cart/merge`. Precio **vivo** (se
  recalcula con `product.price` en cada respuesta; `Decimal.toFixed(2)` → string). Escritura acepta
  `variantId` **o** `sku` (exactamente uno, si no `400`). `merge` = unión con
  `quantity = max(local, server)`. `GET /cart` sin ítems → `200 {items:[],itemCount:0,
  subtotal:"0.00"}` (no `404`). `Idempotency-Key` se acepta pero **todavía no deduplica** (tabla
  `IdempotencyKey` llega en M5/B4). El carrito no valida stock (eso es `POST /orders`).
- **Por qué:** hito M2 — fuente de verdad única del carrito para app (C1) y agente (A1).
- **Archivos clave:** `prisma/schema.prisma` + `prisma/migrations/20260906225213_*`, `src/cart/**`,
  `src/app.module.ts`.
- **Verificación:** `tsc`/lint limpios, `pnpm test` 1/1, smoke con curl contra `:3000` → RDS los 6
  endpoints + errores (400 sin key, 404 sku inválido, 404 patch de línea inexistente).
- **Soft-delete:** `merge`/`addItem` con variante `visible:false` → `404`. `GET /cart` **omite**
  las líneas cuya variante/producto quedó `visible:false` (la fila queda en la DB) — el cliente
  nunca ve un ítem fantasma.
- **Follow-ups:** tests e2e del carrito; commit + merge coordinado con M1.

## 2026-09-06 · Plan E2E · M1 / B1 — auth con refresh + `/v1` (rama, sin merge)

- **Qué:** rama `feat/e2e-m1-auth-refresh`. Modelo `RefreshToken` (+ migración
  `20260906222633_add_refresh_token`, **aplicada al RDS pre-prod**). `AuthService` emite par
  access (JWT 15m, claim `typ:"access"`) + refresh opaco (32B base64url, hash sha256 en DB, TTL
  30d). `POST /auth/refresh` (rota + revoca el presentado; reuso de uno revocado → revoca la
  `familyId` entera). `POST /auth/logout` (204 idempotente). `login`/`register` devuelven
  `{ accessToken, refreshToken, expiresIn }` (aditivo). `main.ts` → `enableVersioning` URI
  `['1', VERSION_NEUTRAL]` (rutas bajo `/v1` **y** sin prefijo durante el cutover; el alias se
  saca en M8). `UsersService.setActive(false)` revoca las familias del usuario. Config: env
  `JWT_ACCESS_EXPIRES_IN` / `JWT_REFRESH_EXPIRES_IN` (reemplazan `JWT_EXPIRES_IN`).
- **Por qué:** hito M1 del plan E2E — cerrar G1 (sin roles/refresh; el authenticator de la app
  re-logueaba entero).
- **Archivos clave:** `prisma/schema.prisma` + `prisma/migrations/20260906222633_*`,
  `src/auth/{auth.service,auth.controller,jwt-payload.type,jwt-auth.module,duration.util}.ts`,
  `src/auth/dto/refresh.dto.ts`, `src/main.ts`, `src/config/{configuration,env.validation}.ts`,
  `src/users/users.service.ts`, `.env.example`, `test/auth.e2e-spec.ts`.
- **Verificación:** `pnpm test` 1/1, `pnpm run test:e2e` 13/13 (incluye rotación/reuso/logout +
  prefijo `/v1`), lint limpio, smoke con curl contra `:3000` → RDS pre-prod OK.
- **Follow-ups:** merge + flag-day del `/v1` coordinado con app/agente (hoy `VERSION_NEUTRAL` deja
  todo sin romper). Commit pendiente (esperando revisión C2 de la sesión app). `admin@marketplace.dev`
  ya lo sembraba el seed. **Infra tocada aparte:** `test/jest-e2e.json` + `jest` de `package.json`
  ganan `moduleNameMapper` para el `.js` del cliente Prisma 7, y `test:e2e` corre con
  `--experimental-vm-modules` (antes el suite e2e no levantaba — pre-existente en `master`).
  `nest build` sigue necesitando borrar `tsconfig.build.tsbuildinfo` si deja `dist/` a medias
  (ver memoria `build-empty-dist-tsbuildinfo`).

## 2026-09-06 · Plan E2E cross-repo — M0 (freeze de contrato)

- **Qué:** coordinación con las sesiones `demoCompose` y `agente-mobile` del plan E2E "loop completo
  app + admin". Se congeló el contrato v1: auth con par access+refresh (access 15m, refresh opaco
  30d con rotación + detección de reuso), `/cart` persistido (precio vivo, merge `max(local,server)`),
  ciclo de vida del pedido de 7 estados + matriz de transiciones + `OrderStatusHistory`, modelo
  `Notification` propio (separa suscripción de entrega), pago Stripe test (PaymentIntent + Payment
  Sheet), `Idempotency-Key` client-origin, rutas bajo `/v1`. Se escribió el esqueleto de
  `documentacion/openapi.json` + la sección "Próxima versión (v1)" de `API.md`.
- **Por qué:** cerrar las brechas para un E2E production-ish (roles reales, pago, fulfilment con
  eventos, carrito compartido) antes de arrancar la implementación (M1).
- **Archivos clave:** `documentacion/openapi.json` (nuevo), `documentacion/API.md`, `CLAUDE.md`
  (nota "notifications = stock alerts" marcada v0 + delta M4). Plan canónico:
  `demoCompose/docs/plan-e2e.md` §6.
- **Follow-ups:** M1 (auth + refresh + `/v1` + seed `admin@marketplace.dev`) — ver `tasks.md`.
  Decisión del usuario: admin = extender la Next.js `admin/` existente, no SSR. Sin cambios de
  código todavía.

---

> **Entradas 11+ — una línea cada una** (detalle en `git log`):

### 2026-08-29 — Reestructura de docs (layout de 4 archivos)
`documentacion/` → `context/plan/tasks/handoff.md` + sección `## Documentación` en `CLAUDE.md`; `handoff-integracion-agente.md` → `reference/`; `API.md` sigue generándose del código. Modelo común coordinado en los 3 repos. Follow-up: merge de `chore/docs-restructure`.

### 2026-08-27 — Prueba conjunta e2e 4/4 + fix `GET /orders`
Las 3 sesiones corrieron el e2e contra el RDS (nombres ES, auth real, Home→carrito→`POST /orders`→pago, chat A2UI); 4/4. Fix en el acto: `items[].variant {color,sku}` en `GET /orders` y en la respuesta de `POST /orders`. Commits `554cc70`,`f06fae4` (en `master`). Follow-ups: redeploy `api.brodriro.dev`, `400` stock con `insufficientStockSkus` (hecho en M5), limpieza de usuarios throwaway.

### 2026-08-27 — Fix seed: variantes por (producto, color)
Al traducir nombres a ES el seed dejó de matchear variantes por SKU y duplicó 74 (79→153); se borraron y el seed ahora matchea `(productId, color)`. Commit `ae95df8`.

### 2026-08-27 — Promo codes + autogeneración de SKU + nombres de producto en ES
Módulo `src/promo-codes/` (`GET /promo-codes/:code`, público), `sku` opcional + autogen en `POST /admin/products|.../variants` + `regenerate-sku`, migración de datos 19 `products.name` EN→ES. Migraciones `20260827120000`+`20260827130000` aplicadas al RDS + seed. Commit `3ab22f4` (en `master`). Follow-up: redeploy `api.brodriro.dev`.

### 2026-08-26 — Panel admin: CRUD de productos y categorías
CRUD de productos y categorías en la sub-app `admin/` (con su propio `CLAUDE.md`/`AGENTS.md`). Commit `f855488`.
