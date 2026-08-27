import { Controller, Get, Param } from '@nestjs/common';
import { PromoCodesService } from './promo-codes.service';

@Controller('promo-codes')
export class PromoCodesController {
  constructor(private readonly promoCodesService: PromoCodesService) {}

  @Get(':code')
  findOne(@Param('code') code: string) {
    return this.promoCodesService.validate(code);
  }
}
