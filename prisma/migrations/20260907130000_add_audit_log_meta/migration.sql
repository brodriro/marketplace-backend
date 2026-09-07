-- Capa 2 de correlación E2E (plan-e2e.md §7.2): columna de metadata de transporte en audit_logs.
-- Aditiva y nullable: filas existentes quedan con meta = NULL, sin backfill.
ALTER TABLE "audit_logs" ADD COLUMN "meta" JSONB;
