import { IsEnum, IsOptional, IsString } from 'class-validator';
import { OrderStatus } from '../../generated/prisma/client';

export class UpdateOrderStatusDto {
  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;

  @IsOptional()
  @IsString()
  trackingNumber?: string;

  @IsOptional()
  @IsString()
  trackingCarrier?: string;

  /** Obligatorio para `-> refunded` (§6.3). Se guarda como `note` en la fila de historial. */
  @IsOptional()
  @IsString()
  reason?: string;
}
