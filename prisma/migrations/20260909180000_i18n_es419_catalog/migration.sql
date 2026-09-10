-- i18n es-419 del catálogo (plan E2E M6 / B7). Migración de datos, sin cambio de schema.
-- Nombres/descripciones de producto ya estaban en español (20260827130000 + feed.json).
-- Acá: categorías (name + subtitle), `products.store`, y colores (`colors.name` +
-- `product_variants.color`, que NO es FK — validez en la capa DTO). Los SKU ya persistidos quedan
-- como están (identificadores opacos; el slug de SKUs nuevos usa el nombre de color nuevo).
-- En base vacía (migrate reset) estos UPDATE son no-op y el es-419 entra vía prisma/seed.ts.

-- Categorías
UPDATE "categories" SET "name" = 'Novedades',   "subtitle" = '208 productos' WHERE "name" = 'New Arrivals';
UPDATE "categories" SET "name" = 'Ropa',        "subtitle" = '85 productos'  WHERE "name" = 'Clothes';
UPDATE "categories" SET "name" = 'Bolsos',      "subtitle" = '215 productos' WHERE "name" = 'Bags';
UPDATE "categories" SET "name" = 'Calzado',     "subtitle" = '97 productos'  WHERE "name" = 'Shoes';
UPDATE "categories" SET "name" = 'Electrónica', "subtitle" = '341 productos' WHERE "name" = 'Electronics';

-- Tiendas (nombres de fantasía: se traduce el sustantivo, se mantiene la letra griega)
UPDATE "products" SET "store" = 'Tienda Alfa'     WHERE "store" = 'Alpha Store';
UPDATE "products" SET "store" = 'Boutique Beta'   WHERE "store" = 'Beta Boutique';
UPDATE "products" SET "store" = 'Artículos Gamma' WHERE "store" = 'Gamma Goods';
UPDATE "products" SET "store" = 'Ofertas Delta'   WHERE "store" = 'Delta Deals';
UPDATE "products" SET "store" = 'Emporio Épsilon' WHERE "store" = 'Epsilon Emporium';

-- Colores en las variantes
UPDATE "product_variants" SET "color" = 'Negro'   WHERE "color" = 'Black';
UPDATE "product_variants" SET "color" = 'Celeste' WHERE "color" = 'LightBlue';
UPDATE "product_variants" SET "color" = 'Azul'    WHERE "color" = 'Blue';
UPDATE "product_variants" SET "color" = 'Verde'   WHERE "color" = 'Green';
UPDATE "product_variants" SET "color" = 'Rojo'    WHERE "color" = 'Red';

-- Catálogo de colores (name es @unique — ninguno de los nombres es-419 existe todavía)
UPDATE "colors" SET "name" = 'Negro'   WHERE "name" = 'Black';
UPDATE "colors" SET "name" = 'Celeste' WHERE "name" = 'LightBlue';
UPDATE "colors" SET "name" = 'Azul'    WHERE "name" = 'Blue';
UPDATE "colors" SET "name" = 'Verde'   WHERE "name" = 'Green';
UPDATE "colors" SET "name" = 'Rojo'    WHERE "name" = 'Red';
