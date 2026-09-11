import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtPayload } from '../auth/jwt-payload.type';
import { CartService } from './cart.service';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { MergeCartDto } from './dto/merge-cart.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
import { ApiTags } from '@nestjs/swagger';

/**
 * Carrito persistido por usuario (plan E2E, hito M2). Todas las rutas requieren bearer.
 * `Idempotency-Key` opcional en `POST /cart/items` y `/cart/merge` — se acepta pero todavía no se
 * deduplica (la tabla `IdempotencyKey` llega en M5/B4).
 */
@UseGuards(JwtAuthGuard)
@ApiTags('cart')
@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  getCart(@CurrentUser() user: JwtPayload) {
    return this.cartService.getCart(user.sub);
  }

  @Post('items')
  addItem(@CurrentUser() user: JwtPayload, @Body() dto: AddCartItemDto) {
    return this.cartService.addItem(user.sub, dto);
  }

  @Patch('items/:variantId')
  updateItem(
    @CurrentUser() user: JwtPayload,
    @Param('variantId') variantId: string,
    @Body() dto: UpdateCartItemDto,
  ) {
    return this.cartService.updateItem(user.sub, variantId, dto.quantity);
  }

  @Delete('items/:variantId')
  removeItem(
    @CurrentUser() user: JwtPayload,
    @Param('variantId') variantId: string,
  ) {
    return this.cartService.removeItem(user.sub, variantId);
  }

  @Delete()
  clear(@CurrentUser() user: JwtPayload) {
    return this.cartService.clear(user.sub);
  }

  @Post('merge')
  merge(@CurrentUser() user: JwtPayload, @Body() dto: MergeCartDto) {
    return this.cartService.merge(user.sub, dto.items);
  }
}
