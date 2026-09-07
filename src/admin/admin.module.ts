import { Module } from '@nestjs/common';
import { BannersModule } from '../banners/banners.module';
import { CategoriesModule } from '../categories/categories.module';
import { JwtAuthModule } from '../auth/jwt-auth.module';
import { OrdersModule } from '../orders/orders.module';
import { ProductsModule } from '../products/products.module';
import { UsersModule } from '../users/users.module';
import { AdminAuditController } from './audit/admin-audit.controller';
import { AuditInterceptor } from './audit/audit.interceptor';
import { AuditLogService } from './audit/audit-log.service';
import { AdminBannersController } from './banners/admin-banners.controller';
import { AdminCategoriesController } from './categories/admin-categories.controller';
import { AdminOrdersController } from './orders/admin-orders.controller';
import { AdminProductsController } from './products/admin-products.controller';
import { AdminUsersController } from './users/admin-users.controller';

@Module({
  imports: [
    JwtAuthModule,
    ProductsModule,
    OrdersModule,
    UsersModule,
    BannersModule,
    CategoriesModule,
  ],
  controllers: [
    AdminProductsController,
    AdminCategoriesController,
    AdminBannersController,
    AdminOrdersController,
    AdminUsersController,
    AdminAuditController,
  ],
  providers: [AuditLogService, AuditInterceptor],
})
export class AdminModule {}
