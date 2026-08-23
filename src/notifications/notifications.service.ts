import { Injectable, NotFoundException } from '@nestjs/common';
import { StockAlertType } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async createAlert(userId: string, productId: string, type: StockAlertType) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });
    if (!product) {
      throw new NotFoundException('Producto no encontrado');
    }

    return this.prisma.stockAlert.create({ data: { userId, productId, type } });
  }

  findAllForUser(userId: string) {
    return this.prisma.stockAlert.findMany({
      where: { userId },
      include: { product: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async markRead(userId: string, id: string) {
    const alert = await this.prisma.stockAlert.findUnique({ where: { id } });
    if (!alert || alert.userId !== userId) {
      throw new NotFoundException('Notificación no encontrada');
    }

    return this.prisma.stockAlert.update({
      where: { id },
      data: { notified: true },
    });
  }
}
