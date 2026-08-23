import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaginationQueryDto } from './dto/pagination-query.dto';
import {
  ProductSortBy,
  SearchProductsQueryDto,
} from './dto/search-products-query.dto';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: PaginationQueryDto) {
    const { page, pageSize } = query;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { variants: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.product.count(),
    ]);
    return { items, page, pageSize, total };
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: { variants: true },
    });
    if (!product) {
      throw new NotFoundException('Producto no encontrado');
    }

    const aggregate = await this.prisma.review.aggregate({
      where: { productId: id },
      _avg: { rating: true },
      _count: { rating: true },
    });

    return {
      ...product,
      averageRating: aggregate._avg.rating ?? 0,
      reviewCount: aggregate._count.rating,
    };
  }

  async search(query: SearchProductsQueryDto) {
    const { q, category, minPrice, maxPrice, color, sortBy, cursor, pageSize } =
      query;

    const where: Prisma.ProductWhereInput = {
      ...(q ? { name: { contains: q, mode: 'insensitive' } } : {}),
      ...(category ? { categoryId: category } : {}),
      ...(minPrice !== undefined || maxPrice !== undefined
        ? { price: { gte: minPrice, lte: maxPrice } }
        : {}),
      ...(color ? { variants: { some: { color } } } : {}),
    };

    const orderBy: Prisma.ProductOrderByWithRelationInput =
      sortBy === ProductSortBy.PRICE_ASC
        ? { price: 'asc' }
        : sortBy === ProductSortBy.PRICE_DESC
          ? { price: 'desc' }
          : { createdAt: 'desc' };

    const items = await this.prisma.product.findMany({
      where,
      orderBy,
      take: pageSize + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { variants: true },
    });

    const hasMore = items.length > pageSize;
    const page = hasMore ? items.slice(0, pageSize) : items;
    const nextCursor = hasMore ? page[page.length - 1].id : null;

    return { items: page, nextCursor };
  }
}
