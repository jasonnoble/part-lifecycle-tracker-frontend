import { clearAuthUser, getAuthUser, sessionJwt } from "./auth/session";
import type { Paginated } from "./api/types";

const BASE = import.meta.env.VITE_API_BASE_URL ?? "";

/** Thrown for non-2xx responses; carries the backend `{ error, code }` payload when present. */
export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  // Every request authenticates with the Stytch session JWT (JAS-78/79); the
  // backend derives identity, role, and actor from it. X-Actor-Role is gone —
  // CORS no longer even admits the header. Callers may override Authorization
  // via init.headers (e.g. fetching /me right after minting a session).
  const jwt = sessionJwt();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
      ...init.headers,
    },
  });
  if (!res.ok) {
    const err = await toApiError(res);
    // 401 while holding a session means the backend rejected our JWT — the
    // ~60-min Stytch session expired or was revoked. Drop the dead session and
    // restart at the login screen instead of stranding the user on error
    // states. (No session → just surface the error; e.g. a failed login.)
    if (err.status === 401 && getAuthUser()) {
      clearAuthUser();
      window.location.assign("/login");
    }
    throw err;
  }
  return res.json() as Promise<T>;
}

/** Convenience for index endpoints: unwraps the pagy `{ data, meta }` envelope to the array. */
export async function apiList<T>(path: string, init: RequestInit = {}): Promise<T[]> {
  const { data } = await api<Paginated<T>>(path, init);
  return data;
}

async function toApiError(res: Response): Promise<ApiError> {
  // Errors come back as { error, code }; fall back to the status line.
  let message = `${res.status} ${res.statusText}`;
  let code: string | undefined;
  try {
    const body: unknown = await res.json();
    if (body && typeof body === "object") {
      const payload = body as Record<string, unknown>;
      if (typeof payload.error === "string") message = payload.error;
      if (typeof payload.code === "string") code = payload.code;
    }
  } catch {
    // Non-JSON body; keep the status-line message.
  }
  return new ApiError(message, res.status, code);
}
