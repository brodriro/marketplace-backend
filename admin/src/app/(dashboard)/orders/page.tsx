"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { OrderStatusBadge } from "@/components/status-badge";
import { ApiError, api } from "@/lib/api-client";
import { ORDER_STATUSES } from "@/lib/types";
import type { Order, OrderStatus } from "@/lib/types";

const STATUS_OPTIONS: (OrderStatus | "all")[] = ["all", ...ORDER_STATUSES];

function OrdersPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const statusFilter = (searchParams.get("status") as OrderStatus | null) ?? "all";
  const [orders, setOrders] = useState<Order[] | null>(null);

  async function load(filter: OrderStatus | "all") {
    try {
      const res = await api.orders.list(1, 100, filter === "all" ? undefined : filter);
      setOrders(res.data);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Error cargando pedidos");
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch al montar/cambiar filtro, no un loop de render
    load(statusFilter);
  }, [statusFilter]);

  function handleStatusChange(value: OrderStatus | "all") {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all") {
      params.delete("status");
    } else {
      params.set("status", value);
    }
    const query = params.toString();
    router.replace(query ? `/orders?${query}` : "/orders");
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Pedidos</h1>
        <Select value={statusFilter} onValueChange={(v) => handleStatusChange(v as OrderStatus | "all")}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s} value={s}>
                {s === "all" ? "Todos los estados" : s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Ciudad</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders?.map((order) => (
              <TableRow key={order.id}>
                <TableCell className="font-medium">
                  {order.user?.name ?? order.userId}
                </TableCell>
                <TableCell>{order.shippingCity}</TableCell>
                <TableCell>${order.total}</TableCell>
                <TableCell>
                  <OrderStatusBadge status={order.status} />
                </TableCell>
                <TableCell>{new Date(order.createdAt).toLocaleDateString()}</TableCell>
                <TableCell className="text-right">
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/orders/${order.id}`}>Ver</Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {orders?.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  No hay pedidos.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export default function OrdersPage() {
  return (
    <Suspense fallback={<p className="text-muted-foreground">Cargando…</p>}>
      <OrdersPageContent />
    </Suspense>
  );
}
