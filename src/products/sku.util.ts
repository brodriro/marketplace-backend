/**
 * Esquema canónico de SKU de variante.
 *
 * Formato: `<slug(nombre del producto)>-<slug(color)>`, en minúsculas y solo `[a-z0-9-]`
 * (p. ej. `wireless-mouse-blue`, `portable-ssd-1tb-lightblue`). Es determinístico y legible.
 * Si ya existe una variante con ese SKU, se le agrega un sufijo numérico `-2`, `-3`, … hasta
 * dar con uno libre (ver {@link resolveUniqueSku}).
 *
 * Este es el identificador canónico de variante que consumen los clientes A2UI: el componente
 * `VariantSelector` usa `variant.sku` como `value` de cada chip, y el agente conversacional
 * keyea carrito/stock por `sku` + `productId`. No cambiar el formato sin coordinar con
 * `demoCompose` (`mobile`) y `agente-mobile` — ver `documentacion/reference/handoff-integracion-agente.md`.
 *
 * `prisma/seed.ts` genera los SKUs del catálogo con {@link buildSkuBase}, así que hay una sola
 * definición del formato.
 */

/** Igual que el `slugify` de `prisma/seed.ts`: minúsculas, sin diacríticos, `[^a-z0-9]+` → `-`. */
export function slugify(value: string): string {
  const withoutDiacritics = value
    .toLowerCase()
    .normalize('NFD')
    .split('')
    .filter((char) => {
      const code = char.codePointAt(0) ?? 0;
      return code < 0x0300 || code > 0x036f; // descarta marcas diacríticas combinadas
    })
    .join('');
  return withoutDiacritics.replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

/** SKU base (sin resolver colisiones) a partir del nombre del producto y el color. */
export function buildSkuBase(productName: string, color: string): string {
  return `${slugify(productName)}-${slugify(color)}`;
}

const MAX_SKU_SUFFIX = 1000;

/**
 * Devuelve `base` si está libre; si no, prueba `base-2`, `base-3`, … usando `exists` para
 * chequear disponibilidad. `exists` debe considerar tanto la DB como los SKUs ya reservados
 * en la misma operación (p. ej. varias variantes creadas en una sola request).
 */
export async function resolveUniqueSku(
  base: string,
  exists: (sku: string) => boolean | Promise<boolean>,
): Promise<string> {
  if (!(await exists(base))) {
    return base;
  }
  for (let n = 2; n <= MAX_SKU_SUFFIX; n++) {
    const candidate = `${base}-${n}`;
    if (!(await exists(candidate))) {
      return candidate;
    }
  }
  throw new Error(
    `No se pudo generar un SKU único para "${base}" tras ${MAX_SKU_SUFFIX} intentos`,
  );
}
