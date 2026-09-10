"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { OrderStatusBadge } from "@/components/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApiError, api } from "@/lib/api-client";
import type { AnalyticsSummary, LowStockRow, OrderStatus } from "@/lib/types";

export default function AnalyticsPage() {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [lowStock, setLowStock] = useState<LowStockRow[] | null>(null);

  useEffect(() => {
    Promise.all([api.analytics.summary(), api.analytics.lowStock()])
      .then(([s, ls]) => {
        setSummary(s);
        setLowStock(ls.data);
      })
      .catch((e) =>
        toast.error(e instanceof ApiError ? e.message : "Error cargando analytics"),
      );
  }, []);

  const stats = summary && [
    { label: "Pedidos", value: summary.orders.total },
    { label: "Ingresos", value: `$${summary.orders.revenue}` },
    { label: "Pedidos (7 días)", value: summary.orders.last7Days },
    { label: "Pedidos (30 días)", value: summary.orders.last30Days },
    { label: "Variantes con bajo stock", value: summary.catalog.lowStock },
    { label: "Sin stock", value: summary.catalog.outOfStock },
    { label: "Notificaciones sin leer", value: summary.notifications.unread },
    { label: "Productos", value: summary.catalog.products },
  ];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Analytics</h1>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {(stats ?? Array.from({ length: 8 })).map((s, i) => (
          <Card key={s ? s.label : i}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {s?.label ?? "…"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{s?.value ?? "…"}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pedidos por estado</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          {summary &&
            (Object.entries(summary.orders.byStatus) as [OrderStatus, number][]).map(
              ([status, count]) => (
                <div key={status} className="flex items-center gap-2 text-sm">
                  <OrderStatusBadge status={status} />
                  <span className="font-semibold">{count}</span>
                </div>
              ),
            )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Top productos (unidades vendidas)</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Producto</TableHead>
                <TableHead className="text-right">Unidades</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summary?.topProducts.map((p) => (
                <TableRow key={p.productId}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell className="text-right">{p.unitsSold}</TableCell>
                </TableRow>
              ))}
              {summary?.topProducts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={2} className="text-center text-muted-foreground">
                    Sin ventas todavía.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Bajo stock (≤ {summary?.catalog.lowStockThreshold ?? 5})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Producto</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Color</TableHead>
                <TableHead className="text-right">Stock</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lowStock?.map((v) => (
                <TableRow key={v.id}>
                  <TableCell className="font-medium">{v.product.name}</TableCell>
                  <TableCell className="font-mono text-xs">{v.sku}</TableCell>
                  <TableCell>{v.color}</TableCell>
                  <TableCell className="text-right font-semibold">
                    {v.stock}
                  </TableCell>
                </TableRow>
              ))}
              {lowStock?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    Nada por debajo del umbral.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
