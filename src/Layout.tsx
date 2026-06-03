import { useState } from "react";
import { NavLink, Outlet } from "react-router";
import { SALES_ROLE_LABELS, canViewSales, roleLabel } from "./roles.ts";
import { useAuth } from "./auth/AuthProvider.tsx";

// Small lock glyph shown on a restricted (disabled) nav tab.
function LockIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
      className="h-3.5 w-3.5"
    >
      <path
        fillRule="evenodd"
        d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z"
        clipRule="evenodd"
      />
    </svg>
  );
}

// The Sales tab for a role that can't use it: visible but disabled, with a
// tooltip explaining which roles unlock it. The tooltip is wired via
// `aria-describedby` and revealed on hover AND keyboard focus, so it's
// reachable without a mouse. It stays in the DOM (only its opacity toggles) so
// screen readers always announce the description when the tab is focused.
function RestrictedSalesTab() {
  const [open, setOpen] = useState(false);
  const tipId = "sales-restricted-tip";
  const message = `Requires the ${SALES_ROLE_LABELS} role`;

  return (
    <span className="relative">
      <span
        aria-disabled="true"
        aria-describedby={tipId}
        tabIndex={0}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
        className="flex cursor-not-allowed items-center gap-1 border-b-2 border-transparent pb-0.5 text-sm font-medium text-gray-300"
      >
        Sales
        <LockIcon />
      </span>
      <span
        role="tooltip"
        id={tipId}
        className={[
          "pointer-events-none absolute left-0 top-full z-10 mt-1.5 w-max max-w-xs rounded-md bg-gray-900 px-2 py-1 text-xs font-medium text-white shadow-lg transition-opacity",
          open ? "opacity-100" : "opacity-0",
        ].join(" ")}
      >
        {message}
      </span>
    </span>
  );
}

// Nav link styling. The active route gets a stronger color + an underline rule
// so there's a clear "you are here" indicator (NavLink toggles `isActive`).
function navLinkClass({ isActive }: { isActive: boolean }) {
  return [
    "border-b-2 pb-0.5 text-sm font-medium transition-colors",
    isActive
      ? "border-blue-600 text-blue-700"
      : "border-transparent text-gray-600 hover:text-gray-900",
  ].join(" ");
}

export default function Layout() {
  // Identity drives the shell now: the role is assigned (from the authenticated
  // user), not self-selected. RequireAuth guarantees `user` is set here.
  const { user, logout } = useAuth();
  const showSales = user ? canViewSales(user.role) : false;

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-gray-200 bg-white px-6 py-3">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-2">
          <div className="flex items-center gap-2.5">
            <img
              src="/part-lifecycle-tracker-logo.svg"
              alt=""
              className="h-15 w-15"
            />
            <span className="whitespace-nowrap text-base font-semibold tracking-tight text-gray-900">
              Part Lifecycle Tracker
            </span>
          </div>
          <nav className="flex items-center gap-6">
            {/* `end` keeps the index link from matching every nested route. */}
            <NavLink to="/" end className={navLinkClass}>
              Assembly Line
            </NavLink>
            <NavLink to="/parts" className={navLinkClass}>
              Parts
            </NavLink>
            {showSales ? (
              <NavLink to="/sales" className={navLinkClass}>
                Sales
              </NavLink>
            ) : (
              <RestrictedSalesTab />
            )}
          </nav>
        </div>
        {user && (
          <div className="flex items-center gap-3">
            {/* Read-only identity — derived from the authenticated user, no
                longer a role picker. Unseeded identities have no name/role:
                they browse read-only. */}
            <span className="text-sm text-gray-600">
              Acting as{" "}
              <span className="font-medium text-gray-900">
                {user.name ?? user.email ?? "Guest"}
              </span>{" "}
              <span className="text-gray-400">({roleLabel(user.role)})</span>
            </span>
            <button
              type="button"
              onClick={logout}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              Log out
            </button>
          </div>
        )}
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">
        <Outlet />          {/* the matched child route renders here */}
      </main>
    </>
  );
}
