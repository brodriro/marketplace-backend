import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtPayload } from '../auth/jwt-payload.type';
import { FavoritesService } from './favorites.service';
import { ApiTags } from '@nestjs/swagger';

@UseGuards(JwtAuthGuard)
@ApiTags('favorites')
@Controller('favorites')
export class FavoritesController {
  constructor(private readonly favoritesService: FavoritesService) {}

  @Get()
  findAll(@CurrentUser() user: JwtPayload) {
    return this.favoritesService.findAllForUser(user.sub);
  }

  @Post(':productId')
  add(@Param('productId') productId: string, @CurrentUser() user: JwtPayload) {
    return this.favoritesService.add(user.sub, productId);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':productId')
  remove(
    @Param('productId') productId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.favoritesService.remove(user.sub, productId);
  }
}
