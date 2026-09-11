import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtPayload } from '../auth/jwt-payload.type';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateStockAlertDto } from './dto/create-stock-alert.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { SearchProductsQueryDto } from './dto/search-products-query.dto';
import { ProductsService } from './products.service';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('products')
@Controller('products')
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  // Antes de ':id' — si no, Express matchea "/products/search" contra la ruta con param.
  @Get('search')
  search(@Query() query: SearchProductsQueryDto) {
    return this.productsService.search(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.productsService.findOne(id);
  }

  @Get()
  findAll(@Query() query: PaginationQueryDto) {
    return this.productsService.findAll(query);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/alerts')
  createAlert(
    @Param('id') productId: string,
    @Body() dto: CreateStockAlertDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.notificationsService.createAlert(user.sub, productId, dto.type);
  }
}
