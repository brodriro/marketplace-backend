import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { Role } from '../../generated/prisma/client';
import { AdminMonitorService } from './admin-monitor.service';
import { ApiTags } from '@nestjs/swagger';
import {
  NotificationsMonitorQueryDto,
  StockAlertsMonitorQueryDto,
} from './monitor-query.dto';

/** Monitor global de notificaciones y alertas de stock (plan E2E M7 / B6). Solo lectura. */
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.admin)
@ApiTags('admin')
@Controller('admin/monitor')
export class AdminMonitorController {
  constructor(private readonly monitor: AdminMonitorService) {}

  @Get('notifications')
  notifications(@Query() query: NotificationsMonitorQueryDto) {
    return this.monitor.notifications(query);
  }

  @Get('stock-alerts')
  stockAlerts(@Query() query: StockAlertsMonitorQueryDto) {
    return this.monitor.stockAlerts(query);
  }
}
