import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "react-router";
import { useStytch } from "@stytch/react";
import { fetchMe, mintDemoSession } from "./authApi";
import {
  clearAuthUser,
  getAuthUser,
  setAuthUser,
  type AuthUser,
} from "./session";

interface AuthContextValue {
  /** The authenticated identity, or null when logged out. */
  user: AuthUser | null;
  /** One-click demo login: mints a real Stytch session for a seeded persona
   *  (POST /demo-sessions), then resolves identity + assigned role via /me.
   *  Rejects on failure so the login screen can surface the error. */
  loginAsDemo: (email: string) => Promise<void>;
  /** Persist an identity resolved from a real Stytch (magic-link) session. */
  applyStytchUser: (user: AuthUser) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const stytch = useStytch();
  const navigate = useNavigate();
  const [user, setUser] = useState<AuthUser | null>(getAuthUser);

  const loginAsDemo = useCallback(
    async (email: string) => {
      const { session_jwt } = await mintDemoSession(email);
      const me = await fetchMe(session_jwt);
      const next: AuthUser = {
        email: me.email,
        name: me.name,
        role: me.role,
        permissions: me.permissions ?? [],
        via: "demo",
        sessionJwt: session_jwt,
      };
      setAuthUser(next);
      setUser(next);
      navigate("/");
    },
    [navigate],
  );

  const applyStytchUser = useCallback((next: AuthUser) => {
    setAuthUser(next);
    setUser(next);
  }, []);

  const logout = useCallback(() => {
    clearAuthUser();
    setUser(null);
    // Best-effort: revoke the Stytch session (demo sessions are real Stytch
    // sessions too, JAS-80). Harmless if already expired.
    void stytch.session.revoke().catch(() => {});
    navigate("/login");
  }, [navigate, stytch]);

  const value = useMemo(
    () => ({ user, loginAsDemo, applyStytchUser, logout }),
    [user, loginAsDemo, applyStytchUser, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
