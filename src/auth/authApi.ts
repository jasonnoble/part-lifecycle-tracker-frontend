import { api } from "../apiClient";

/** GET /me payload (JAS-79): identity + assigned role + server-computed
 *  abilities. All-null identity = authenticated but unseeded (read-only). */
export interface Me {
  email: string | null;
  name: string | null;
  role: string | null;
  permissions?: string[];
}

/** Resolve the authenticated identity for a session JWT. Passed explicitly
 *  because this runs during login, before the session is persisted. */
export function fetchMe(jwt: string): Promise<Me> {
  return api<Me>("/me", { headers: { Authorization: `Bearer ${jwt}` } });
}

/** POST /demo-sessions (JAS-80): mint a real Stytch session for one of the six
 *  seeded demo personas. 404s for any other email. */
export function mintDemoSession(
  email: string,
): Promise<{ session_jwt: string; session_token: string }> {
  return api("/demo-sessions", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}
