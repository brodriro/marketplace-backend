import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { CurrentUser } from '../../auth/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import type { JwtPayload } from '../../auth/jwt-payload.type';
import { Role } from '../../generated/prisma/client';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { AuditInterceptor } from '../audit/audit.interceptor';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { UpdateUserActiveDto } from '../../users/dto/update-user-active.dto';
import { UpdateUserRoleDto } from '../../users/dto/update-user-role.dto';
import { UpdateUserDto } from '../../users/dto/update-user.dto';
import { UsersService } from '../../users/users.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.admin)
@UseInterceptors(AuditInterceptor)
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  findAll(@Query() query: PaginationQueryDto) {
    return this.usersService.findAllAdmin(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findByIdSafe(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(id, dto);
  }

  @Patch(':id/role')
  setRole(
    @Param('id') id: string,
    @Body() dto: UpdateUserRoleDto,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    return this.usersService.setRole(id, dto.role, currentUser.sub);
  }

  @Patch(':id/active')
  setActive(
    @Param('id') id: string,
    @Body() dto: UpdateUserActiveDto,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    return this.usersService.setActive(id, dto.active, currentUser.sub);
  }
}
