import { getRole } from "./roles";

const BASE = import.meta.env.VITE_API_BASE_URL ?? "";

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${BASE}${path}`, {
        ...init,
        headers: {
            "Content-Type": "application/json",
            "X-Actor-Role": getRole(),
            ...init.headers,
        },
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json() as Promise<T>;
}