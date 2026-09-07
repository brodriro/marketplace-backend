import { IsOptional, IsString, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class AuditLogQueryDto extends PaginationQueryDto {
  /** Filtra por controller, p. ej. `AdminProductsController`. */
  @IsOptional()
  @IsString()
  resource?: string;

  @IsOptional()
  @IsUUID()
  actorId?: string;
}
