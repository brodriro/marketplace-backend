import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { CreateVariantDto } from './dto/create-variant.dto';
import {
  ProductSortBy,
  SearchProductsQueryDto,
} from './dto/search-products-query.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';

const VISIBLE_VARIANTS = { where: { visible: true } };

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: PaginationQueryDto) {
    const { page, pageSize } = query;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where: { visible: true },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { variants: VISIBLE_VARIANTS },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.product.count({ where: { visible: true } }),
    ]);
    return { items, page, pageSize, total };
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: { variants: VISIBLE_VARIANTS },
    });
    if (!product || !product.visible) {
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
      visible: true,
      ...(q ? { name: { contains: q, mode: 'insensitive' } } : {}),
      ...(category ? { categoryId: category } : {}),
      ...(minPrice !== undefined || maxPrice !== undefined
        ? { price: { gte: minPrice, lte: maxPrice } }
        : {}),
      ...(color ? { variants: { some: { color, visible: true } } } : {}),
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
      include: { variants: VISIBLE_VARIANTS },
    });

    const hasMore = items.length > pageSize;
    const page = hasMore ? items.slice(0, pageSize) : items;
    const nextCursor = hasMore ? page[page.length - 1].id : null;

    return { items: page, nextCursor };
  }

  private async assertColorsExist(colors: string[]): Promise<void> {
    const uniqueColors = [...new Set(colors)];
    const found = await this.prisma.color.findMany({
      where: { name: { in: uniqueColors } },
    });
    if (found.length !== uniqueColors.length) {
      const foundNames = new Set(found.map((c) => c.name));
      const missing = uniqueColors.filter((c) => !foundNames.has(c));
      throw new BadRequestException(
        `Color(es) inválido(s): ${missing.join(', ')}`,
      );
    }
  }

  async create(dto: CreateProductDto) {
    const category = await this.prisma.category.findUnique({
      where: { id: dto.categoryId },
    });
    if (!category) {
      throw new NotFoundException('Categoría no encontrada');
    }
    await this.assertColorsExist(dto.variants.map((v) => v.color));

    try {
      return await this.prisma.$transaction(async (tx) => {
        return tx.product.create({
          data: {
            categoryId: dto.categoryId,
            name: dto.name,
            description: dto.description,
            price: dto.price,
            store: dto.store,
            status: dto.status,
            variants: {
              create: dto.variants.map((v) => ({
                color: v.color,
                sku: v.sku,
                stock: v.stock ?? 0,
              })),
            },
          },
          include: { variants: true },
        });
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Ya existe un producto con ese nombre en la categoría, o un SKU duplicado',
        );
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateProductDto) {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product || !product.visible) {
      throw new NotFoundException('Producto no encontrado');
    }
    if (dto.categoryId) {
      const category = await this.prisma.category.findUnique({
        where: { id: dto.categoryId },
      });
      if (!category) {
        throw new NotFoundException('Categoría no encontrada');
      }
    }
    return this.prisma.product.update({
      where: { id },
      data: dto,
      include: { variants: VISIBLE_VARIANTS },
    });
  }

  /** Borrado lógico: nunca se hace DELETE físico, solo se apaga `visible` (así no se rompe el historial de pedidos). */
  async remove(id: string): Promise<void> {
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product || !product.visible) {
      throw new NotFoundException('Producto no encontrado');
    }
    await this.prisma.product.update({
      where: { id },
      data: { visible: false },
    });
  }

  async addVariant(productId: string, dto: CreateVariantDto) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });
    if (!product || !product.visible) {
      throw new NotFoundException('Producto no encontrado');
    }
    await this.assertColorsExist([dto.color]);

    try {
      return await this.prisma.productVariant.create({
        data: {
          productId,
          color: dto.color,
          sku: dto.sku,
          stock: dto.stock ?? 0,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          `Ya existe una variante con SKU ${dto.sku}`,
        );
      }
      throw error;
    }
  }

  async updateVariant(variantId: string, dto: UpdateVariantDto) {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
    });
    if (!variant || !variant.visible) {
      throw new NotFoundException('Variante no encontrada');
    }
    if (dto.color) {
      await this.assertColorsExist([dto.color]);
    }

    try {
      return await this.prisma.productVariant.update({
        where: { id: variantId },
        data: dto,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          `Ya existe una variante con SKU ${dto.sku}`,
        );
      }
      throw error;
    }
  }

  /** Borrado lógico, igual que `remove()` — el stock/SKU quedan en la DB para no romper pedidos ya hechos. */
  async removeVariant(variantId: string): Promise<void> {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
    });
    if (!variant || !variant.visible) {
      throw new NotFoundException('Variante no encontrada');
    }
    await this.prisma.productVariant.update({
      where: { id: variantId },
      data: { visible: false },
    });
  }
}
