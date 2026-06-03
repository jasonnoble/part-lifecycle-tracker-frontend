import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useStytch } from "@stytch/react";
import { fetchMe } from "../auth/authApi";
import { useAuth } from "../auth/AuthProvider";

// Finishes a magic-link login: exchanges the URL token for a Stytch session,
// then resolves identity + assigned role from the backend (GET /me, JAS-79).
// An authenticated-but-unseeded email yields a read-only session (null role,
// no permissions) — still stored, the app simply gates all writes.
export default function Authenticate() {
  const stytch = useStytch();
  const navigate = useNavigate();
  const { applyStytchUser } = useAuth();

  const [error, setError] = useState<string | null>(null);
  // The magic-link token is single-use; guard against StrictMode's double-invoke.
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    (async () => {
      try {
        await stytch.authenticateByUrl({ session_duration_minutes: 60 });
        const jwt = stytch.session.getTokens()?.session_jwt;
        if (!jwt) throw new Error("No session was established.");

        const me = await fetchMe(jwt);
        applyStytchUser({
          email: me.email,
          name: me.name,
          role: me.role,
          permissions: me.permissions ?? [],
          via: "magic_link",
          sessionJwt: jwt,
        });
        navigate("/", { replace: true });
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "The sign-in link was invalid.",
        );
      }
    })();
  }, [stytch, applyStytchUser, navigate]);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 py-12 text-center">
      {error === null ? (
        <p className="text-sm text-gray-500">Signing you in…</p>
      ) : (
        <div className="space-y-3">
          <h1 className="text-base font-semibold text-gray-900">
            Sign-in failed
          </h1>
          <p className="text-sm text-red-600">{error}</p>
          <Link
            to="/login"
            className="inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Back to sign in
          </Link>
        </div>
      )}
    </main>
  );
}
