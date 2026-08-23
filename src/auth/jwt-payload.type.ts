import { Role } from '../generated/prisma/client';

export interface JwtPayload {
  sub: string;
  email: string;
  role: Role;
}
