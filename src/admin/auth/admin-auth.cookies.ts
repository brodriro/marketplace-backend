import type { CookieOptions, Response } from 'express';

/** Sesión admin por cookie (plan E2E M7 / B6). Nombres compartidos entre el controller y la estrategia JWT. */
export const ADMIN_SESSION_COOKIE = 'admin_session'; // httpOnly — access token
export const ADMIN_REFRESH_COOKIE = 'admin_refresh'; // httpOnly — refresh token opaco
export const ADMIN_CSRF_COOKIE = 'admin_csrf'; // legible por JS — double-submit
export const ADMIN_CSRF_HEADER = 'x-csrf-token';

const isProd = process.env.NODE_ENV === 'production';

const base: CookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: 'lax',
  path: '/',
};

export function setSessionCookies(
  res: Response,
  tokens: { accessToken: string; refreshToken: string; expiresIn: number },
  csrfToken: string,
): void {
  res.cookie(ADMIN_SESSION_COOKIE, tokens.accessToken, {
    ...base,
    maxAge: tokens.expiresIn * 1000,
  });
  res.cookie(ADMIN_REFRESH_COOKIE, tokens.refreshToken, {
    ...base,
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
  res.cookie(ADMIN_CSRF_COOKIE, csrfToken, {
    ...base,
    httpOnly: false, // el cliente lo lee y lo reenvía en el header
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
}

export function clearSessionCookies(res: Response): void {
  for (const name of [
    ADMIN_SESSION_COOKIE,
    ADMIN_REFRESH_COOKIE,
    ADMIN_CSRF_COOKIE,
  ]) {
    res.clearCookie(name, { ...base, httpOnly: name !== ADMIN_CSRF_COOKIE });
  }
}
