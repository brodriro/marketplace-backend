import { Module } from '@nestjs/common';
import { JwtAuthModule } from '../auth/jwt-auth.module';
import { PromoCodesModule } from '../promo-codes/promo-codes.module';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';

@Module({
  imports: [JwtAuthModule, PromoCodesModule],
  controllers: [CartController],
  providers: [CartService],
  exports: [CartService],
})
export class CartModule {}
