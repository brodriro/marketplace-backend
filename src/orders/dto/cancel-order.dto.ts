import { IsOptional, IsString } from 'class-validator';

/** Body opcional de `POST /orders/:id/cancel` (comprador). El motivo se guarda como `note`. */
export class CancelOrderDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
