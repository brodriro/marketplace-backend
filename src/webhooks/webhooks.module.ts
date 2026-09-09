import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { PaymentsModule } from '../payments/payments.module';
import { WebhooksController } from './webhooks.controller';

@Module({
  imports: [OrdersModule, PaymentsModule],
  controllers: [WebhooksController],
})
export class WebhooksModule {}
