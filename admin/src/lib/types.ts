// Tipos reflejan documentacion/API.md — Decimal (price/total/unitPrice) viaja como string.

export type Role = "user" | "admin";
export type ProductStatus = "Hot" | "New" | "Normal" | "Popular";
export type OrderStatus =
  | "pending_payment"
  | "paid"
  | "preparing"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "refunded";

/** Progresión "feliz" del pedido, para render lineal del timeline. */
export const ORDER_STAGES: OrderStatus[] = [
  "pending_payment",
  "paid",
  "preparing",
  "shipped",
  "delivered",
];

/** Los 7 estados (para filtros / selectores). */
export const ORDER_STATUSES: OrderStatus[] = [
  ...ORDER_STAGES,
  "cancelled",
  "refunded",
];

/** Espejo de la matriz de transiciones del backend (`src/orders/order-transitions.ts`, §6.3). */
export const ADMIN_ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending_payment: ["paid", "cancelled"],
  paid: ["preparing", "cancelled", "refunded"],
  preparing: ["shipped", "refunded"],
  shipped: ["delivered", "refunded"],
  delivered: ["refunded"],
  cancelled: [],
  refunded: [],
};

export interface SafeUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: Role;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  name: string;
  subtitle: string | null;
  image: string | null;
}

export interface ProductVariant {
  id: string;
  productId: string;
  color: string;
  sku: string;
  stock: number;
  visible: boolean;
}

export interface Product {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  image: string | null;
  price: string;
  store: string;
  status: ProductStatus;
  visible: boolean;
  createdAt: string;
  updatedAt: string;
  variants: ProductVariant[];
}

export interface Banner {
  id: string;
  store: string;
  description: string;
  image: string;
  active: boolean;
  visible: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface OrderItem {
  id: string;
  orderId: string;
  variantId: string;
  quantity: number;
  unitPrice: string;
  variant?: ProductVariant & { product?: Product };
}

export interface Order {
  id: string;
  userId: string;
  status: OrderStatus;
  total: string;
  shippingCity: string;
  etaDays: number;
  trackingNumber: string | null;
  trackingCarrier: string | null;
  createdAt: string;
  updatedAt: string;
  items: OrderItem[];
  user?: SafeUser;
  timeline?: { status: OrderStatus; at: string }[];
}

export interface Paginated<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface AuditLogEntry {
  id: string;
  actorId: string | null;
  actorEmail: string | null;
  method: string;
  path: string;
  resource: string;
  action: string;
  entityId: string | null;
  statusCode: number;
  changes: unknown;
  createdAt: string;
}

export interface Color {
  id: string;
  name: string;
  value: string;
}

/**
 * No hay endpoint público de colores (Color es una tabla de lookup validada solo del lado
 * backend) — se hardcodea el catálogo semilla (prisma/seed-data/feed.json) para el selector.
 * Si se agregan colores nuevos en la DB, hay que actualizar esta lista a mano.
 */
export const KNOWN_COLORS: { name: string; value: string }[] = [
  { name: "Negro", value: "#000000" },
  { name: "Celeste", value: "#D4E5F5" },
  { name: "Azul", value: "#286FB2" },
  { name: "Verde", value: "#86F3B9" },
  { name: "Rojo", value: "#F38686" },
];

// --- M7 / B6 admin polish ---

export interface AnalyticsSummary {
  orders: {
    total: number;
    byStatus: Record<OrderStatus, number>;
    revenue: string;
    last7Days: number;
    last30Days: number;
  };
  catalog: {
    products: number;
    variants: number;
    lowStock: number;
    outOfStock: number;
    lowStockThreshold: number;
  };
  notifications: { total: number; unread: number };
  topProducts: { productId: string; name: string; unitsSold: number }[];
}

export interface LowStockRow {
  id: string;
  sku: string;
  color: string;
  stock: number;
  productId: string;
  product: { name: string; image: string | null };
}

export type NotificationType =
  | "order_status_changed"
  | "back_in_stock"
  | "price_drop";
export type StockAlertType = "back_in_stock" | "price_drop";

export interface MonitorNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
  productId: string | null;
  orderId: string | null;
  user: { id: string; email: string; name: string } | null;
  product: { id: string; name: string } | null;
}

export interface MonitorStockAlert {
  id: string;
  type: StockAlertType;
  notified: boolean;
  createdAt: string;
  user: { id: string; email: string; name: string } | null;
  product: { id: string; name: string } | null;
}

export interface AgentConfig {
  catalog: {
    checksum: string;
    updatedAt: string | null;
    counts: {
      categories: number;
      products: number;
      variants: number;
      colors: number;
    };
  };
  agent: { authMode: string; cartMode: string };
}
