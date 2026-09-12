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
   * Código de descuento (plan E2E §A2). Se valida contra `PromoCode` y se aplica al `total`
   * (ver `OrdersService.applyDiscount`) — `404` si no existe/expiró, `409` si no llega al
   * `minPurchase`. Entra en el hash de idempotencia normalizado a mayúsculas.
   */
  @IsOptional()
  @IsString()
  discountCode?: string;
}
