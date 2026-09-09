-- Pago Stripe test + idempotencia de POST /orders (plan-e2e.md §6.5 — hito M5 · B4).
-- Aditivo: 2 columnas nullable + 1 tabla nueva. Sin backfill.

-- AlterTable
ALTER TABLE "orders" ADD COLUMN "paymentIntentId" TEXT;

-- AlterTable
ALTER TABLE "order_status_history" ADD COLUMN "meta" JSONB;

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idempotency_keys_createdAt_idx" ON "idempotency_keys"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_keys_userId_key_key" ON "idempotency_keys"("userId", "key");

-- AddForeignKey
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
