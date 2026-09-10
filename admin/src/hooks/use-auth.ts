"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { SessionUser } from "@/lib/auth";
import { ApiError, api } from "@/lib/api-client";

/**
 * Sesión del panel por cookie httpOnly (backend M7 / B6). No hay token legible en el cliente: se
 * consulta `GET /admin/auth/session` al montar. 401 → al login.
 */
export function useAuth() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .session()
      .then((res) => {
        if (cancelled) return;
        setUser(res.user);
        setChecked(true);
      })
      .catch((err) => {
        if (cancelled) return;
        setChecked(true);
        if (err instanceof ApiError && err.status === 401) {
          router.replace("/login");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  function logout() {
    void api.logout().finally(() => router.replace("/login"));
  }

  return { user, checked, logout };
}
