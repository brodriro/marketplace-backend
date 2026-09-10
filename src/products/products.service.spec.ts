import { Test } from '@nestjs/testing';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ProductsService } from './products.service';
import { SearchProductsQueryDto } from './dto/search-products-query.dto';

/**
 * Cubre la tokenización de `search` (plan E2E M6 / RC1): `q` se parte en palabras y cada una tiene
 * que aparecer en `name` **o** `description`. Antes solo matcheaba la frase completa contra `name`.
 */
describe('ProductsService.search', () => {
  let service: ProductsService;
  let findMany: jest.Mock;

  beforeEach(async () => {
    findMany = jest.fn().mockResolvedValue([]);
    const moduleRef = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: PrismaService, useValue: { product: { findMany } } },
        { provide: NotificationsService, useValue: {} },
      ],
    }).compile();
    service = moduleRef.get(ProductsService);
  });

  const whereOf = (): Prisma.ProductWhereInput => {
    const calls = findMany.mock.calls as Array<
      [{ where: Prisma.ProductWhereInput }]
    >;
    return calls[0][0].where;
  };

  const run = (q?: string): Promise<unknown> =>
    service.search({ q, pageSize: 20 } satisfies SearchProductsQueryDto);

  const ci = Prisma.QueryMode.insensitive;
  const tokenOr = (token: string) => ({
    OR: [
      { name: { contains: token, mode: ci } },
      { description: { contains: token, mode: ci } },
      {
        variants: {
          some: { visible: true, color: { contains: token, mode: ci } },
        },
      },
    ],
  });

  it('parte `q` en tokens y exige cada uno en name OR description OR color de variante', async () => {
    await run('mochila viajera cuero');

    const where = whereOf();
    expect(where.visible).toBe(true);
    expect(where.AND).toHaveLength(3);
    expect(where.AND).toEqual(
      ['mochila', 'viajera', 'cuero'].map((token) => tokenOr(token)),
    );
  });

  it('colapsa espacios múltiples y bordes en un solo token', async () => {
    await run('  remera   ');
    expect(whereOf().AND).toEqual([tokenOr('remera')]);
  });

  it('sin `q` (o solo espacios) no agrega filtro de texto', async () => {
    await run('   ');
    expect(whereOf().AND).toBeUndefined();

    findMany.mockClear();
    await run(undefined);
    expect(whereOf().AND).toBeUndefined();
  });

  it('mantiene los otros filtros junto a los tokens', async () => {
    await service.search({
      q: 'bolso cuero',
      category: 'cat-1',
      minPrice: 10,
      maxPrice: 100,
      color: 'Black',
      pageSize: 20,
    } satisfies SearchProductsQueryDto);

    const where = whereOf();
    expect(where.categoryId).toBe('cat-1');
    expect(where.price).toEqual({ gte: 10, lte: 100 });
    expect(where.variants).toEqual({ some: { color: 'Black', visible: true } });
    expect(where.AND).toHaveLength(2);
  });
});
