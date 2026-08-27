import { IsInt, IsOptional, IsString, Matches, Min } from 'class-validator';

export class CreateVariantDto {
  @IsString()
  color: string;

  /**
   * Opcional. Si se omite, el backend lo autogenera con el esquema canónico
   * `<slug(nombre del producto)>-<slug(color)>` (+ sufijo `-N` si choca). Si se envía,
   * debe respetar `[a-z0-9-]` para que sirva de identificador estable de variante.
   * Editable después vía `PATCH /admin/products/:id/variants/:variantId`.
   */
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message:
      'sku solo admite minúsculas, dígitos y guiones simples entre segmentos',
  })
  sku?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  stock?: number;
}
