import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';
import type { JwtPayload } from '../../auth/jwt-payload.type';
import { AuditLogService } from './audit-log.service';

const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

/**
 * Formato del identificador de corrida de prueba coordinada (plan E2E §7.2). Un header `X-E2E-Run`
 * que no matchee se ignora por completo — nunca se persiste texto arbitrario en `meta`.
 */
const E2E_RUN_ID_RE = /^e2e-M\d+-\d{8}-\d{2}$/;

/** Devuelve el `X-E2E-Run` sólo si es un id válido; si no, `undefined`. */
function extractE2eRunId(
  header: string | string[] | undefined,
): string | undefined {
  const value = Array.isArray(header) ? header[0] : header;
  return value && E2E_RUN_ID_RE.test(value) ? value : undefined;
}

/**
 * Escribe una fila en `audit_logs` por cada mutación exitosa sobre un controller admin. Se aplica
 * con `@UseInterceptors(AuditInterceptor)` en cada `Admin*Controller`. Las lecturas (GET) y las
 * requests que terminan en error no se registran.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly auditLog: AuditLogService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: JwtPayload }>();

    if (!MUTATING_METHODS.has(req.method)) {
      return next.handle();
    }

    const res = context.switchToHttp().getResponse<Response>();
    const paramEntityId =
      (req.params?.variantId as string | undefined) ??
      (req.params?.id as string | undefined);
    const e2eRunId = extractE2eRunId(req.headers['x-e2e-run']);

    return next.handle().pipe(
      tap((body) => {
        void this.auditLog.record({
          actorId: req.user?.sub,
          actorEmail: req.user?.email,
          method: req.method,
          path: req.originalUrl,
          resource: context.getClass().name,
          action: context.getHandler().name,
          entityId: paramEntityId ?? extractId(body),
          statusCode: res.statusCode,
          changes: req.body as unknown,
          e2eRunId,
        });
      }),
    );
  }
}

function extractId(body: unknown): string | undefined {
  if (body && typeof body === 'object' && 'id' in body) {
    const id = body.id;
    return typeof id === 'string' ? id : undefined;
  }
  return undefined;
}
