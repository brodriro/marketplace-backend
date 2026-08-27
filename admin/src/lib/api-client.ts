import { clearToken, getToken } from "./auth";
import type {
  Banner,
  Category,
  Order,
  OrderStatus,
  Paginated,
  Product,
  ProductVariant,
  Role,
  SafeUser,
} from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });

  if (res.status === 401) {
    clearToken();
    if (typeof window !== "undefined") {
      // Reset duro intencional (no useRouter): este módulo no es un componente/hook, y una
      // sesión vencida debe limpiar todo el estado de la app, no solo navegar.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = "/login";
    }
    throw new ApiError(401, "No autenticado");
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => ({ message: res.statusText }))) as {
      message?: string | string[];
    };
    const message = Array.isArray(body.message)
      ? body.message.join(", ")
      : (body.message ?? res.statusText);
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) {
    return undefined as T;
  }
  return res.json() as Promise<T>;
}

export const api = {
  login: (email: string, password: string) =>
    request<{ accessToken: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  categories: {
    list: () => request<Category[]>("/categories"),
    get: (id: string) => request<Category>(`/admin/categories/${id}`),
    create: (data: { name: string; subtitle?: string; image?: string }) =>
      request<Category>("/admin/categories", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (
      id: string,
      data: Partial<{ name: string; subtitle: string; image: string }>,
    ) =>
      request<Category>(`/admin/categories/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    remove: (id: string) =>
      request<void>(`/admin/categories/${id}`, { method: "DELETE" }),
  },

  products: {
    list: (page = 1, pageSize = 20) =>
      request<{ items: Product[]; page: number; pageSize: number; total: number }>(
        `/admin/products?page=${page}&pageSize=${pageSize}`,
      ),
    get: (id: string) => request<Product>(`/admin/products/${id}`),
    create: (data: {
      categoryId: string;
      name: string;
      description: string;
      image?: string;
      price: number;
      store: string;
      status?: string;
      variants: { color: string; sku: string; stock?: number }[];
    }) =>
      request<Product>("/admin/products", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (id: string, data: Partial<{
      categoryId: string;
      name: string;
      description: string;
      image: string | null;
      price: number;
      store: string;
      status: string;
    }>) =>
      request<Product>(`/admin/products/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    remove: (id: string) =>
      request<void>(`/admin/products/${id}`, { method: "DELETE" }),
    addVariant: (
      productId: string,
      data: { color: string; sku: string; stock?: number },
    ) =>
      request<ProductVariant>(`/admin/products/${productId}/variants`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    updateVariant: (
      productId: string,
      variantId: string,
      data: Partial<{ color: string; sku: string; stock: number }>,
    ) =>
      request<ProductVariant>(
        `/admin/products/${productId}/variants/${variantId}`,
        { method: "PATCH", body: JSON.stringify(data) },
      ),
    removeVariant: (productId: string, variantId: string) =>
      request<void>(`/admin/products/${productId}/variants/${variantId}`, {
        method: "DELETE",
      }),
  },

  banners: {
    list: (page = 1, pageSize = 20) =>
      request<Paginated<Banner>>(`/admin/banners?page=${page}&pageSize=${pageSize}`),
    get: (id: string) => request<Banner>(`/admin/banners/${id}`),
    create: (data: {
      store: string;
      description: string;
      image: string;
      active?: boolean;
      sortOrder?: number;
    }) =>
      request<Banner>("/admin/banners", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (
      id: string,
      data: Partial<{
        store: string;
        description: string;
        image: string;
        active: boolean;
        sortOrder: number;
      }>,
    ) =>
      request<Banner>(`/admin/banners/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    remove: (id: string) =>
      request<void>(`/admin/banners/${id}`, { method: "DELETE" }),
  },

  orders: {
    list: (page = 1, pageSize = 20, status?: OrderStatus) =>
      request<Paginated<Order>>(
        `/admin/orders?page=${page}&pageSize=${pageSize}${status ? `&status=${status}` : ""}`,
      ),
    get: (id: string) => request<Order>(`/admin/orders/${id}`),
    updateStatus: (
      id: string,
      data: {
        status?: OrderStatus;
        trackingNumber?: string;
        trackingCarrier?: string;
      },
    ) =>
      request<Order>(`/admin/orders/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
  },

  users: {
    list: (page = 1, pageSize = 20) =>
      request<Paginated<SafeUser>>(`/admin/users?page=${page}&pageSize=${pageSize}`),
    get: (id: string) => request<SafeUser>(`/admin/users/${id}`),
    update: (
      id: string,
      data: Partial<{ email: string; name: string; avatarUrl: string }>,
    ) =>
      request<SafeUser>(`/admin/users/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    setRole: (id: string, role: Role) =>
      request<SafeUser>(`/admin/users/${id}/role`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      }),
    setActive: (id: string, active: boolean) =>
      request<SafeUser>(`/admin/users/${id}/active`, {
        method: "PATCH",
        body: JSON.stringify({ active }),
      }),
  },
};
