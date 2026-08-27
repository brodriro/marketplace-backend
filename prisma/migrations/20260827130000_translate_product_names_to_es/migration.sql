-- Traducción de los nombres de producto del catálogo de inglés a español.
-- SOLO afecta la columna `products.name` — no toca descripción, store, SKUs de variante,
-- imágenes ni ninguna otra tabla. Los SKUs ya persistidos (`product_variants.sku`) quedan
-- como están (son identificadores opacos y estables); solo cambiaría el slug base de SKUs
-- generados a futuro para variantes nuevas.
--
-- Escrita a mano (sin cambio de schema, es una migración de datos). Cada UPDATE matchea por
-- nombre exacto en inglés; si el nombre ya fue traducido o no existe, el UPDATE afecta 0 filas
-- y no falla. En una DB recién reseteada (`migrate reset`) las migraciones corren sobre una base
-- vacía: estos UPDATE son no-ops y los nombres en español entran vía `prisma/seed.ts`
-- (`seed-data/feed.json` ya actualizado a español).
--
-- Los nombres son editables desde el panel admin (`PATCH /admin/products/:id`); si alguna
-- traducción no encaja con la variante regional preferida, se ajusta ahí.

UPDATE "products" SET "name" = 'Auriculares Pro'         WHERE "name" = 'Headphones Pro';
UPDATE "products" SET "name" = 'Dron 4K'                  WHERE "name" = '4K Drone';
UPDATE "products" SET "name" = 'Cargador Inalámbrico'     WHERE "name" = 'Wireless Charger';
UPDATE "products" SET "name" = 'Chaqueta de Jean'         WHERE "name" = 'Denim Jacket';
UPDATE "products" SET "name" = 'Remera Estampada'         WHERE "name" = 'Graphic T-Shirt';
UPDATE "products" SET "name" = 'Cinturón de Cuero'        WHERE "name" = 'Leather Belt';
UPDATE "products" SET "name" = 'Pantalón Chino'           WHERE "name" = 'Chino Pants';
UPDATE "products" SET "name" = 'Mochila Viajera'          WHERE "name" = 'Backpack Traveler';
UPDATE "products" SET "name" = 'Bolso Tote de Cuero'      WHERE "name" = 'Leather Tote';
UPDATE "products" SET "name" = 'Bolso Bandolera'          WHERE "name" = 'Crossbody Bag';
UPDATE "products" SET "name" = 'Bolso de Viaje'           WHERE "name" = 'Duffel Bag';
UPDATE "products" SET "name" = 'Zapatillas para Correr'   WHERE "name" = 'Running Sneakers';
UPDATE "products" SET "name" = 'Botas de Cuero'           WHERE "name" = 'Leather Boots';
UPDATE "products" SET "name" = 'Mocasines sin Cordones'   WHERE "name" = 'Slip-On Loafers';
UPDATE "products" SET "name" = 'Zapatillas de Lona'       WHERE "name" = 'Canvas Sneakers';
UPDATE "products" SET "name" = 'Parlante Bluetooth'       WHERE "name" = 'Bluetooth Speaker';
UPDATE "products" SET "name" = 'SSD Portátil 1TB'         WHERE "name" = 'Portable SSD 1TB';
UPDATE "products" SET "name" = 'Mouse Inalámbrico'        WHERE "name" = 'Wireless Mouse';
UPDATE "products" SET "name" = 'Teclado Gamer'            WHERE "name" = 'Gaming Keyboard';

-- 'Smartwatch X1' se mantiene: es nombre de modelo, no se traduce.
