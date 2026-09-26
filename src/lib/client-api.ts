/**
 * Browser API client for the REST backend.
 * JWT access/refresh tokens are kept in localStorage (sent as `Authorization: Bearer`),
 * with httpOnly cookies as a same-origin fallback. Expired access tokens are refreshed
 * transparently once, then the request is retried.
 */

const ACCESS_KEY = "lumiere.access";
const REFRESH_KEY = "lumiere.refresh";

function storage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export const tokenStore = {
  get access() {
    return storage()?.getItem(ACCESS_KEY) ?? null;
  },
  get refresh() {
    return storage()?.getItem(REFRESH_KEY) ?? null;
  },
  set(access: string, refresh?: string) {
    const s = storage();
    if (!s) return;
    s.setItem(ACCESS_KEY, access);
    if (refresh) s.setItem(REFRESH_KEY, refresh);
  },
  clear() {
    const s = storage();
    s?.removeItem(ACCESS_KEY);
    s?.removeItem(REFRESH_KEY);
  },
};

export class ApiClientError extends Error {
  status: number;
  fields?: Record<string, string>;
  constructor(message: string, status: number, fields?: Record<string, string>) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

let refreshPromise: Promise<boolean> | null = null;

async function doRefresh(): Promise<boolean> {
  try {
    const res = await fetch("/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh: tokenStore.refresh ?? undefined }),
      credentials: "same-origin",
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { access: string; refresh: string };
    tokenStore.set(data.access, data.refresh);
    return true;
  } catch {
    return false;
  }
}

export function refreshAccessToken() {
  if (!refreshPromise) refreshPromise = doRefresh().finally(() => (refreshPromise = null));
  return refreshPromise;
}

type ApiOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  formData?: FormData;
  signal?: AbortSignal;
};

const NO_REFRESH = ["/api/auth/login", "/api/auth/register", "/api/auth/refresh"];

export async function api<T = unknown>(path: string, options: ApiOptions = {}): Promise<T> {
  const url = path.startsWith("/api") ? path : `/api${path}`;
  const send = () => {
    const headers: Record<string, string> = { Accept: "application/json" };
    const token = tokenStore.access;
    if (token) headers.Authorization = `Bearer ${token}`;
    let body: BodyInit | undefined;
    if (options.formData) body = options.formData;
    else if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(options.body);
    }
    return fetch(url, { method: options.method ?? "GET", headers, body, credentials: "same-origin", signal: options.signal, cache: "no-store" });
  };

  let res = await send();
  if (res.status === 401 && !NO_REFRESH.some((p) => url.startsWith(p))) {
    const refreshed = await refreshAccessToken();
    if (refreshed) res = await send();
    else if (typeof window !== "undefined" && !url.startsWith("/api/auth/me")) {
      window.dispatchEvent(new Event("lumiere:auth-expired"));
    }
  }

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!res.ok) {
    const d = data as { error?: string; fields?: Record<string, string> } | null;
    throw new ApiClientError(d?.error ?? `Request failed (${res.status})`, res.status, d?.fields);
  }
  return data as T;
}

export const fetcher = <T,>(path: string) => api<T>(path);

export function errorMessage(err: unknown, fallback = "Something went wrong. Please try again.") {
  if (err instanceof ApiClientError || err instanceof Error) return err.message || fallback;
  return fallback;
}

export function fieldErrors(err: unknown): Record<string, string> {
  return err instanceof ApiClientError && err.fields ? err.fields : {};
}

/** Multipart upload with progress reporting (XHR), including one transparent token refresh. */
export function uploadWithProgress<T = unknown>(path: string, formData: FormData, onProgress: (pct: number) => void): Promise<T> {
  const url = path.startsWith("/api") ? path : `/api${path}`;
  const attempt = () =>
    new Promise<{ status: number; body: unknown }>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", url);
      xhr.withCredentials = true;
      const token = tokenStore.access;
      if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        let body: unknown = null;
        try {
          body = JSON.parse(xhr.responseText);
        } catch {
          body = null;
        }
        resolve({ status: xhr.status, body });
      };
      xhr.onerror = () => reject(new ApiClientError("Network error during upload", 0));
      xhr.send(formData);
    });

  return (async () => {
    let r = await attempt();
    if (r.status === 401 && (await refreshAccessToken())) r = await attempt();
    if (r.status < 200 || r.status >= 300) {
      const b = r.body as { error?: string } | null;
      throw new ApiClientError(b?.error ?? "Upload failed", r.status);
    }
    return r.body as T;
  })();
}
