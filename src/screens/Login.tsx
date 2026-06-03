import { useState, type FormEvent } from "react";
import { useStytch } from "@stytch/react";
import { PERSONAS } from "../roles";
import { useAuth } from "../auth/AuthProvider";

// Magic-link redirect target — the /authenticate route finishes the login. Use
// the live origin so the same build works in dev and on Cloudflare Pages.
const REDIRECT_URL = `${window.location.origin}/authenticate`;

type MagicStatus = "idle" | "sending" | "sent" | "error";

export default function Login() {
  const stytch = useStytch();
  const { loginAsDemo } = useAuth();

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<MagicStatus>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  // Demo login = a real backend round-trip (POST /demo-sessions then GET /me),
  // so track which persona is in flight and surface failures.
  const [pendingDemo, setPendingDemo] = useState<string | null>(null);
  const [demoError, setDemoError] = useState("");

  async function demoLogin(personaEmail: string) {
    setPendingDemo(personaEmail);
    setDemoError("");
    try {
      await loginAsDemo(personaEmail);
    } catch (err) {
      setDemoError(
        err instanceof Error
          ? err.message
          : "Demo login failed. Is the API reachable?",
      );
      setPendingDemo(null);
    }
  }

  async function sendMagicLink(e: FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setErrorMsg("");
    try {
      await stytch.magicLinks.email.loginOrCreate(email, {
        login_magic_link_url: REDIRECT_URL,
        signup_magic_link_url: REDIRECT_URL,
        login_expiration_minutes: 60,
        signup_expiration_minutes: 60,
      });
      setStatus("sent");
    } catch (err) {
      setStatus("error");
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Couldn't send the magic link. Check the email and try again.",
      );
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <div className="mb-8 flex items-center gap-3">
        <img
          src="/part-lifecycle-tracker-logo.svg"
          alt=""
          className="h-12 w-12"
        />
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-gray-900">
            Part Lifecycle Tracker
          </h1>
          <p className="text-sm text-gray-500">Sign in to continue</p>
        </div>
      </div>

      {/* One-click demo logins — the primary "click and explore" path. */}
      <section aria-labelledby="demo-heading">
        <h2
          id="demo-heading"
          className="text-xs font-semibold uppercase tracking-wide text-gray-500"
        >
          Explore as a demo user
        </h2>
        <ul className="mt-3 grid gap-2">
          {PERSONAS.map((p) => (
            <li key={p.email}>
              <button
                type="button"
                disabled={pendingDemo !== null}
                onClick={() => demoLogin(p.email)}
                className="flex w-full items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3 text-left shadow-sm transition-colors hover:border-blue-400 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
              >
                <span className="text-sm font-medium text-gray-900">
                  {pendingDemo === p.email ? "Signing in…" : p.person}
                </span>
                <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  {p.label}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {demoError && (
          <p role="alert" className="mt-2 text-sm text-red-600">
            {demoError}
          </p>
        )}
      </section>

      <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-wide text-gray-400">
        <span className="h-px flex-1 bg-gray-200" />
        or sign in with email
        <span className="h-px flex-1 bg-gray-200" />
      </div>

      {/* Real Stytch passwordless flow (magic link). */}
      <section aria-labelledby="magic-heading">
        <h2 id="magic-heading" className="sr-only">
          Email magic link
        </h2>
        {status === "sent" ? (
          <p
            role="status"
            className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800"
          >
            Check <span className="font-medium">{email}</span> for a sign-in
            link. It expires in 60 minutes.
          </p>
        ) : (
          <form onSubmit={sendMagicLink} className="flex flex-col gap-2">
            <label htmlFor="email" className="sr-only">
              Email address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={status === "sending"}
              className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
            >
              {status === "sending" ? "Sending…" : "Send magic link"}
            </button>
            {status === "error" && (
              <p role="alert" className="text-sm text-red-600">
                {errorMsg}
              </p>
            )}
          </form>
        )}
      </section>

      <p className="mt-8 text-xs leading-relaxed text-gray-500">
        Authentication is real (Stytch passwordless). Roles are{" "}
        <span className="font-medium">assigned</span> to seeded users (RBAC), not
        self-selected — the one-click demo logins above are provided so you can
        explore each role without an email round-trip.
      </p>
    </main>
  );
}
