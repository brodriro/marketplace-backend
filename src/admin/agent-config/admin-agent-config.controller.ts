import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { Role } from '../../generated/prisma/client';
import { AdminAgentConfigService } from './admin-agent-config.service';

/** `GET /v1/admin/agent-config` — versión/checksum del catálogo + config de la integración (M7 / B6). */
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.admin)
@Controller('admin/agent-config')
export class AdminAgentConfigController {
  constructor(private readonly agentConfig: AdminAgentConfigService) {}

  @Get()
  get() {
    return this.agentConfig.get();
  }
}
