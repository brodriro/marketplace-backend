import { Badge } from "@/components/ui/badge";
import type { OrderStatus, ProductStatus } from "@/lib/types";

const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending_payment: "Pago pendiente",
  paid: "Pagado",
  preparing: "Preparando",
  shipped: "Enviado",
  delivered: "Entregado",
  cancelled: "Cancelado",
  refunded: "Reembolsado",
};

const ORDER_STATUS_VARIANT: Record<
  OrderStatus,
  "outline" | "secondary" | "default" | "destructive"
> = {
  pending_payment: "outline",
  paid: "secondary",
  preparing: "secondary",
  shipped: "secondary",
  delivered: "default",
  cancelled: "destructive",
  refunded: "destructive",
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
