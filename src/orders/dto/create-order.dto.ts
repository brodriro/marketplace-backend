import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateOrderItemDto {
  @IsString()
  variantId: string;

  @IsInt()
  @Min(1)
  quantity: number;
}

export class CreateOrderDto {
  @IsString()
  shippingCity: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items: CreateOrderItemDto[];

  /**
   * Código de descuento (plan E2E §A2). Se acepta y entra en el hash de idempotencia; la
   * aplicación al `total` es follow-up de la integración con `promo-codes` (fuera de B4).
   */
  @IsOptional()
  @IsString()
  discountCode?: string;
}
