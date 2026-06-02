import { useState } from "react";
import { ROLES, getRole, setRole, type RoleKey } from "./roles";

export default function RoleSelector() {
  const [role, setLocal] = useState<RoleKey>(getRole);
  return (
    <select
      value={role}
      onChange={(e) => {
        const next = e.target.value as RoleKey;
        setRole(next);   // persist to cookie
        setLocal(next);  // re-render
      }}
    >
      {ROLES.map((r) => (
        <option key={r.key} value={r.key}>{r.person} — {r.label}</option>
      ))}
    </select>
  );
}