import { useState } from "react";
import { NavLink, Outlet } from "react-router";
import RoleSelector from "./RoleSelector.tsx";
import { canViewSales, getRole, type RoleKey } from "./roles.ts";

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
  // Track the active role here so switching it re-renders the shell (and its
  // outlet) — e.g. the Sales tab appears/disappears for the new role.
  const [role, setRole] = useState<RoleKey>(getRole);
  const showSales = canViewSales(role);

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
            {showSales && (
              <NavLink to="/sales" className={navLinkClass}>
                Sales
              </NavLink>
            )}
          </nav>
        </div>
        <RoleSelector onChange={setRole} />
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">
        <Outlet />          {/* the matched child route renders here */}
      </main>
    </>
  );
}
