import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';

/** Mismo formato que el guard de `AuditInterceptor` y el de los clientes (plan E2E §7.2). */
const E2E_RUN_ID_RE = /^e2e-M\d+-\d{8}-\d{2}$/;

/**
 * Loguea una línea `[e2e] <runId> <method> <path> <status>` por cada request que trae un header
 * `X-E2E-Run` válido, en TODA ruta (no solo `/admin/*`). Es la evidencia del tramo agente→backend
 * para rutas no-admin (carrito, pedidos de usuario), que no pasan por `AuditInterceptor`:
 * `grep <runId>` sobre el log del backend reconstruye ese tramo de una corrida coordinada
 * (plan-e2e.md §7.2 / §7.3). Sin el header, o con uno que no matchea la regex, es un no-op total.
 */
@Injectable()
export class E2eRunLoggerInterceptor implements NestInterceptor {
  private readonly logger = new Logger('E2E');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const header = req.headers['x-e2e-run'];
    const runId = Array.isArray(header) ? header[0] : header;
    if (!runId || !E2E_RUN_ID_RE.test(runId)) {
      return next.handle();
    }

    const res = context.switchToHttp().getResponse<Response>();
    const startedAt = Date.now();
    return next.handle().pipe(
      tap(() => {
        this.logger.log(
          `[e2e] ${runId} ${req.method} ${req.originalUrl} ${res.statusCode} ${
            Date.now() - startedAt
          }ms`,
        );
      }),
    );
  }
}
