import { Badge } from "@/components/ui/badge";
import type { OrderStatus, ProductStatus } from "@/lib/types";

const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending_payment: "Pago pendiente",
  processing: "Procesando",
  shipped: "Enviado",
  delivered: "Entregado",
};

const ORDER_STATUS_VARIANT: Record<
  OrderStatus,
  "outline" | "secondary" | "default"
> = {
  pending_payment: "outline",
  processing: "secondary",
  shipped: "secondary",
  delivered: "default",
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <Badge variant={ORDER_STATUS_VARIANT[status]}>
      {ORDER_STATUS_LABEL[status]}
    </Badge>
  );
}

export function ProductStatusBadge({ status }: { status: ProductStatus }) {
  return <Badge variant="outline">{status}</Badge>;
}
