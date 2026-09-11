import { Controller, Get } from '@nestjs/common';
import { BannersService } from './banners.service';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('banners')
@Controller('banners')
export class BannersController {
  constructor(private readonly bannersService: BannersService) {}

  @Get()
  findAllActive() {
    return this.bannersService.findAllActive();
  }
}
