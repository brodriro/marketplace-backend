# context.md — marketplace-backend

> Contexto base. Léelo al empezar cualquier tarea. Estable — cambia poco.
> El detalle de arquitectura vive en [`../CLAUDE.md`](../CLAUDE.md); este archivo no lo duplica.

## Qué es

Backend REST en NestJS 11 para la app de marketplace de `demoCompose` (app Android en repo
aparte). Reemplaza el mock estático de esa app (`feed.json`) con persistencia real en PostgreSQL
vía Prisma 7. También sirve al agente conversacional A2A del repo `agente-mobile`.

Commits, comentarios de código y docs en **español**.

## Principios

- **Los DTO son el punto de enforcement** del shape de request (`ValidationPipe` global con
  `whitelist` + `forbidNonWhitelisted`). Campos desconocidos se rechazan, no se ignoran.
- **El wire contract manda.** `Decimal` (`price`, `total`, `unitPrice`, `value`, `minPurchase`)
  y `DateTime` viajan como **string** en JSON — es lo que los clientes esperan, no "arreglar".
- **No construir endpoints que nadie consume.** Antes de agregar algo "para el agente", revisar
  si `agente-mobile` ya lo resuelve de su lado (ver contratos abajo).
- Idempotencia en el seed: re-correrlo no duplica datos.

## Stack

- NestJS 11 + pnpm
- PostgreSQL + Prisma 7 (`@prisma/adapter-pg`, cliente generado en `src/generated/prisma`,
  gitignored). Prisma 7 **no** configura el datasource declarativamente — se arma en
  `prisma.config.ts` (CLI) y en `src/prisma/prisma.service.ts` (app), que deben mantenerse en sync.
- JWT Bearer sin refresh token (`@nestjs/jwt` + `passport-jwt`), `bcrypt` para hashing
- `class-validator` / `class-transformer`, `helmet`, `@nestjs/throttler` (100 req/60s por IP)

## Contratos con los otros repos

| Con | Contrato | Canónico en |
|---|---|---|
| `demoCompose` (`mobile`, Android) | Shape de la API que consume la grilla / detalle / carrito / favoritos / pedidos | **`documentacion/API.md` de este repo** (se genera del código) |
| `demoCompose` (`mobile`) | Catálogo A2UI / `catalog.schema.json` (componentes `ProductItem`, `VariantSelector`, …) | **`demoCompose`** |
| `demoCompose` + `agente-mobile` | Formato de `ProductVariant.sku` (`<slug(producto)>-<slug(color)>`, opaco/estable) | **`src/products/sku.util.ts` de este repo** — no cambiar el formato sin coordinar |
| `agente-mobile` (agente A2A) | Auth opción B (usuario efímero por sesión), carrito in-memory en el agente, `GET /promo-codes/:code` de solo validación | **`documentacion/reference/handoff-integracion-agente.md`** de este repo |

El plan de diseño global (diagnóstico, modelo de datos, justificación de stack) es
`docs/plan-marketplace-backend.md` en `demoCompose`, no acá.

## Índice de docs

- [`plan.md`](plan.md) — dirección, hitos, decisiones abiertas, coordinación cross-repo
- [`tasks.md`](tasks.md) — tareas activas (todo/doing/blocked) + "retomar acá"
- [`handoff.md`](handoff.md) — log de tareas completadas (más reciente arriba)
- [`API.md`](API.md) — referencia de endpoints (generada del código; no se duplica en `context.md`)
- [`reference/`](reference/) — detalle profundo
  - [`reference/handoff-integracion-agente.md`](reference/handoff-integracion-agente.md) —
    contratos confirmados al agente, correcciones a su mock, datos de `/auth/register`, decisiones
- [`../CLAUDE.md`](../CLAUDE.md) — detalle de arquitectura (ciclo Auth/Users, Orders, Notifications, seeding)
- `../README.md` — setup local
- `admin/` es una sub-app con su propio `CLAUDE.md` / `AGENTS.md` — **fuera del alcance de estos docs**
