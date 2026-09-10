import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  NotificationsMonitorQueryDto,
  StockAlertsMonitorQueryDto,
} from './monitor-query.dto';

const SAFE_USER = { id: true, email: true, name: true } as const;

/**
 * Monitor de entregas y suscripciones para el admin (plan E2E M7 / B6). Vista global (todos los
 * usuarios) de `Notification` y `StockAlert`, paginada y con filtros. Solo lectura.
 */
@Injectable()
export class AdminMonitorService {
  constructor(private readonly prisma: PrismaService) {}

  async notifications(query: NotificationsMonitorQueryDto) {
    const { page, pageSize, type, read } = query;
    const where: Prisma.NotificationWhereInput = {
      ...(type ? { type } : {}),
      ...(read === true ? { readAt: { not: null } } : {}),
      ...(read === false ? { readAt: null } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          user: { select: SAFE_USER },
          product: { select: { id: true, name: true } },
        },
      }),
      this.prisma.notification.count({ where }),
    ]);
    return {
      data: rows.map((n) => ({ ...n, read: n.readAt !== null })),
      page,
      pageSize,
      total,
    };
  }

  async stockAlerts(query: StockAlertsMonitorQueryDto) {
    const { page, pageSize, type, notified } = query;
    const where: Prisma.StockAlertWhereInput = {
      ...(type ? { type } : {}),
      ...(notified !== undefined ? { notified } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.stockAlert.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          user: { select: SAFE_USER },
          product: { select: { id: true, name: true } },
        },
      }),
      this.prisma.stockAlert.count({ where }),
    ]);
    return { data: rows, page, pageSize, total };
  }
}
