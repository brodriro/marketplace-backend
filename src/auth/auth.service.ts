import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AppConfig } from '../config/configuration';
import type { User } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { parseDurationMs } from './duration.util';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtPayload } from './jwt-payload.type';

const SALT_ROUNDS = 10;
const REFRESH_BYTES = 32;

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  /** Segundos de vida del access token, para refresh preventivo del cliente. */
  expiresIn: number;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<AppConfig, true>,
    private readonly prisma: PrismaService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResult> {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('Ya existe una cuenta con ese email');
    }

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const user = await this.usersService.create({
      email: dto.email,
      passwordHash,
      name: dto.name,
    });

    return this.issueTokens(user);
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.usersService.findByEmail(dto.email);
    if (
      !user ||
      !user.active ||
      !(await bcrypt.compare(dto.password, user.passwordHash))
    ) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    return this.issueTokens(user);
  }

  /**
   * Rota el par: valida el refresh presentado, lo revoca y emite uno nuevo en la misma familia.
   * Si el token presentado ya estaba revocado se asume reuso y se revoca la familia entera.
   */
  async refresh(rawToken: string): Promise<AuthResult> {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.hashToken(rawToken) },
    });
    if (!stored) {
      throw new UnauthorizedException('Refresh token inválido');
    }
    if (stored.revokedAt) {
      await this.revokeFamily(stored.familyId);
      throw new UnauthorizedException('Refresh token inválido');
    }
    if (stored.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Refresh token vencido');
    }

    const user = await this.usersService.findById(stored.userId);
    if (!user || !user.active) {
      throw new UnauthorizedException('Refresh token inválido');
    }

    const { result, refreshTokenId } = await this.mintTokens(
      user,
      stored.familyId,
    );
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date(), replacedById: refreshTokenId },
    });
    return result;
  }

  /** Revoca el refresh presentado y su familia. Idempotente (revocar uno ya revocado no falla). */
  async logout(rawToken: string): Promise<void> {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.hashToken(rawToken) },
    });
    if (!stored) {
      return;
    }
    await this.revokeFamily(stored.familyId);
  }

  private async issueTokens(user: User): Promise<AuthResult> {
    const { result } = await this.mintTokens(user, randomUUID());
    return result;
  }

  private async mintTokens(
    user: User,
    familyId: string,
  ): Promise<{ result: AuthResult; refreshTokenId: string }> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      typ: 'access',
    };
    const accessToken = await this.jwtService.signAsync(payload);
    const expiresIn = Math.floor(
      parseDurationMs(
        this.configService.get('jwt.accessExpiresIn', { infer: true }),
      ) / 1000,
    );

    const rawRefresh = randomBytes(REFRESH_BYTES).toString('base64url');
    const refreshTtlMs = parseDurationMs(
      this.configService.get('jwt.refreshExpiresIn', { infer: true }),
    );
    const row = await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(rawRefresh),
        familyId,
        expiresAt: new Date(Date.now() + refreshTtlMs),
      },
    });

    return {
      result: { accessToken, refreshToken: rawRefresh, expiresIn },
      refreshTokenId: row.id,
    };
  }

  private revokeFamily(familyId: string): Promise<unknown> {
    return this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }
}
