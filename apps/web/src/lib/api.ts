function normalizeBaseUrl(value: string): string {
  return value.replace(/\/$/, "").replace(/\/api$/, "");
}

function getDefaultBrowserApiBaseUrl(): string {
  if (typeof window === "undefined") {
    return "http://localhost:8001";
  }

  const protocol = window.location.protocol === "https:" ? "https:" : "http:";
  const hostname = window.location.hostname || "localhost";
  return `${protocol}//${hostname}:8001`;
}

const BROWSER_API_BASE_URL = normalizeBaseUrl(
  import.meta.env.VITE_API_BASE_URL || getDefaultBrowserApiBaseUrl(),
);
const SERVER_API_BASE_URL = normalizeBaseUrl(
  import.meta.env.VITE_API_BASE_URL_SERVER || "http://api-gateway:8001",
);
// User profile stored in sessionStorage (not sensitive — only name/email/role).
const USER_KEY = "comstruct-user";
const LEGACY_USER_KEYS = [USER_KEY, "comstruct_auth_user"];
const SESSION_EVENT = "comstruct-auth-changed";

let authPromise: Promise<void> | null = null;
let serverUser: AuthUser | null = null;

export type AuthUser = {
  id?: string;
  company_id?: string;
  email: string;
  role?: string;
  name?: string;
};

export type ProjectRecord = {
  id: string;
  name: string;
  site_address?: string | null;
  trade?: string | null;
};

export type ProductRecommendationChoice = {
  id: string;
  supplier_id?: string | null;
  supplier_name?: string | null;
  sku?: string | null;
  name: string;
  category?: string | null;
  unit?: string | null;
  currency?: string | null;
  must_order?: boolean;
  effective_unit_price?: number | string | null;
  expected_delivery_days?: number | string | null;
  base_discount_pct?: number | string | null;
  bulk_discount_pct?: number | string | null;
  bulk_discount_threshold?: number | string | null;
  overall_score?: number | string | null;
  price_score?: number | string | null;
  delivery_score?: number | string | null;
  recommendation_bucket?: string | null;
  recommendation_tags?: string[];
};

export type OrderSummary = {
  id: string;
  project_id?: string | null;
  foreman_id: string;
  foreman_name?: string | null;
  supplier_id?: string | null;
  supplier_name?: string | null;
  total_amount: number | string;
  currency: string;
  status: string;
  created_at: string;
  updated_at?: string;
  requires_approval?: boolean;
  notes?: string | null;
  items?: Array<{
    id: string;
    quantity?: number | string;
    unit_price?: number | string;
    line_total?: number | string;
    product_snapshot?: {
      sku?: string | null;
      name?: string | null;
      unit?: string | null;
      currency?: string | null;
      category?: string | null;
      taxonomy_code?: string | null;
      taxonomy_label?: string | null;
      material_class?: string | null;
      supplier_id?: string | null;
      supplier_name?: string | null;
      must_order?: boolean;
      expected_delivery_days?: number | string | null;
      base_discount_pct?: number | string | null;
      bulk_discount_pct?: number | string | null;
      bulk_discount_threshold?: number | string | null;
      special_info?: Record<string, unknown> | null;
      recommended_supplier?: ProductRecommendationChoice | null;
      supplier_recommendations?: ProductRecommendationChoice[];
    };
  }>;
};

export type ApprovalRule = {
  id: string;
  threshold_amount: number;
  auto_approve_below: boolean;
  approver_role: string;
  daily_approval_cap: number;
  restricted_categories: string[];
};

export type ProductRecord = {
  id: string;
  sku?: string | null;
  name: string;
  category?: string | null;
  manufacturer?: string | null;
  manufacturer_sku?: string | null;
  ean?: string | null;
  image_url?: string | null;
  special_info?: Record<string, unknown> | null;
  taxonomy_code?: string | null;
  taxonomy_label?: string | null;
  unit?: string | null;
  packaging_qty?: number | null;
  unit_price?: number | null;
  currency?: string | null;
  supplier_id?: string | null;
  supplier_name?: string | null;
  source_delivery_days?: number | null;
  expected_delivery_days?: number | null;
  delivery_confidence?: number | null;
  must_order?: boolean;
  base_discount_pct?: number | null;
  bulk_discount_pct?: number | null;
  bulk_discount_threshold?: number | null;
  is_active?: boolean;
  created_at?: string | null;
  updated_at?: string | null;
};

export type SupplierRecord = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  contact_name?: string | null;
  avatar_url?: string | null;
  supports_api?: boolean;
  supports_documents?: boolean;
};

type QueryValue = string | number | boolean | null | undefined;

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function getApiBaseUrl(): string {
  return isBrowser() ? BROWSER_API_BASE_URL : SERVER_API_BASE_URL;
}

function notifySessionChange(): void {
  if (!isBrowser()) return;
  window.dispatchEvent(new Event(SESSION_EVENT));
}

function getStoredUser(): AuthUser | null {
  if (!isBrowser()) return serverUser;

  // Check sessionStorage (preferred) then legacy localStorage keys
  for (const key of LEGACY_USER_KEYS) {
    const raw = window.sessionStorage.getItem(key) ?? window.localStorage.getItem(key);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as AuthUser;
      // Migrate to sessionStorage if found in localStorage
      if (window.localStorage.getItem(key)) {
        window.sessionStorage.setItem(USER_KEY, raw);
        window.localStorage.removeItem(key);
      }
      return parsed;
    } catch {
      // Keep checking.
    }
  }
  return null;
}

function storeUser(user?: AuthUser | null): void {
  if (!user) return;
  if (!isBrowser()) {
    serverUser = user;
    return;
  }
  // User profile goes in sessionStorage (cleared when browser tab closes).
  window.sessionStorage.setItem(USER_KEY, JSON.stringify(user));
  notifySessionChange();
}

export function getCurrentUser(): AuthUser | null {
  return getStoredUser();
}

export function hasStoredSession(): boolean {
  // We can't check httpOnly cookies from JS — assume a session might exist if we have a user profile.
  return Boolean(getStoredUser());
}

export async function clearSession(): Promise<void> {
  serverUser = null;

  if (isBrowser()) {
    window.sessionStorage.removeItem(USER_KEY);
    // Remove any legacy localStorage tokens that may exist.
    window.localStorage.removeItem("comstruct-access-token");
    window.localStorage.removeItem("comstruct-refresh-token");
    window.localStorage.removeItem(USER_KEY);
    window.localStorage.removeItem("comstruct_auth_user");
  }

  // Ask the server to clear auth cookies.
  try {
    await fetch(`${getApiBaseUrl()}/auth/logout`, { method: "POST", credentials: "include" });
  } catch {
    // Best-effort; cookies will expire naturally.
  }

  notifySessionChange();
}

function withParams(path: string, params?: Record<string, QueryValue>): string {
  const baseUrl = getApiBaseUrl();
  if (!params) return `${baseUrl}${path}`;
  const url = new URL(`${baseUrl}${path}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });
  return url.toString();
}

function formatErrorDetail(detail: unknown): string | null {
  if (typeof detail === "string") {
    const trimmed = detail.trim();
    if (!trimmed) return null;

    try {
      return formatErrorDetail(JSON.parse(trimmed));
    } catch {
      return trimmed;
    }
  }

  if (Array.isArray(detail)) {
    const parts = detail
      .map((item) => {
        if (typeof item === "string") return item.trim();
        if (item && typeof item === "object" && "message" in item) {
          const message = (item as { message?: unknown }).message;
          return typeof message === "string" ? message.trim() : "";
        }
        return "";
      })
      .filter(Boolean);

    return parts.length ? parts.join(" ") : null;
  }

  if (detail && typeof detail === "object" && "message" in detail) {
    return formatErrorDetail((detail as { message?: unknown }).message);
  }

  return null;
}

async function readErrorMessage(response: Response): Promise<string> {
  const fallback =
    response.status >= 500
      ? "The live service is temporarily unavailable. Please retry in a few seconds."
      : response.status === 401
        ? "Your session has expired. Please sign in again."
        : response.status === 403
          ? "You do not have permission for this action."
          : `Request failed with status ${response.status}`;

  try {
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const payload = (await response.json()) as Record<string, unknown>;
      const detail = formatErrorDetail(payload.detail ?? payload.message ?? payload.error);
      if (detail) {
        return detail;
      }
    }

    const text = (await response.text()).trim();
    if (!text) return fallback;

    try {
      const payload = JSON.parse(text) as Record<string, unknown>;
      const detail = formatErrorDetail(payload.detail ?? payload.message ?? payload.error);
      if (detail) {
        return detail;
      }
    } catch {
      // Non-JSON response, fall through.
    }

    return text.length > 220 ? fallback : text;
  } catch {
    return fallback;
  }
}

export async function loginWithCredentials(email: string, password: string): Promise<AuthUser> {
  authPromise = (async () => {
    const response = await fetch(`${getApiBaseUrl()}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include", // receive httpOnly cookies
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      throw new Error(await readErrorMessage(response));
    }

    const data = await response.json();
    const user = (data.user ?? { email }) as AuthUser;
    storeUser(user);
  })();

  try {
    await authPromise;
    const user = getStoredUser();
    if (!user) {
      throw new Error("No user returned from login");
    }
    return user;
  } finally {
    authPromise = null;
  }
}

async function refreshSession(): Promise<boolean> {
  // Cookie-based refresh: the refresh_token cookie is sent automatically.
  const response = await fetch(`${getApiBaseUrl()}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  });

  if (!response.ok) return false;

  const data = await response.json();
  if (data.user) storeUser(data.user as AuthUser);
  return true;
}

async function ensureSession(): Promise<void> {
  // With cookie auth we can't check the token from JS. If the user object exists,
  // assume a valid session; a 401 from the server will trigger a refresh.
  if (!getStoredUser()) {
    throw new Error("Not authenticated");
  }
}

async function request<T>(
  method: string,
  path: string,
  options?: {
    params?: Record<string, QueryValue>;
    body?: BodyInit | Record<string, unknown> | null;
    auth?: boolean;
  },
  retry = true,
): Promise<T> {
  const { params, body, auth = true } = options ?? {};

  if (auth) {
    await ensureSession();
  }

  const headers = new Headers();

  let payload: BodyInit | undefined;
  if (body instanceof FormData) {
    payload = body;
  } else if (body !== undefined && body !== null) {
    headers.set("Content-Type", "application/json");
    payload = JSON.stringify(body);
  }

  const response = await fetch(withParams(path, params), {
    method,
    headers,
    credentials: "include", // send httpOnly auth cookies automatically
    body: payload,
  });

  if (response.status === 401 && retry && auth) {
    const refreshed = await refreshSession().catch(() => false);
    if (!refreshed) {
      clearSession();
      throw new Error("Session expired");
    }
    return request<T>(method, path, options, false);
  }

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json() as Promise<T>;
  }

  return undefined as T;
}

export const api = {
  get: <T>(path: string, options?: { params?: Record<string, QueryValue>; auth?: boolean }) =>
    request<T>("GET", path, options),
  post: <T>(
    path: string,
    body?: BodyInit | FormData | Record<string, unknown> | null,
    options?: { params?: Record<string, QueryValue>; auth?: boolean },
  ) => request<T>("POST", path, { ...options, body }),
  put: <T>(
    path: string,
    body?: BodyInit | FormData | Record<string, unknown> | null,
    options?: { params?: Record<string, QueryValue>; auth?: boolean },
  ) => request<T>("PUT", path, { ...options, body }),
  patch: <T>(
    path: string,
    body?: BodyInit | FormData | Record<string, unknown> | null,
    options?: { params?: Record<string, QueryValue>; auth?: boolean },
  ) => request<T>("PATCH", path, { ...options, body }),
};

export function normalizeCurrency(currency: string | null | undefined): string {
  const code = (currency ?? "EUR").toUpperCase();
  return code === "CHF" ? "EUR" : code;
}

export function formatCurrency(
  value: number | string | null | undefined,
  currency = "EUR",
): string {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: normalizeCurrency(currency),
    maximumFractionDigits: 0,
  }).format(Number.isFinite(amount) ? amount : 0);
}

export function shortId(value: string | null | undefined): string {
  return value ? value.slice(0, 8) : "—";
}

export function sentenceCaseStatus(status: string | null | undefined): string {
  if (!status) return "Unknown";
  return status.replace(/_/g, " ").replace(/\b\w/g, (match) => match.toUpperCase());
}
