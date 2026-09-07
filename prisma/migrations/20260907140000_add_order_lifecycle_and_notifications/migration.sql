-- Ciclo de vida de pedidos + notificaciones (plan-e2e.md §6.3 / §6.4 — hito M4 · B3+B5).
--
-- Enum OrderStatus: renombra 'processing' -> 'preparing' y suma 'paid'/'cancelled'/'refunded'
-- (4 -> 7 estados). Las filas existentes con 'processing' quedan como 'preparing' automáticamente
-- (RENAME VALUE no reescribe datos, sólo la etiqueta del tipo).
--
-- Nota de compatibilidad: 'ALTER TYPE ... ADD VALUE' no admite ejecutarse dentro de una
-- transacción en PostgreSQL < 12. El RDS es 14+, y esta migración no *usa* los valores nuevos en
-- SQL (el backfill sólo inserta el estado actual de cada pedido), así que es segura. Si un runner
-- la envuelve en BEGIN/COMMIT y PG se queja, aplicar los cuatro ALTER TYPE de OrderStatus sueltos
-- y luego el resto.

-- AlterEnum
ALTER TYPE "OrderStatus" RENAME VALUE 'processing' TO 'preparing';
ALTER TYPE "OrderStatus" ADD VALUE 'paid';
ALTER TYPE "OrderStatus" ADD VALUE 'cancelled';
ALTER TYPE "OrderStatus" ADD VALUE 'refunded';

-- CreateEnum
CREATE TYPE "OrderActorType" AS ENUM ('system', 'buyer', 'admin');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('order_status_changed', 'back_in_stock', 'price_drop');

-- CreateTable
CREATE TABLE "order_status_history" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL,
    "actorType" "OrderActorType" NOT NULL,
    "actorId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "productId" TEXT,
    "orderId" TEXT,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "order_status_history_orderId_idx" ON "order_status_history"("orderId");

-- CreateIndex
CREATE INDEX "notifications_userId_idx" ON "notifications"("userId");

-- CreateIndex
CREATE INDEX "notifications_userId_readAt_idx" ON "notifications"("userId", "readAt");

-- AddForeignKey
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: fila génesis de historial por cada pedido existente (estado actual, actor 'system',
-- fecha = createdAt del pedido) para que `GET /orders/:id.timeline` no quede vacío tras el corte.
INSERT INTO "order_status_history" ("id", "orderId", "status", "actorType", "actorId", "createdAt")
SELECT gen_random_uuid(), "id", "status", 'system', NULL, "createdAt"
FROM "orders";
