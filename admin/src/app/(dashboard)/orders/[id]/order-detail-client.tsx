"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { OrderStatusBadge } from "@/components/status-badge";
import { ApiError, api } from "@/lib/api-client";
import { ADMIN_ALLOWED_TRANSITIONS } from "@/lib/types";
import type { Order, OrderStatus } from "@/lib/types";

export function OrderDetailClient({ id }: { id: string }) {
  const router = useRouter();
  const [order, setOrder] = useState<Order | null>(null);
  const [status, setStatus] = useState<OrderStatus | "">("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [trackingCarrier, setTrackingCarrier] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const o = await api.orders.get(id);
      setOrder(o);
      setStatus(o.status);
      setTrackingNumber(o.trackingNumber ?? "");
      setTrackingCarrier(o.trackingCarrier ?? "");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Error cargando pedido");
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch al montar, no un loop de render
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleSave() {
    if (!order) return;
    setSaving(true);
    try {
      await api.orders.updateStatus(id, {
        status: status !== order.status ? (status as OrderStatus) : undefined,
        trackingNumber: trackingNumber || undefined,
        trackingCarrier: trackingCarrier || undefined,
      });
      toast.success("Pedido actualizado");
      await load();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Error guardando");
    } finally {
      setSaving(false);
    }
  }

  if (!order) {
    return <p className="text-muted-foreground">Cargando…</p>;
  }

  // Estados a los que se puede transicionar (matriz §6.3) + el actual, para el <Select>.
  const allowedStages: OrderStatus[] = [
    order.status,
    ...ADMIN_ALLOWED_TRANSITIONS[order.status],
  ];

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <Button variant="ghost" size="sm" className="w-fit" onClick={() => router.push("/orders")}>
        ← Volver
      </Button>

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Pedido #{order.id.slice(0, 8)}</h1>
        <OrderStatusBadge status={order.status} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cliente y envío</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-muted-foreground">Cliente</div>
            <div>{order.user?.name ?? order.userId}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Email</div>
            <div>{order.user?.email ?? "—"}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Ciudad</div>
            <div>{order.shippingCity}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Total</div>
            <div>${order.total}</div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Items</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          {order.items.map((item) => (
            <div key={item.id} className="flex justify-between border-b pb-2 last:border-none">
              <span>
                {item.variant?.product?.name ?? item.variantId} × {item.quantity}
              </span>
              <span>${item.unitPrice}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Estado y tracking</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label>Estado (solo puede avanzar)</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as OrderStatus)}>
              <SelectTrigger className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {allowedStages.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="trackingNumber">Número de tracking</Label>
            <Input
              id="trackingNumber"
              value={trackingNumber}
              onChange={(e) => setTrackingNumber(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="trackingCarrier">Courier</Label>
            <Input
              id="trackingCarrier"
              value={trackingCarrier}
              onChange={(e) => setTrackingCarrier(e.target.value)}
            />
          </div>
          <Button onClick={handleSave} disabled={saving} className="w-fit">
            {saving ? "Guardando…" : "Guardar cambios"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Timeline</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          {order.timeline?.map((step) => (
            <div key={step.status} className="flex justify-between">
              <span>{step.status}</span>
              <span className="text-muted-foreground">
                {new Date(step.at).toLocaleString()}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
