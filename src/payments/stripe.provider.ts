import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import type { AppConfig } from '../config/configuration';
import type {
  PaymentIntentResult,
  PaymentProvider,
  WebhookResult,
} from './payment-provider';

/**
 * Implementación con Stripe test (plan E2E §6.5). Se selecciona con `PAYMENT_PROVIDER=stripe`;
 * las 3 `STRIPE_*` keys son obligatorias en ese caso (validado por Zod al arrancar).
 */
@Injectable()
export class StripePaymentProvider implements PaymentProvider {
  readonly name = 'stripe';
  readonly publishableKey: string;
  readonly supportsWebhook = true;
  readonly allowsUnverifiedConfirm: boolean;
  private readonly client: Stripe;
  private readonly webhookSecret: string;
  private readonly currency: string;

  constructor(config: ConfigService<AppConfig, true>) {
    const p = config.get('payments', { infer: true });
    this.publishableKey = p.stripePublishableKey;
    this.webhookSecret = p.stripeWebhookSecret;
    this.currency = p.currency;
    this.allowsUnverifiedConfirm = p.demoConfirm;
    this.client = new Stripe(p.stripeSecretKey);
  }

  async createIntent(params: {
    amountDecimal: number;
    orderId: string;
    userId: string;
    idempotencyKey: string;
  }): Promise<PaymentIntentResult> {
    const intent = await this.client.paymentIntents.create(
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

  verifyWebhook(rawBody: Buffer, signature: string): WebhookResult {
    const event = this.client.webhooks.constructEvent(
      rawBody,
      signature,
      this.webhookSecret,
    );
    if (event.type === 'payment_intent.succeeded') {
      const intent = event.data.object;
      return { type: 'payment_succeeded', orderId: intent.metadata?.orderId };
    }
    return { type: 'ignored' };
  }
}
