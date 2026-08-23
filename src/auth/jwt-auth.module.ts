import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AppConfig } from '../config/configuration';
import { JwtAuthGuard } from './jwt-auth.guard';
import { JwtStrategy } from './jwt.strategy';

/**
 * Guard + estrategia JWT, sin depender de `UsersModule` — `AuthModule` (register/login) necesita
 * `UsersService`, y varios módulos de feature (Users, Favorites, Orders, Reviews, Notifications)
 * necesitan el guard; si el guard viviera adentro de `AuthModule`, `UsersModule` tendría que
 * importar `AuthModule` y `AuthModule` importar `UsersModule` — ciclo. Este módulo es el punto en
 * común que ambos lados importan.
 */
@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService<AppConfig, true>) => ({
        secret: configService.get('jwt.secret', { infer: true }),
        signOptions: {
          expiresIn: configService.get('jwt.expiresIn', { infer: true }),
        },
      }),
    }),
  ],
  providers: [JwtStrategy, JwtAuthGuard],
  exports: [JwtModule, JwtAuthGuard],
})
export class JwtAuthModule {}
