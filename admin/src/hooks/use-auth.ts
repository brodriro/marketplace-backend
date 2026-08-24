"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clearToken, decodeJwtPayload, getToken, isTokenValid } from "@/lib/auth";
import type { DecodedJwt } from "@/lib/auth";

export function useAuth() {
  const router = useRouter();
  const [user, setUser] = useState<DecodedJwt | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!isTokenValid(token)) {
      clearToken();
      // eslint-disable-next-line react-hooks/set-state-in-effect -- verificación de sesión al montar, no un loop de render
      setChecked(true);
      router.replace("/login");
      return;
    }
    const decoded = decodeJwtPayload(token!);
    if (!decoded || decoded.role !== "admin") {
      clearToken();
      setChecked(true);
      router.replace("/login");
      return;
    }
    setUser(decoded);
    setChecked(true);
  }, [router]);

  function logout() {
    clearToken();
    router.replace("/login");
  }

  return { user, checked, logout };
}
