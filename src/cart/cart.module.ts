import { Module } from '@nestjs/common';
import { JwtAuthModule } from '../auth/jwt-auth.module';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';

@Module({
  imports: [JwtAuthModule],
  controllers: [CartController],
  providers: [CartService],
  exports: [CartService],
})
export class CartModule {}
