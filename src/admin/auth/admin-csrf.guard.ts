import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  ADMIN_CSRF_COOKIE,
  ADMIN_CSRF_HEADER,
  ADMIN_SESSION_COOKIE,
} from './admin-auth.cookies';

const MUTATING = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);
/** Rutas admin exentas: el login todavía no tiene cookie CSRF. */
const EXEMPT = [/\/admin\/auth\/login$/, /\/admin\/auth\/refresh$/];

/**
 * Protección CSRF double-submit para el panel admin (plan E2E M7 / B6). Solo aplica a mutaciones
 * `/admin/*` autenticadas **por cookie** (`admin_session`): el header `X-CSRF-Token` tiene que
 * coincidir con la cookie `admin_csrf`. Las requests con `Authorization: Bearer` (app móvil,
 * agente, scripts) se saltean — no son vulnerables a CSRF (no hay credencial ambiental).
 */
@Injectable()
export class AdminCsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const cookies =
      (req as unknown as { cookies?: Record<string, string> }).cookies ?? {};

    if (!/\/admin\//.test(req.path) || !MUTATING.has(req.method)) {
      return true;
    }
    if (EXEMPT.some((re) => re.test(req.path))) {
      return true;
    }
    // Autenticada por Bearer, no por cookie → sin riesgo CSRF.
    const hasBearer = req.headers.authorization?.startsWith('Bearer ');
    if (hasBearer && !cookies[ADMIN_SESSION_COOKIE]) {
      return true;
    }

    const cookieToken = cookies[ADMIN_CSRF_COOKIE];
    const headerToken = req.headers[ADMIN_CSRF_HEADER];
    if (
      !cookieToken ||
      typeof headerToken !== 'string' ||
      headerToken !== cookieToken
    ) {
      throw new ForbiddenException('Token CSRF inválido o ausente');
    }
    return true;
  }
}
