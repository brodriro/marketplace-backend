import { randomBytes } from 'node:crypto';
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request, Response } from 'express';
import { AuthService } from '../../auth/auth.service';
import { LoginDto } from '../../auth/dto/login.dto';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { Roles } from '../../auth/roles.decorator';
import { RolesGuard } from '../../auth/roles.guard';
import { CurrentUser } from '../../auth/current-user.decorator';
import type { JwtPayload } from '../../auth/jwt-payload.type';
import { Role } from '../../generated/prisma/client';
import { ApiTags } from '@nestjs/swagger';
import {
  ADMIN_REFRESH_COOKIE,
  clearSessionCookies,
  setSessionCookies,
} from './admin-auth.cookies';

/**
 * Sesión del panel admin por cookie httpOnly + CSRF double-submit (plan E2E M7 / B6). Alternativa
 * al `Authorization: Bearer` (que sigue funcionando para la app móvil / agente / scripts). El
 * token nunca viaja en el body: `admin_session` (access, httpOnly), `admin_refresh` (refresh,
 * httpOnly), `admin_csrf` (legible por JS, se reenvía en `X-CSRF-Token`).
 */
@ApiTags('admin')
@Controller('admin/auth')
export class AdminAuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly jwt: JwtService,
  ) {}

  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{
    user: { id: string; email: string; role: Role };
    csrfToken: string;
  }> {
    const tokens = await this.auth.login(dto);
    const payload = this.jwt.verify<JwtPayload>(tokens.accessToken);
    if (payload.role !== Role.admin) {
      throw new ForbiddenException('Se requiere rol admin');
    }
    const csrfToken = randomBytes(32).toString('hex');
    setSessionCookies(res, tokens, csrfToken);
    return {
      user: { id: payload.sub, email: payload.email, role: payload.role },
      csrfToken,
    };
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ csrfToken: string }> {
    const raw = (req as unknown as { cookies?: Record<string, string> })
      .cookies?.[ADMIN_REFRESH_COOKIE];
    if (!raw) {
      throw new UnauthorizedException('Sin sesión admin');
    }
    const tokens = await this.auth.refresh(raw);
    const payload = this.jwt.verify<JwtPayload>(tokens.accessToken);
    if (payload.role !== Role.admin) {
      clearSessionCookies(res);
      throw new ForbiddenException('Se requiere rol admin');
    }
    const csrfToken = randomBytes(32).toString('hex');
    setSessionCookies(res, tokens, csrfToken);
    return { csrfToken };
  }

  @Post('logout')
  @HttpCode(204)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const raw = (req as unknown as { cookies?: Record<string, string> })
      .cookies?.[ADMIN_REFRESH_COOKIE];
    if (raw) {
      await this.auth.logout(raw).catch(() => undefined);
    }
    clearSessionCookies(res);
  }

  /** El panel lo llama al montar para saber si hay sesión válida (por cookie o Bearer). */
  @Get('session')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.admin)
  session(@CurrentUser() user: JwtPayload) {
    return { user: { id: user.sub, email: user.email, role: user.role } };
  }
}
