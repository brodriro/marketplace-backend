import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { Role } from '../../generated/prisma/client';
import { AuditLogQueryDto } from './audit-log-query.dto';
import { AuditLogService } from './audit-log.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.admin)
@Controller('admin/audit-logs')
export class AdminAuditController {
  constructor(private readonly auditLog: AuditLogService) {}

  @Get()
  findAll(@Query() query: AuditLogQueryDto) {
    return this.auditLog.findAll(query);
  }
}
