import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/** Global: todos los módulos de feature inyectan `PrismaService` directo, sin re-importar esto. */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
