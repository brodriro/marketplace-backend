import { Module } from '@nestjs/common';
import { StripeService } from './stripe.service';

/** Provee el envoltorio de Stripe. Lo consumen `OrdersModule` (crear PaymentIntent) y el módulo
 * de webhooks (verificar firma + marcar `paid`). */
@Module({
  providers: [StripeService],
  exports: [StripeService],
})
export class PaymentsModule {}
