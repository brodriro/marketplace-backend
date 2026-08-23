import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class AdminProductsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  category?: string;
}
