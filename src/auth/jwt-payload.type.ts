import { Role } from '../generated/prisma/client';

export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
  /** Marca el tipo de token. Los access tokens del par de auth llevan `"access"`. */
  typ?: 'access';
}
