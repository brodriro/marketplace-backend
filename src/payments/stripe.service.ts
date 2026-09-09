import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { AppConfig } from '../config/configuration';

/**
 * Envoltorio fino del SDK de Stripe (plan E2E §6.5). Con `PAYMENTS_ENABLED=false` no se instancia
 * el cliente y cualquier llamada que lo requiera tira `503` — el flujo de `POST /orders` en esa
 * ventana ni siquiera lo toca (da el pedido por pagado al crearlo).
 */
@Injectable()
export class StripeService {
  private readonly client: Stripe | null;
  readonly enabled: boolean;
  readonly publishableKey: string;
  readonly currency: string;
  private readonly webhookSecret: string;

  constructor(config: ConfigService<AppConfig, true>) {
    const p = config.get('payments', { infer: true });
    this.enabled = p.enabled;
    this.publishableKey = p.stripePublishableKey;
    this.currency = p.currency;
    this.webhookSecret = p.stripeWebhookSecret;
    this.client = p.enabled ? new Stripe(p.stripeSecretKey) : null;
  }

  private require(): Stripe {
    if (!this.client) {
      throw new ServiceUnavailableException(
        'Pagos deshabilitados (PAYMENTS_ENABLED=false)',
      );
    }
    return this.client;
  }

  /**
   * Crea el PaymentIntent de un pedido. `amountDecimal` es el total como número (ej. `199.99`);
   * Stripe cobra en la unidad mínima (centavos). Usa la key client-origin como `idempotencyKey`
   * propio de Stripe para que un reintento del mismo checkout no cree dos PaymentIntents.
   */
  async createPaymentIntent(params: {
    amountDecimal: number;
    orderId: string;
    userId: string;
    idempotencyKey: string;
  }): Promise<{ id: string; clientSecret: string }> {
    const intent = await this.require().paymentIntents.create(
      {
        amount: Math.round(params.amountDecimal * 100),
        currency: this.currency,
        metadata: { orderId: params.orderId, userId: params.userId },
        automatic_payment_methods: { enabled: true },
      },
      { idempotencyKey: `order_pi_${params.idempotencyKey}` },
    );
    return { id: intent.id, clientSecret: intent.client_secret ?? '' };
  }

  /** Verifica la firma `Stripe-Signature` contra `STRIPE_WEBHOOK_SECRET` y parsea el evento. */
  constructEvent(rawBody: Buffer, signature: string): Stripe.Event {
    return this.require().webhooks.constructEvent(
      rawBody,
      signature,
      this.webhookSecret,
    );
  }
}
