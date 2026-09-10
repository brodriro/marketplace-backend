import { Injectable } from '@nestjs/common';
import { OrderStatus, Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { LowStockQueryDto } from './low-stock-query.dto';

/** Estados que cuentan como venta concretada para el cálculo de `revenue`. */
const REVENUE_STATUSES: OrderStatus[] = [
  OrderStatus.paid,
  OrderStatus.preparing,
  OrderStatus.shipped,
  OrderStatus.delivered,
];

const DEFAULT_LOW_STOCK_THRESHOLD = 5;
const TOP_PRODUCTS_LIMIT = 5;

@Injectable()
export class AdminAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Resumen para el dashboard admin (plan E2E M7 / B6). Todo agregado, sin paginar. */
  async summary() {
    const now = Date.now();
    const d7 = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const d30 = new Date(now - 30 * 24 * 60 * 60 * 1000);

    const [
      ordersTotal,
      revenueAgg,
      last7,
      last30,
      productsCount,
      variantsCount,
      lowStock,
      outOfStock,
      notifTotal,
      notifUnread,
    ] = await this.prisma.$transaction([
      this.prisma.order.count(),
      this.prisma.order.aggregate({
        _sum: { total: true },
        where: { status: { in: REVENUE_STATUSES } },
      }),
      this.prisma.order.count({ where: { createdAt: { gte: d7 } } }),
      this.prisma.order.count({ where: { createdAt: { gte: d30 } } }),
      this.prisma.product.count({ where: { visible: true } }),
      this.prisma.productVariant.count({ where: { visible: true } }),
      this.prisma.productVariant.count({
        where: { visible: true, stock: { lte: DEFAULT_LOW_STOCK_THRESHOLD } },
      }),
      this.prisma.productVariant.count({ where: { visible: true, stock: 0 } }),
      this.prisma.notification.count(),
      this.prisma.notification.count({ where: { readAt: null } }),
    ]);

    const [byStatusRaw, soldByVariant] = await Promise.all([
      this.prisma.order.groupBy({
        by: ['status'],
        _count: { _all: true },
        orderBy: { status: 'asc' },
      }),
      this.prisma.orderItem.groupBy({
        by: ['variantId'],
        _sum: { quantity: true },
        where: { order: { status: { in: REVENUE_STATUSES } } },
        orderBy: { variantId: 'asc' },
      }),
    ]);

    const byStatus = Object.fromEntries(
      Object.values(OrderStatus).map((s) => [s, 0]),
    ) as Record<OrderStatus, number>;
    for (const row of byStatusRaw) {
      byStatus[row.status] = row._count._all;
    }

    return {
      orders: {
        total: ordersTotal,
        byStatus,
        revenue: (revenueAgg._sum.total ?? new Prisma.Decimal(0)).toFixed(2),
        last7Days: last7,
        last30Days: last30,
      },
      catalog: {
        products: productsCount,
        variants: variantsCount,
        lowStock,
        outOfStock,
        lowStockThreshold: DEFAULT_LOW_STOCK_THRESHOLD,
      },
      notifications: { total: notifTotal, unread: notifUnread },
      topProducts: await this.topProducts(
        soldByVariant.map((r) => ({
          variantId: r.variantId,
          quantity: r._sum.quantity ?? 0,
        })),
      ),
    };
  }

  /** Variantes visibles con `stock <= threshold`, paginado, con nombre de producto. */
  async lowStock(query: LowStockQueryDto) {
    const { page, pageSize } = query;
    const threshold = query.threshold ?? DEFAULT_LOW_STOCK_THRESHOLD;
    const where: Prisma.ProductVariantWhereInput = {
      visible: true,
      stock: { lte: threshold },
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.productVariant.findMany({
        where,
        orderBy: { stock: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          sku: true,
          color: true,
          stock: true,
          productId: true,
          product: { select: { name: true, image: true } },
        },
      }),
      this.prisma.productVariant.count({ where }),
    ]);
    return { data, page, pageSize, total, threshold };
  }

  private async topProducts(sold: { variantId: string; quantity: number }[]) {
    if (sold.length === 0) return [];
    const variants = await this.prisma.productVariant.findMany({
      where: { id: { in: sold.map((r) => r.variantId) } },
      select: {
        id: true,
        productId: true,
        product: { select: { name: true } },
      },
    });
    const byProduct = new Map<
      string,
      { productId: string; name: string; unitsSold: number }
    >();
    for (const r of sold) {
      const v = variants.find((x) => x.id === r.variantId);
      if (!v) continue;
      const acc = byProduct.get(v.productId) ?? {
        productId: v.productId,
        name: v.product.name,
        unitsSold: 0,
      };
      acc.unitsSold += r.quantity;
      byProduct.set(v.productId, acc);
    }
    return [...byProduct.values()]
      .sort((a, b) => b.unitsSold - a.unitsSold)
      .slice(0, TOP_PRODUCTS_LIMIT);
  }
}
