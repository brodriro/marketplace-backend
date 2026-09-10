import { clearTokens, getRefreshToken, getToken, setTokens } from "./auth";
import type { AuthTokens } from "./auth";
import type {
  AgentConfig,
  AnalyticsSummary,
  AuditLogEntry,
  Banner,
  Category,
  LowStockRow,
  MonitorNotification,
  MonitorStockAlert,
  NotificationType,
  Order,
  OrderStatus,
  Paginated,
  Product,
  ProductVariant,
  Role,
  SafeUser,
  StockAlertType,
} from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000/v1";

// Id de corrida de prueba coordinada (plan E2E §7.2, Capa 2). Sólo se setea en builds de QA
// durante un test E2E; ausente => no se manda el header `X-E2E-Run` y el backend no hace nada.
const E2E_RUN_ID = process.env.NEXT_PUBLIC_E2E_RUN?.trim() || undefined;

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function redirectToLogin(): void {
  clearTokens();
  if (typeof window !== "undefined") {
    // Reset duro intencional (no useRouter): este módulo no es un componente/hook, y una
    // sesión vencida debe limpiar todo el estado de la app, no solo navegar.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/login";
  }
}

/** Un solo refresh en vuelo a la vez: varios 401 concurrentes comparten la misma promesa. */
let refreshInFlight: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  refreshInFlight ??= (async () => {
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) return false;
      const tokens = (await res.json()) as AuthTokens;
      setTokens(tokens);
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

async function rawRequest(path: string, init: RequestInit): Promise<Response> {
  const token = getToken();
  return fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(E2E_RUN_ID ? { "X-E2E-Run": E2E_RUN_ID } : {}),
      ...init.headers,
    },
  });
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res = await rawRequest(path, init);

  if (res.status === 401 && (await tryRefresh())) {
    res = await rawRequest(path, init);
  }

  if (res.status === 401) {
    redirectToLogin();
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
    request<AuthTokens>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),

  logout: async () => {
    const refreshToken = getRefreshToken();
    if (refreshToken) {
      // best-effort: revoca la familia server-side; si falla igual limpiamos local
      await request<void>("/auth/logout", {
        method: "POST",
        body: JSON.stringify({ refreshToken }),
      }).catch(() => undefined);
    }
    clearTokens();
  },

  auditLogs: {
    list: (page = 1, pageSize = 20, resource?: string) =>
      request<Paginated<AuditLogEntry>>(
        `/admin/audit-logs?page=${page}&pageSize=${pageSize}${
          resource ? `&resource=${resource}` : ""
        }`,
      ),
  },

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

  analytics: {
    summary: () => request<AnalyticsSummary>("/admin/analytics"),
    lowStock: (threshold?: number, page = 1, pageSize = 20) =>
      request<Paginated<LowStockRow> & { threshold: number }>(
        `/admin/analytics/low-stock?page=${page}&pageSize=${pageSize}${
          threshold != null ? `&threshold=${threshold}` : ""
        }`,
      ),
  },

  monitor: {
    notifications: (
      page = 1,
      pageSize = 20,
      opts: { type?: NotificationType; read?: boolean } = {},
    ) =>
      request<Paginated<MonitorNotification>>(
        `/admin/monitor/notifications?page=${page}&pageSize=${pageSize}${
          opts.type ? `&type=${opts.type}` : ""
        }${opts.read != null ? `&read=${opts.read}` : ""}`,
      ),
    stockAlerts: (
      page = 1,
      pageSize = 20,
      opts: { type?: StockAlertType; notified?: boolean } = {},
    ) =>
      request<Paginated<MonitorStockAlert>>(
        `/admin/monitor/stock-alerts?page=${page}&pageSize=${pageSize}${
          opts.type ? `&type=${opts.type}` : ""
        }${opts.notified != null ? `&notified=${opts.notified}` : ""}`,
      ),
  },

  agentConfig: {
    get: () => request<AgentConfig>("/admin/agent-config"),
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
