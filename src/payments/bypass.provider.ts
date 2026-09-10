import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type {
  PaymentIntentResult,
  PaymentProvider,
  WebhookResult,
} from './payment-provider';

/**
 * Proveedor de pago "sin proveedor": no llama a ningún servicio externo. `createIntent` devuelve
 * un `clientSecret` sintético para que el cliente pueda seguir el flujo, y la confirmación se
 * bypassea (`POST /orders/:id/confirm` marca `paid` sin verificar cobro). Es el default.
 *
 * ⚠️ NO cobra nada. Sustituir por un proveedor real antes de friend&family / producción.
 */
@Injectable()
export class BypassPaymentProvider implements PaymentProvider {
  readonly name = 'bypass';
  readonly publishableKey = '';
  readonly supportsWebhook = false;
  readonly allowsUnverifiedConfirm = true;

  createIntent(params: {
    orderId: string;
    idempotencyKey: string;
  }): Promise<PaymentIntentResult> {
    const id = `bypass_pi_${params.orderId}`;
    return Promise.resolve({
      id,
      clientSecret: `${id}_secret_${params.idempotencyKey}`,
    });
  }

  verifyWebhook(): WebhookResult {
    throw new ServiceUnavailableException(
      'El proveedor de pago "bypass" no procesa webhooks',
    );
  }
}
