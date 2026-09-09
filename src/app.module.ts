import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AdminModule } from './admin/admin.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { E2eRunLoggerInterceptor } from './common/e2e-run-logger.interceptor';
import { AuthModule } from './auth/auth.module';
import { BannersModule } from './banners/banners.module';
import { CartModule } from './cart/cart.module';
import { CategoriesModule } from './categories/categories.module';
import { configuration, validateEnv } from './config';
import { FavoritesModule } from './favorites/favorites.module';
import { NotificationsModule } from './notifications/notifications.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentsModule } from './payments/payments.module';
import { PrismaModule } from './prisma/prisma.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { ProductsModule } from './products/products.module';
import { PromoCodesModule } from './promo-codes/promo-codes.module';
import { ReviewsModule } from './reviews/reviews.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      load: [configuration],
    }),
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 100 }],
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    UsersModule,
    CategoriesModule,
    ProductsModule,
    PromoCodesModule,
    FavoritesModule,
    CartModule,
    ReviewsModule,
    OrdersModule,
    NotificationsModule,
    BannersModule,
    PaymentsModule,
    WebhooksModule,
    AdminModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: E2eRunLoggerInterceptor },
  ],
})
export class AppModule {}
