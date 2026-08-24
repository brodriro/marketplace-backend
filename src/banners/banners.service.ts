import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { CreateBannerDto } from './dto/create-banner.dto';
import { UpdateBannerDto } from './dto/update-banner.dto';

@Injectable()
export class BannersService {
  constructor(private readonly prisma: PrismaService) {}

  findAllActive() {
    return this.prisma.banner.findMany({
      where: { active: true, visible: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async findAllAdmin(query: PaginationQueryDto) {
    const { page, pageSize } = query;
    const where = { visible: true };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.banner.findMany({
        where,
        orderBy: { sortOrder: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.banner.count({ where }),
    ]);
    return { data, page, pageSize, total };
  }

  async findOne(id: string) {
    const banner = await this.prisma.banner.findUnique({ where: { id } });
    if (!banner || !banner.visible) {
      throw new NotFoundException('Banner no encontrado');
    }
    return banner;
  }

  create(dto: CreateBannerDto) {
    return this.prisma.banner.create({ data: dto });
  }

  async update(id: string, dto: UpdateBannerDto) {
    await this.findOne(id);
    return this.prisma.banner.update({ where: { id }, data: dto });
  }

  /** Borrado lógico — nunca DELETE físico, solo apaga `visible` (distinto de `active`, ver schema.prisma). */
  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.prisma.banner.update({
      where: { id },
      data: { visible: false },
    });
  }
}
