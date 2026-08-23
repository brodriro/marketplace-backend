import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { AppConfig } from '../config/configuration';
import { PrismaClient } from '../generated/prisma/client';

/**
 * Prisma 7 no trae un `@nestjs/prisma` oficial ni conecta la datasource desde `schema.prisma`
 * (ver docs/plan-marketplace-backend.md §3, fila "ORM") — el `PrismaClient` se construye acá con
 * un driver adapter (`@prisma/adapter-pg`) explícito, y el ciclo de vida ($connect/$disconnect)
 * se ata a los hooks de Nest.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(configService: ConfigService<AppConfig, true>) {
    super({
      adapter: new PrismaPg({
        connectionString: configService.get('database.url', { infer: true }),
      }),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
