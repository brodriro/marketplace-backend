import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogQueryDto } from './audit-log-query.dto';

export interface AuditEntry {
  actorId?: string;
  actorEmail?: string;
  method: string;
  path: string;
  resource: string;
  action: string;
  entityId?: string;
  statusCode: number;
  changes?: unknown;
}

/** Campos del body que nunca se guardan en el registro de auditoría. */
const REDACTED_KEYS = new Set([
  'password',
  'passwordHash',
  'refreshToken',
  'accessToken',
]);

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Persiste una entrada. Nunca lanza: un fallo de auditoría no debe tumbar la request original. */
  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId: entry.actorId ?? null,
          actorEmail: entry.actorEmail ?? null,
          method: entry.method,
          path: entry.path,
          resource: entry.resource,
          action: entry.action,
          entityId: entry.entityId ?? null,
          statusCode: entry.statusCode,
          changes: this.sanitize(entry.changes),
        },
      });
    } catch (err) {
      this.logger.warn(
        `No se pudo escribir la entrada de auditoría (${entry.method} ${entry.path}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  async findAll(query: AuditLogQueryDto) {
    const { page, pageSize, resource, actorId } = query;
    const where: Prisma.AuditLogWhereInput = {
      ...(resource ? { resource } : {}),
      ...(actorId ? { actorId } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { data, page, pageSize, total };
  }

  private sanitize(changes: unknown): Prisma.InputJsonValue | undefined {
    if (changes === undefined || changes === null) {
      return undefined;
    }
    if (typeof changes !== 'object') {
      return changes;
    }
    const clone: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(
      changes as Record<string, unknown>,
    )) {
      clone[key] = REDACTED_KEYS.has(key) ? '[redacted]' : value;
    }
    return clone as Prisma.InputJsonValue;
  }
}
