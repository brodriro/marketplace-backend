import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { PaymentsModule } from '../payments/payments.module';
import { WebhooksController } from './webhooks.controller';

// El endpoint queda en `/webhooks/stripe` por compat con lo ya configurado; si entra otro proveedor
// con webhooks se agrega su ruta acá.
@Module({
  imports: [OrdersModule, PaymentsModule],
  controllers: [WebhooksController],
})
export class WebhooksModule {}
