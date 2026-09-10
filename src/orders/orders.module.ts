import { Module } from '@nestjs/common';
import { JwtAuthModule } from '../auth/jwt-auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { CartModule } from '../cart/cart.module';
import { PaymentsModule } from '../payments/payments.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { OrderPaymentSweepService } from './order-payment-sweep.service';

@Module({
  imports: [JwtAuthModule, NotificationsModule, CartModule, PaymentsModule],
  controllers: [OrdersController],
  providers: [OrdersService, OrderPaymentSweepService],
  exports: [OrdersService],
})
export class OrdersModule {}
