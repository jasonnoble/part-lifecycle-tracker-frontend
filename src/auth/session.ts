/** How the current identity was established. */
export type AuthVia = "demo" | "magic_link";

/** The authenticated identity, as resolved by GET /me (JAS-79). Role and
 *  permissions are *assigned* server-side, never client-supplied. A session
 *  whose Stytch identity isn't a seeded user has null email/name/role and no
 *  permissions: authenticated but read-only. */
export interface AuthUser {
  email: string | null;
  name: string | null;
  role: string | null;
  /** Server-computed abilities (Permissions matrix), e.g. "step.certify" —
   *  the SPA gates UI from the same policy the API enforces. */
  permissions: string[];
  via: AuthVia;
  /** Stytch session JWT, sent as the Bearer token on every API request. */
  sessionJwt: string;
}

// The identity is cached in a cookie (matching the app's existing cookie
// pattern) so it survives reloads and is readable synchronously outside React.
// The Stytch SDK manages its own session cookie/expiry; this is just the
// resolved identity. A session cookie (no max-age) clears when the browser
// closes.
const COOKIE = "pl_session";

function readCookie(name: string): string | null {
  const m = document.cookie.match(
    new RegExp("(?:^|;\\s*)" + name + "=([^;]*)"),
  );
  return m ? decodeURIComponent(m[1]) : null;
}

/** The persisted identity, or null when logged out. Safe to call outside React
 *  (e.g. from `apiClient`). */
export function getAuthUser(): AuthUser | null {
  const raw = readCookie(COOKIE);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<AuthUser>;
    // Without a JWT every API call would 401 — treat as logged out.
    if (!parsed.sessionJwt) return null;
    return { ...parsed, permissions: parsed.permissions ?? [] } as AuthUser;
  } catch {
    return null;
  }
}

export function setAuthUser(user: AuthUser): void {
  const value = encodeURIComponent(JSON.stringify(user));
  document.cookie = `${COOKIE}=${value}; path=/; SameSite=Lax`;
}

export function clearAuthUser(): void {
  document.cookie = `${COOKIE}=; path=/; max-age=0`;
}

/** The Stytch session JWT for the current identity, if any. */
export function sessionJwt(): string | undefined {
  return getAuthUser()?.sessionJwt;
}
