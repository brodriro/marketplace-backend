import { IsNotEmpty, IsString, ValidateIf } from 'class-validator';

/**
 * `PATCH /cart`: `discountCode: null` limpia el código aplicado; un string lo valida
 * (existencia/vigencia, vía `PromoCodesService.validate`) y lo persiste en `Cart.discountCode`.
 * El campo es obligatorio (uno de los dos) para que el llamado siempre sea explícito.
 */
export class SetCartDiscountDto {
  @ValidateIf((o: SetCartDiscountDto) => o.discountCode !== null)
  @IsString()
  @IsNotEmpty()
  discountCode: string | null;
}
