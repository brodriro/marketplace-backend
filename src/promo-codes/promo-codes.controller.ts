import { Controller, Get, Param } from '@nestjs/common';
import { PromoCodesService } from './promo-codes.service';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('promo-codes')
@Controller('promo-codes')
export class PromoCodesController {
  constructor(private readonly promoCodesService: PromoCodesService) {}

  @Get(':code')
  findOne(@Param('code') code: string) {
    return this.promoCodesService.validate(code);
  }
}
