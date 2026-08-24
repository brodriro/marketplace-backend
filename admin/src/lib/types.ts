// Tipos reflejan documentacion/API.md — Decimal (price/total/unitPrice) viaja como string.

export type Role = "user" | "admin";
export type ProductStatus = "Hot" | "New" | "Normal" | "Popular";
export type OrderStatus =
  | "pending_payment"
  | "processing"
  | "shipped"
  | "delivered";

export const ORDER_STAGES: OrderStatus[] = [
  "pending_payment",
  "processing",
  "shipped",
  "delivered",
];

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
  { name: "Black", value: "#000000" },
  { name: "LightBlue", value: "#D4E5F5" },
  { name: "Blue", value: "#286FB2" },
  { name: "Green", value: "#86F3B9" },
  { name: "Red", value: "#F38686" },
];
