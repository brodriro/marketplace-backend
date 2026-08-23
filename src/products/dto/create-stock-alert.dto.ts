import { IsEnum } from 'class-validator';
import { StockAlertType } from '../../generated/prisma/client';

export class CreateStockAlertDto {
  @IsEnum(StockAlertType)
  type: StockAlertType;
}
