import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import {
  NotificationType,
  StockAlertType,
} from '../../generated/prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

/** `"true"`/`"false"` de query string → boolean; cualquier otra cosa → undefined (sin filtro). */
const queryBool = ({ value }: { value: unknown }) =>
  value === 'true' ? true : value === 'false' ? false : undefined;

export class NotificationsMonitorQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(NotificationType)
  type?: NotificationType;

  @IsOptional()
  @Transform(queryBool)
  @IsBoolean()
  read?: boolean;
}

export class StockAlertsMonitorQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(StockAlertType)
  type?: StockAlertType;

  @IsOptional()
  @Transform(queryBool)
  @IsBoolean()
  notified?: boolean;
}
