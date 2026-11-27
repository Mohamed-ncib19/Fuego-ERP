import axios, { AxiosError, type AxiosRequestConfig } from "axios";

/**
 * Same-origin API client. The API key comes from the Electron preload
 * (window.fuego) — it proves the call comes from the app window, not from
 * some other local process or web page.
 */
let apiKey: string | null = null;

export function setApiKey(key: string | null) {
  apiKey = key;
}

export const http = axios.create({
  baseURL: "/api",
  withCredentials: true,
});

http.interceptors.request.use((config) => {
  if (apiKey) config.headers["x-api-key"] = apiKey;
  return config;
});

// ---------------------------------------------------------------------------
// Envelope unwrapping: every endpoint answers { data, meta, error }.
// The client throws the inner error.message so components show real text.
// ---------------------------------------------------------------------------

interface Envelope<T> {
  data: T | null;
  meta?: Record<string, unknown>;
  error?: { message?: string; code?: string } | null;
}

function extractError(payload: unknown): string {
  if (payload && typeof payload === "object" && "error" in (payload as any)) {
    const env = payload as Envelope<unknown>;
    if (env.error?.message) return env.error.message;
  }
  if (payload && typeof payload === "object" && "message" in (payload as any)) {
    return String((payload as any).message);
  }
  return "Une erreur est survenue";
}

let refreshing: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (!refreshing) {
    refreshing = (async () => {
      try {
        await http.post("/auth/refresh");
        return true;
      } catch {
        return false;
      } finally {
        setTimeout(() => (refreshing = null), 50);
      }
    })();
  }
  return refreshing;
}

http.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as (AxiosRequestConfig & { _retried?: boolean }) | undefined;
    const url = config?.url ?? "";

    // A dead access token gets one silent refresh attempt (never on login /
    // refresh itself — those must surface their own errors).
    if (
      error.response?.status === 401 &&
      config &&
      !config._retried &&
      !url.includes("/auth/login") &&
      !url.includes("/auth/refresh") &&
      !url.includes("/setup") &&
      (await tryRefresh())
    ) {
      config._retried = true;
      return http.request(config);
    }
    return Promise.reject(new Error(extractError(error.response?.data)));
  },
);

/** Typed GET/POST/PATCH helpers returning the envelope's data (+meta). */
export async function apiGet<T, M = Record<string, unknown>>(
  url: string,
  params?: Record<string, unknown>,
): Promise<{ data: T; meta?: M }> {
  const res = await http.get<Envelope<T>>(url, { params });
  // Extra top-level envelope fields (e.g. `totalAmount` on expense and
  // payment lists) pass through instead of being dropped.
  return { ...(res.data as object), data: res.data.data as T, meta: res.data.meta as M | undefined };
}

export async function apiPost<T>(url: string, body?: unknown): Promise<T> {
  const res = await http.post<Envelope<T>>(url, body);
  return res.data.data as T;
}

export async function apiPatch<T>(url: string, body?: unknown): Promise<T> {
  const res = await http.patch<Envelope<T>>(url, body);
  return res.data.data as T;
}

export async function apiDelete<T>(url: string): Promise<T> {
  const res = await http.delete<Envelope<T>>(url);
  return res.data.data as T;
}
