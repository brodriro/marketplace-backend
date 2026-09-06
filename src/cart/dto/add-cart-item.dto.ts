import { IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';

/**
 * Alta/incremento de una línea del carrito. Se acepta `variantId` **o** `sku` (uno de los dos);
 * `sku` se resuelve a la variante server-side. `quantity` se **suma** a la cantidad existente de
 * esa variante (nunca crea una segunda línea — hay `@@unique([cartId, variantId])`).
 */
export class AddCartItemDto {
  @IsOptional()
  @IsUUID()
  variantId?: string;

  @IsOptional()
  @IsString()
  sku?: string;

  @IsInt()
  @Min(1)
  quantity: number;
}
