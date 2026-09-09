import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtPayload } from '../auth/jwt-payload.type';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrdersService } from './orders.service';

/** `X-E2E-Run` sólo se propaga a `meta` si matchea el formato de runId (plan E2E §7.2). */
const E2E_RUN_ID_RE = /^e2e-M\d+-\d{8}-\d{2}$/;
const e2eRunId = (h?: string): string | undefined =>
  h && E2E_RUN_ID_RE.test(h) ? h : undefined;

@UseGuards(JwtAuthGuard)
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  findAll(@CurrentUser() user: JwtPayload) {
    return this.ordersService.findAllForUser(user.sub);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.ordersService.findOne(user.sub, id);
  }

  /**
   * Requiere header `Idempotency-Key` client-origin (§6.5) — desde M5 es `400` si falta.
   * `201` con `{ order }` o `{ order, payment }`; `409` por stock (`insufficientStockSkus`) o por
   * conflicto de idempotencia (misma key + body distinto).
   */
  @Post()
  create(
    @Body() dto: CreateOrderDto,
    @CurrentUser() user: JwtPayload,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException('Falta el header Idempotency-Key');
    }
    return this.ordersService.create(user.sub, dto, idempotencyKey.trim());
  }

  /** Cancelación por el comprador — solo desde `pending_payment` (§6.3). */
  @Post(':id/cancel')
  @HttpCode(200)
  cancel(
    @Param('id') id: string,
    @Body() dto: CancelOrderDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.ordersService.cancelByBuyer(user.sub, id, dto.reason);
  }

  /** Fallback de demo (`STRIPE_DEMO_CONFIRM=true`): marca el pedido `paid` sin webhook. `404` si el flag está off. */
  @Post(':id/confirm')
  @HttpCode(200)
  confirm(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Headers('x-e2e-run') xE2eRun?: string,
  ) {
    return this.ordersService.confirmDemo(user.sub, id, e2eRunId(xE2eRun));
  }
}
