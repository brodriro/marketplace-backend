import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { CreateVariantDto } from './dto/create-variant.dto';
import {
  ProductSortBy,
  SearchProductsQueryDto,
} from './dto/search-products-query.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';
import { buildSkuBase, resolveUniqueSku } from './sku.util';

const VISIBLE_VARIANTS = { where: { visible: true } };

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

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

    // Búsqueda por tokens: se parte `q` en palabras y cada una tiene que aparecer (insensible a
    // mayúsculas/acentos según collation) en `name`, `description` **o** el color de alguna
    // variante visible. Antes solo matcheaba la frase completa contra `name` — "mochila viajera
    // cuero" o "remera negro" no encontraban nada (plan E2E M6 / RC1; catálogo ya en es-419).
    const tokens = q?.trim().split(/\s+/).filter(Boolean) ?? [];

    const where: Prisma.ProductWhereInput = {
      visible: true,
      ...(tokens.length > 0
        ? {
            AND: tokens.map((token) => ({
              OR: [
                {
                  name: { contains: token, mode: Prisma.QueryMode.insensitive },
                },
                {
                  description: {
                    contains: token,
                    mode: Prisma.QueryMode.insensitive,
                  },
                },
                {
                  variants: {
                    some: {
                      visible: true,
                      color: {
                        // Stem de género: "remera negra" no matcheaba "Negro" porque el
                        // adjetivo femenino no es substring del nombre masculino del color
                        // (catálogo es-419: Negro/Rojo cambian por género, Azul/Verde/Celeste no).
                        // Se pisa el vocal final del token para comparar por raíz en vez de
                        // literal (M6 follow-up).
                        contains: this.colorStem(token),
                        mode: Prisma.QueryMode.insensitive,
                      },
                    },
                  },
                },
              ],
            })),
          }
        : {}),
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

  /**
   * Resuelve el SKU de una variante. Si `sku` viene explícito, se respeta tal cual (y un choque
   * termina en `409` más adelante). Si no viene, se autogenera con el esquema canónico
   * `<slug(producto)>-<slug(color)>` y se le agrega sufijo `-N` si ya está tomado — en la DB o
   * entre los `reserved` de esta misma operación.
   */
  private async resolveVariantSku(
    productName: string,
    color: string,
    sku: string | undefined,
    reserved: Set<string>,
  ): Promise<string> {
    if (sku) {
      return sku;
    }
    return resolveUniqueSku(
      buildSkuBase(productName, color),
      async (candidate) => {
        if (reserved.has(candidate)) {
          return true;
        }
        const existing = await this.prisma.productVariant.findUnique({
          where: { sku: candidate },
          select: { id: true },
        });
        return existing !== null;
      },
    );
  }

  async create(dto: CreateProductDto) {
    const category = await this.prisma.category.findUnique({
      where: { id: dto.categoryId },
    });
    if (!category) {
      throw new NotFoundException('Categoría no encontrada');
    }
    await this.assertColorsExist(dto.variants.map((v) => v.color));

    const reserved = new Set<string>();
    const variantsData: { color: string; sku: string; stock: number }[] = [];
    for (const v of dto.variants) {
      const sku = await this.resolveVariantSku(
        dto.name,
        v.color,
        v.sku,
        reserved,
      );
      reserved.add(sku);
      variantsData.push({ color: v.color, sku, stock: v.stock ?? 0 });
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        return tx.product.create({
          data: {
            categoryId: dto.categoryId,
            name: dto.name,
            description: dto.description,
            image: dto.image,
            price: dto.price,
            store: dto.store,
            status: dto.status,
            variants: { create: variantsData },
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
    const updated = await this.prisma.product.update({
      where: { id },
      data: dto,
      include: { variants: VISIBLE_VARIANTS },
    });

    // Trigger price_drop (§B5): sólo si el precio efectivamente bajó.
    const oldPrice = product.price.toNumber();
    if (dto.price !== undefined && dto.price < oldPrice) {
      await this.notifications.emitPriceDrop(id, oldPrice, dto.price);
    }

    return updated;
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

    const sku = await this.resolveVariantSku(
      product.name,
      dto.color,
      dto.sku,
      new Set(),
    );

    try {
      return await this.prisma.productVariant.create({
        data: {
          productId,
          color: dto.color,
          sku,
          stock: dto.stock ?? 0,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(`Ya existe una variante con SKU ${sku}`);
      }
      throw error;
    }
  }

  /**
   * Regenera el SKU de una variante con el esquema canónico a partir del nombre actual del
   * producto y el color de la variante (+ sufijo `-N` si choca con otra). Pensado para el botón
   * "regenerar SKU" del panel admin. El SKU actual de la propia variante no cuenta como choque.
   */
  async regenerateVariantSku(variantId: string) {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
      include: { product: { select: { name: true } } },
    });
    if (!variant || !variant.visible) {
      throw new NotFoundException('Variante no encontrada');
    }

    const sku = await resolveUniqueSku(
      buildSkuBase(variant.product.name, variant.color),
      async (candidate) => {
        if (candidate === variant.sku) {
          return false;
        }
        const existing = await this.prisma.productVariant.findUnique({
          where: { sku: candidate },
          select: { id: true },
        });
        return existing !== null;
      },
    );

    return this.prisma.productVariant.update({
      where: { id: variantId },
      data: { sku },
    });
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

    const updated = await this.prisma.productVariant
      .update({ where: { id: variantId }, data: dto })
      .catch((error: unknown) => {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          throw new ConflictException(
            `Ya existe una variante con SKU ${dto.sku}`,
          );
        }
        throw error;
      });

    // Trigger back_in_stock (§B5): stock que pasó de 0 a >0.
    if (dto.stock !== undefined && variant.stock === 0 && dto.stock > 0) {
      await this.notifications.emitBackInStock(
        variant.productId,
        dto.sku ?? variant.sku,
      );
    }

    return updated;
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

  /** "negra"/"negro", "roja"/"rojo" → misma raíz; deja intactos los invariables (azul/verde/celeste). */
  private colorStem(token: string): string {
    return token.length > 3 && /[aeo]$/i.test(token)
      ? token.slice(0, -1)
      : token;
  }
}
