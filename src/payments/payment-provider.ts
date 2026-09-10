/**
 * Contrato del proveedor de pago (plan E2E §6.5). El backend NO está atado a Stripe: cualquier
 * proveedor (Stripe, MercadoPago, un mock, …) implementa esto y se elige por `PAYMENT_PROVIDER`.
 *
 * El proveedor por defecto es `bypass`: no llama a ningún servicio externo, entrega un
 * `clientSecret` sintético y NO verifica el cobro — `POST /orders/:id/confirm` marca `paid` a
 * ciegas. Sirve para desarrollo y para el e2e del loop. **Antes de friend&family / producción hay
 * que configurar un proveedor real** (ver `documentacion/plan.md` → "Pendiente para prod").
 */
export interface PaymentIntentResult {
  /** Id del intento en el proveedor (se guarda en `Order.paymentIntentId`). */
  id: string;
  /** Secreto que el cliente usa para confirmar el pago (Payment Sheet, checkout, etc.). */
  clientSecret: string;
}

export interface WebhookResult {
  /** `payment_succeeded` dispara `pending_payment -> paid`; `ignored` no hace nada. */
  type: 'payment_succeeded' | 'ignored';
  orderId?: string;
}

export interface PaymentProvider {
  /** Nombre corto expuesto en `payment.provider` de la respuesta de `POST /orders`. */
  readonly name: string;
  /** Clave pública para el cliente (`''` si el proveedor no la necesita, p. ej. bypass). */
  readonly publishableKey: string;
  /** `true` si el proveedor confirma el cobro server-side vía webhook (Stripe sí, bypass no). */
  readonly supportsWebhook: boolean;
  /**
   * `true` si se acepta `POST /orders/:id/confirm` sin verificar el cobro contra el proveedor.
   * `bypass` → siempre; `stripe` → sólo con `STRIPE_DEMO_CONFIRM=true` (webhook no llega a local).
   */
  readonly allowsUnverifiedConfirm: boolean;

  createIntent(params: {
    amountDecimal: number;
    orderId: string;
    userId: string;
    idempotencyKey: string;
  }): Promise<PaymentIntentResult>;

  /** Verifica y normaliza un webhook entrante. Sólo se llama si `supportsWebhook`. */
  verifyWebhook(rawBody: Buffer, signature: string): WebhookResult;
}

/** Token DI del proveedor activo. */
export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');
