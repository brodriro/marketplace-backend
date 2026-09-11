import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { Role } from '../../generated/prisma/client';
import { AdminAnalyticsService } from './admin-analytics.service';
import { LowStockQueryDto } from './low-stock-query.dto';
import { ApiTags } from '@nestjs/swagger';

/** Métricas de solo lectura para el dashboard admin (plan E2E M7 / B6). No se auditan (son GET). */
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.admin)
@ApiTags('admin')
@Controller('admin/analytics')
export class AdminAnalyticsController {
  constructor(private readonly analytics: AdminAnalyticsService) {}

  @Get()
  summary() {
    return this.analytics.summary();
  }

  @Get('low-stock')
  lowStock(@Query() query: LowStockQueryDto) {
    return this.analytics.lowStock(query);
  }
}
