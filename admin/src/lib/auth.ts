import type { Role } from "./types";

const TOKEN_KEY = "admin_access_token";
const REFRESH_KEY = "admin_refresh_token";

export interface DecodedJwt {
  sub: string;
  email: string;
  role: Role;
  exp: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(REFRESH_KEY);
}

export function setTokens(tokens: {
  accessToken: string;
  refreshToken: string;
}): void {
  window.localStorage.setItem(TOKEN_KEY, tokens.accessToken);
  window.localStorage.setItem(REFRESH_KEY, tokens.refreshToken);
}

export function clearTokens(): void {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_KEY);
}

/** Decodifica el payload del JWT sin validar la firma — solo para gating de UI, nunca para autorizar. */
export function decodeJwtPayload(token: string): DecodedJwt | null {
  try {
    const [, payload] = token.split(".");
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json) as DecodedJwt;
  } catch {
    return null;
  }
}

export function isTokenValid(token: string | null): boolean {
  if (!token) return false;
  const decoded = decodeJwtPayload(token);
  if (!decoded) return false;
  return decoded.exp * 1000 > Date.now();
}
