"use client";

import { NavSidebar } from "@/components/nav-sidebar";
import { useAuth } from "@/hooks/use-auth";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { checked, user, logout } = useAuth();

  if (!checked || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Cargando…
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <NavSidebar onLogout={logout} />
      <main className="flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  );
}
