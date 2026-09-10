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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiError, api } from "@/lib/api-client";
import type { MonitorNotification, MonitorStockAlert } from "@/lib/types";

const fmt = (iso: string) => new Date(iso).toLocaleString("es-AR");

export default function MonitorPage() {
  const [notifs, setNotifs] = useState<MonitorNotification[] | null>(null);
  const [alerts, setAlerts] = useState<MonitorStockAlert[] | null>(null);

  useEffect(() => {
    Promise.all([
      api.monitor.notifications(1, 50),
      api.monitor.stockAlerts(1, 50),
    ])
      .then(([n, a]) => {
        setNotifs(n.data);
        setAlerts(a.data);
      })
      .catch((e) =>
        toast.error(e instanceof ApiError ? e.message : "Error cargando el monitor"),
      );
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Monitor</h1>

      <Tabs defaultValue="notifications">
        <TabsList>
          <TabsTrigger value="notifications">
            Notificaciones {notifs ? `(${notifs.length})` : ""}
          </TabsTrigger>
          <TabsTrigger value="alerts">
            Alertas de stock {alerts ? `(${alerts.length})` : ""}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="notifications">
          <div className="rounded-md border bg-background">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Título</TableHead>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Leída</TableHead>
                  <TableHead>Fecha</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {notifs?.map((n) => (
                  <TableRow key={n.id}>
                    <TableCell>
                      <Badge variant="outline">{n.type}</Badge>
                    </TableCell>
                    <TableCell className="font-medium">{n.title}</TableCell>
                    <TableCell>{n.user?.email ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={n.read ? "secondary" : "outline"}>
                        {n.read ? "Sí" : "No"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {fmt(n.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
                {notifs?.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      Sin notificaciones.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="alerts">
          <div className="rounded-md border bg-background">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Notificada</TableHead>
                  <TableHead>Fecha</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {alerts?.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <Badge variant="outline">{a.type}</Badge>
                    </TableCell>
                    <TableCell className="font-medium">
                      {a.product?.name ?? "—"}
                    </TableCell>
                    <TableCell>{a.user?.email ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={a.notified ? "secondary" : "outline"}>
                        {a.notified ? "Sí" : "No"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {fmt(a.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
                {alerts?.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      Sin alertas de stock.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
