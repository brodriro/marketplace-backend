import 'dotenv/config';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import {
  OrderStatus,
  PrismaClient,
  Role,
  type User,
} from '../src/generated/prisma/client';
import { buildSkuBase } from '../src/products/sku.util';

const SALT_ROUNDS = 10;
const FIXED_ORDER_ID = '00000000-0000-0000-0000-000000000001';

/**
 * `Math.random()` no acepta semilla — mulberry32 da stock sintético reproducible entre corridas
 * del seed (docs/plan-marketplace-backend.md §7, punto 1: "semilla fija para reproducibilidad").
 */
function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(20260822);

interface FeedProduct {
  name: string;
  description: string;
  image: string;
  price: number;
  store: string;
  status: 'Hot' | 'New' | 'Normal' | 'Popular';
  colors: string[];
}

interface FeedCategory {
  name: string;
  subtitle: string;
  image: string;
  products: FeedProduct[];
}

interface FeedBanner {
  store: string;
  description: string;
  image: string;
}

interface FeedData {
  colors: { name: string; value: string }[];
  feed: FeedBanner[];
  categories: FeedCategory[];
}

async function main(): Promise<void> {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  const feedPath = path.join(__dirname, 'seed-data', 'feed.json');
  const feed: FeedData = JSON.parse(fs.readFileSync(feedPath, 'utf-8'));

  console.log(`Seeding ${feed.colors.length} colors...`);
  for (const color of feed.colors) {
    await prisma.color.upsert({
      where: { name: color.name },
      create: { name: color.name, value: color.value },
      update: { value: color.value },
    });
  }

  console.log(`Seeding ${feed.categories.length} categories and their products...`);
  const productIds: string[] = [];
  const variantIdsByProduct = new Map<string, string[]>();

  for (const category of feed.categories) {
    const savedCategory = await prisma.category.upsert({
      where: { name: category.name },
      create: { name: category.name, subtitle: category.subtitle, image: category.image },
      update: { subtitle: category.subtitle, image: category.image },
    });

    for (const product of category.products) {
      const savedProduct = await prisma.product.upsert({
        where: { categoryId_name: { categoryId: savedCategory.id, name: product.name } },
        create: {
          categoryId: savedCategory.id,
          name: product.name,
          description: product.description,
          image: product.image,
          price: product.price,
          store: product.store,
          status: product.status,
        },
        update: {
          description: product.description,
          image: product.image,
          price: product.price,
          store: product.store,
          status: product.status,
        },
      });
      productIds.push(savedProduct.id);

      const variantIds: string[] = [];
      for (const colorName of product.colors) {
        const sku = buildSkuBase(product.name, colorName);
        const variant = await prisma.productVariant.upsert({
          where: { sku },
          create: {
            productId: savedProduct.id,
            color: colorName,
            sku,
            stock: Math.floor(random() * 30),
          },
          update: {},
        });
        variantIds.push(variant.id);
      }
      variantIdsByProduct.set(savedProduct.id, variantIds);
    }
  }

  console.log(`Seeding ${feed.feed.length} banners...`);
  // `Banner` no tiene unique key (una imagen puede reusarse entre campañas) — find-before-create
  // en vez de upsert, a diferencia del resto del seed.
  for (let i = 0; i < feed.feed.length; i++) {
    const banner = feed.feed[i];
    const existing = await prisma.banner.findFirst({
      where: { image: banner.image },
    });
    if (!existing) {
      await prisma.banner.create({
        data: {
          store: banner.store,
          description: banner.description,
          image: banner.image,
          sortOrder: i,
        },
      });
    }
  }

  const demoEmail = process.env.SEED_DEMO_EMAIL ?? 'demo@marketplace.dev';
  const demoPassword = process.env.SEED_DEMO_PASSWORD ?? 'demo12345';
  console.log(`Seeding demo user (${demoEmail})...`);
  const demoUser = await prisma.user.upsert({
    where: { email: demoEmail },
    create: {
      email: demoEmail,
      name: 'Usuario Demo',
      passwordHash: await bcrypt.hash(demoPassword, SALT_ROUNDS),
    },
    update: {},
  });

  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@marketplace.dev';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'admin12345';
  console.log(`Seeding admin user (${adminEmail})...`);
  await prisma.user.upsert({
    where: { email: adminEmail },
    create: {
      email: adminEmail,
      name: 'Admin',
      role: Role.admin,
      passwordHash: await bcrypt.hash(adminPassword, SALT_ROUNDS),
    },
    update: {},
  });

  console.log('Seeding reviewer users...');
  const reviewerPasswordHash = await bcrypt.hash('reviewer-seed-password', SALT_ROUNDS);
  const reviewerNames = ['Reviewer Uno', 'Reviewer Dos', 'Reviewer Tres'];
  const reviewers: User[] = [];
  for (let i = 0; i < reviewerNames.length; i++) {
    const email = `reviewer${i + 1}@marketplace.dev`;
    reviewers.push(
      await prisma.user.upsert({
        where: { email },
        create: { email, name: reviewerNames[i], passwordHash: reviewerPasswordHash },
        update: {},
      }),
    );
  }

  console.log('Seeding reviews...');
  const sampleComments = [
    'Excelente calidad, superó mis expectativas.',
    'Buen producto por el precio, aunque tardó en llegar.',
    'Cumple lo que promete, lo recomiendo.',
  ];
  for (const productId of productIds) {
    const reviewCount = 2 + Math.floor(random() * 2); // 2 o 3
    for (let i = 0; i < reviewCount; i++) {
      const reviewer = reviewers[i % reviewers.length];
      await prisma.review.upsert({
        where: { productId_userId: { productId, userId: reviewer.id } },
        create: {
          productId,
          userId: reviewer.id,
          rating: 3 + Math.floor(random() * 3), // 3..5
          comment: sampleComments[i % sampleComments.length],
        },
        update: {},
      });
    }
  }

  console.log('Seeding favorites...');
  for (const productId of productIds.slice(0, 4)) {
    await prisma.favorite.upsert({
      where: { userId_productId: { userId: demoUser.id, productId } },
      create: { userId: demoUser.id, productId },
      update: {},
    });
  }

  console.log('Seeding demo order (shipped, 2 items)...');
  const existingOrder = await prisma.order.findUnique({ where: { id: FIXED_ORDER_ID } });
  if (!existingOrder) {
    const orderVariants = Array.from(variantIdsByProduct.entries()).slice(0, 2);
    const orderItemsData: { variantId: string; quantity: number; unitPrice: number }[] = [];
    let total = 0;
    for (const [productId, variantIds] of orderVariants) {
      const product = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
      const unitPrice = product.price.toNumber();
      orderItemsData.push({ variantId: variantIds[0], quantity: 1, unitPrice });
      total += unitPrice;
    }

    await prisma.order.create({
      data: {
        id: FIXED_ORDER_ID,
        userId: demoUser.id,
        status: OrderStatus.shipped,
        total,
        shippingCity: 'Lima',
        etaDays: 3,
        items: { create: orderItemsData },
      },
    });
  }

  console.log('Seeding promo codes...');
  const firstCategory = await prisma.category.findFirst({
    orderBy: { name: 'asc' },
  });
  const farFuture = new Date('2030-12-31T23:59:59Z');
  const promoCodes = [
    // Porcentaje global, sin mínimo de compra.
    {
      code: 'WELCOME10',
      type: 'percentage' as const,
      value: 10,
      appliesToCategory: null,
      minPurchase: 0,
      validFrom: new Date('2025-01-01T00:00:00Z'),
      validUntil: farFuture,
    },
    // Monto fijo, requiere compra mínima.
    {
      code: 'ENVIOGRATIS',
      type: 'fixed_amount' as const,
      value: 15,
      appliesToCategory: null,
      minPurchase: 100,
      validFrom: new Date('2025-01-01T00:00:00Z'),
      validUntil: farFuture,
    },
    // Acotado a una categoría (la primera por orden alfabético).
    {
      code: 'CATEGORIA20',
      type: 'percentage' as const,
      value: 20,
      appliesToCategory: firstCategory?.id ?? null,
      minPurchase: 50,
      validFrom: new Date('2025-01-01T00:00:00Z'),
      validUntil: farFuture,
    },
    // Vencido a propósito — para probar el 404 por fuera de vigencia.
    {
      code: 'EXPIRADO5',
      type: 'percentage' as const,
      value: 5,
      appliesToCategory: null,
      minPurchase: 0,
      validFrom: new Date('2024-01-01T00:00:00Z'),
      validUntil: new Date('2024-12-31T23:59:59Z'),
    },
  ];
  for (const promo of promoCodes) {
    await prisma.promoCode.upsert({
      where: { code: promo.code },
      create: promo,
      update: {
        type: promo.type,
        value: promo.value,
        appliesToCategory: promo.appliesToCategory,
        minPurchase: promo.minPurchase,
        validFrom: promo.validFrom,
        validUntil: promo.validUntil,
      },
    });
  }

  console.log('Seed completado.');
  await prisma.$disconnect();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
