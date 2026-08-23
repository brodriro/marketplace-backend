import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { Role, User } from '../generated/prisma/client';
import type { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import type { UpdateUserDto } from './dto/update-user.dto';

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  name: string;
}

export type SafeUser = Omit<User, 'passwordHash'>;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  create(input: CreateUserInput): Promise<User> {
    return this.prisma.user.create({ data: input });
  }

  toSafeUser(user: User): SafeUser {
    const { passwordHash: _passwordHash, ...safeUser } = user;
    return safeUser;
  }

  async findAllAdmin(
    query: PaginationQueryDto,
  ): Promise<{ data: SafeUser[]; page: number; pageSize: number; total: number }> {
    const { page, pageSize } = query;
    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.user.count(),
    ]);
    return {
      data: users.map((user) => this.toSafeUser(user)),
      page,
      pageSize,
      total,
    };
  }

  async findByIdSafe(id: string): Promise<SafeUser> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }
    return this.toSafeUser(user);
  }

  async update(id: string, dto: UpdateUserDto): Promise<SafeUser> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }
    const updated = await this.prisma.user.update({ where: { id }, data: dto });
    return this.toSafeUser(updated);
  }

  async setRole(
    id: string,
    role: Role,
    requesterId: string,
  ): Promise<SafeUser> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }
    if (id === requesterId && role !== 'admin') {
      throw new BadRequestException(
        'No podés revocar tu propio rol de admin',
      );
    }
    const updated = await this.prisma.user.update({
      where: { id },
      data: { role },
    });
    return this.toSafeUser(updated);
  }

  async setActive(
    id: string,
    active: boolean,
    requesterId: string,
  ): Promise<SafeUser> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }
    if (id === requesterId && !active) {
      throw new BadRequestException('No podés desactivar tu propia cuenta');
    }
    const updated = await this.prisma.user.update({
      where: { id },
      data: { active },
    });
    return this.toSafeUser(updated);
  }
}
