import { IsString, IsNotEmpty } from 'class-validator';

/** Body de `POST /auth/refresh` y `POST /auth/logout`. */
export class RefreshDto {
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}
