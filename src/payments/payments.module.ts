import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/configuration';
import { BypassPaymentProvider } from './bypass.provider';
import { PAYMENT_PROVIDER, type PaymentProvider } from './payment-provider';
import { StripePaymentProvider } from './stripe.provider';

/**
 * Resuelve el `PaymentProvider` activo según `PAYMENT_PROVIDER` (`bypass` por defecto). Lo consumen
 * `OrdersModule` (crear el intento de pago) y `WebhooksModule` (verificar el webhook).
 */
@Module({
  providers: [
    {
      provide: PAYMENT_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>): PaymentProvider => {
        const provider = config.get('payments.provider', { infer: true });
        const impl: PaymentProvider =
          provider === 'stripe'
            ? new StripePaymentProvider(config)
            : new BypassPaymentProvider();
        if (impl.name === 'bypass') {
          new Logger('Payments').warn(
            'PAYMENT_PROVIDER=bypass — los pagos NO se cobran y la confirmación se saltea. ' +
              'No usar en friend&family / producción.',
          );
        }
        return impl;
      },
    },
  ],
  exports: [PAYMENT_PROVIDER],
})
export class PaymentsModule {}
