import { IsInt, IsOptional, IsString, Matches, Min } from 'class-validator';

export class UpdateVariantDto {
  @IsOptional()
  @IsString()
  color?: string;

  /** Mismo formato que en la creación: `[a-z0-9-]`, segmentos separados por un guión. */
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
