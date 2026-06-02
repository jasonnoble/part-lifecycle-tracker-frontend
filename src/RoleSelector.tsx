import { useState } from "react";
import { ROLES, getRole, setRole, type RoleKey } from "./roles";

export default function RoleSelector() {
  const [role, setLocal] = useState<RoleKey>(getRole);
  return (
    <div className="flex items-center gap-2">
      <label
        htmlFor="role-selector"
        className="text-xs font-medium uppercase tracking-wide text-gray-500"
      >
        Acting as
      </label>
      <select
        id="role-selector"
        name="role-selector"
        value={role}
        onChange={(e) => {
          const next = e.target.value as RoleKey;
          setRole(next);   // persist to cookie
          setLocal(next);  // re-render
        }}
        className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        {ROLES.map((r) => (
          <option key={r.key} value={r.key}>{r.person} — {r.label}</option>
        ))}
      </select>
    </div>
  );
}
