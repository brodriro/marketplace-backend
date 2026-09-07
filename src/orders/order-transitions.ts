import { OrderStatus } from '../generated/prisma/client';

/**
 * Matriz de transiciones de estado de pedido (plan E2E §6.3). La clave es el estado actual, el
 * valor la lista de estados a los que se puede pasar. Lista vacía = estado terminal.
 *
 * Reglas de actor (se aplican en el service, no acá):
 * - `pending_payment -> cancelled`: buyer (`POST /orders/:id/cancel`) o admin.
 * - `pending_payment -> paid`: system (webhook Stripe) o `POST /orders/:id/confirm` (demo) — B4.
 * - todo el resto de las transiciones: admin (`PATCH /admin/orders/:id/status`).
 */
export const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.pending_payment]: [OrderStatus.paid, OrderStatus.cancelled],
  [OrderStatus.paid]: [
    OrderStatus.preparing,
    OrderStatus.cancelled,
    OrderStatus.refunded,
  ],
  [OrderStatus.preparing]: [OrderStatus.shipped, OrderStatus.refunded],
  [OrderStatus.shipped]: [OrderStatus.delivered, OrderStatus.refunded],
  [OrderStatus.delivered]: [OrderStatus.refunded],
  [OrderStatus.cancelled]: [],
  [OrderStatus.refunded]: [],
};

/**
 * Estados que devuelven el stock al inventario al entrar en ellos. Solo `cancelled` (§6.3: "restock
 * en cancelled") — un `refunded` desde `shipped`/`delivered` no repone: la mercadería ya salió.
 */
export const RESTOCKING_STATUSES: ReadonlySet<OrderStatus> = new Set([
  OrderStatus.cancelled,
]);

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}
