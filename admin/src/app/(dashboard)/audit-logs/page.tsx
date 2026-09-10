"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApiError, api } from "@/lib/api-client";
import type { AuditLogEntry } from "@/lib/types";

const fmt = (iso: string) => new Date(iso).toLocaleString("es-AR");

export default function AuditLogsPage() {
  const [entries, setEntries] = useState<AuditLogEntry[] | null>(null);

  useEffect(() => {
    api.auditLogs
      .list(1, 100)
      .then((res) => setEntries(res.data))
      .catch((e) =>
        toast.error(e instanceof ApiError ? e.message : "Error cargando auditoría"),
      );
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Auditoría</h1>
      <p className="text-sm text-muted-foreground">
        Una fila por mutación admin exitosa (POST/PATCH/DELETE sobre <code>/v1/admin/*</code>).
      </p>

      <div className="rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Acción</TableHead>
              <TableHead>Ruta</TableHead>
              <TableHead className="text-right">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries?.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="text-muted-foreground whitespace-nowrap">
                  {fmt(e.createdAt)}
                </TableCell>
                <TableCell>{e.actorEmail ?? e.actorId ?? "—"}</TableCell>
                <TableCell>
                  <span className="font-medium">{e.resource}</span>
                  <span className="text-muted-foreground">.{e.action}</span>
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {e.method} {e.path}
                </TableCell>
                <TableCell className="text-right">
                  <Badge
                    variant={e.statusCode < 400 ? "secondary" : "destructive"}
                  >
                    {e.statusCode}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
            {entries?.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Sin registros de auditoría.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
