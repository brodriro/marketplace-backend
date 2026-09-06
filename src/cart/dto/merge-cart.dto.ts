import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class MergeCartLineDto {
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

/**
 * `POST /cart/merge` — merge del carrito local del cliente al del server, al hacer login.
 * Unión de líneas; para cada variante `quantity = max(local, server)` (idempotente: reintentar el
 * merge no infla cantidades ni pierde ítems).
 */
export class MergeCartDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => MergeCartLineDto)
  items: MergeCartLineDto[];
}
