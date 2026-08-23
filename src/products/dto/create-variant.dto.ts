import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateVariantDto {
  @IsString()
  color: string;

  @IsString()
  sku: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  stock?: number;
}
