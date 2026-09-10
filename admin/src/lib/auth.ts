import type { Role } from "./types";

/**
 * Sesión del panel por cookie httpOnly + CSRF (backend M7 / B6). El access/refresh token viven en
 * cookies httpOnly que JS no puede leer; el estado de sesión se consulta al servidor
 * (`GET /admin/auth/session`). Lo único legible acá es la cookie `admin_csrf` (double-submit).
 */
const CSRF_COOKIE = "admin_csrf";

export interface SessionUser {
  id: string;
  email: string;
  role: Role;
}

/** Lee la cookie `admin_csrf` para reenviarla en el header `X-CSRF-Token` en las mutaciones. */
export function getCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${CSRF_COOKIE}=([^;]*)`),
  );
  return match ? decodeURIComponent(match[1]) : null;
}
