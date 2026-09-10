"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError, api } from "@/lib/api-client";
import type { AgentConfig } from "@/lib/types";

export default function AgentConfigPage() {
  const [cfg, setCfg] = useState<AgentConfig | null>(null);

  useEffect(() => {
    api.agentConfig
      .get()
      .then(setCfg)
      .catch((e) =>
        toast.error(
          e instanceof ApiError ? e.message : "Error cargando config del agente",
        ),
      );
  }, []);

  const rows: [string, string][] = cfg
    ? [
        ["Checksum del catálogo (md5)", cfg.catalog.checksum],
        [
          "Última actualización",
          cfg.catalog.updatedAt
            ? new Date(cfg.catalog.updatedAt).toLocaleString("es-AR")
            : "—",
        ],
        ["Categorías", String(cfg.catalog.counts.categories)],
        ["Productos", String(cfg.catalog.counts.products)],
        ["Variantes", String(cfg.catalog.counts.variants)],
        ["Colores", String(cfg.catalog.counts.colors)],
        ["Modo de auth", cfg.agent.authMode],
        ["Modo de carrito", cfg.agent.cartMode],
      ]
    : [];

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">Configuración del agente</h1>
      <p className="text-sm text-muted-foreground">
        Estado del catálogo que consume el agente conversacional. El{" "}
        <code>checksum</code> permite detectar drift contra su copia cacheada.
      </p>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Catálogo e integración</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 border-b py-2 last:border-0">
              <span className="text-muted-foreground">{k}</span>
              <span className="font-mono break-all text-right">{v}</span>
            </div>
          ))}
          {!cfg && <span className="text-muted-foreground">Cargando…</span>}
        </CardContent>
      </Card>
    </div>
  );
}
