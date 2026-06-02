import { getRole } from "./roles";
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
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Actor-Role": getRole(),
      ...init.headers,
    },
  });
  if (!res.ok) throw await toApiError(res);
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
