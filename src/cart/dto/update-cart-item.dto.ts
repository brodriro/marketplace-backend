import { IsInt, Min } from 'class-validator';

/** `PATCH /cart/items/:variantId` — cantidad **absoluta**. `0` borra la línea. */
export class UpdateCartItemDto {
  @IsInt()
  @Min(0)
  quantity: number;
}
