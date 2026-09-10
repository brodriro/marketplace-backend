import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AppConfig } from '../config/configuration';
import { ADMIN_SESSION_COOKIE } from '../admin/auth/admin-auth.cookies';
import { JwtPayload } from './jwt-payload.type';

/** Lee el access token de la cookie httpOnly de la sesión admin (además del header Bearer). */
const fromAdminSessionCookie = (req: Request): string | null => {
  const cookies = (req as unknown as { cookies?: Record<string, string> })
    .cookies;
  return cookies?.[ADMIN_SESSION_COOKIE] ?? null;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService<AppConfig, true>) {
    super({
      // Bearer (app móvil + agente) o cookie httpOnly (panel admin, M7).
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        fromAdminSessionCookie,
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.get('jwt.secret', { infer: true }),
    });
  }

  validate(payload: JwtPayload): JwtPayload {
    return payload;
  }
}
