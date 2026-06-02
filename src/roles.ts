export const ROLES = [
  { key: "SALESPERSON",   person: "Sarah Chen",   label: "Salesperson" },
  { key: "FLOOR_MANAGER", person: "Marcus Webb",  label: "Floor Manager" },
  { key: "TECH_1",        person: "Jamie Torres", label: "Tech 1 / Installer" },
  { key: "TECH_2",        person: "Riley Park",   label: "Tech 2 / Validator" },
  { key: "QA",            person: "Dr. Quinn",    label: "QA Engineer" },
  { key: "SITE_MANAGER",  person: "Alex Reyes",   label: "Site Manager" },
] as const;

export type RoleKey = (typeof ROLES)[number]["key"];

/** Roles permitted to view/manage customer (sales) orders. */
export const SALES_ROLES: readonly RoleKey[] = ["SALESPERSON", "SITE_MANAGER"];

/** Whether `role` may access the Sales / Customer Orders screen. */
export function canViewSales(role: RoleKey): boolean {
  return SALES_ROLES.includes(role);
}

export function getRole(): RoleKey {
  const m = document.cookie.match(/(?:^|;\s*)actor_role=([^;]+)/);
  return (m?.[1] as RoleKey) ?? "TECH_1";
}

export function setRole(role: RoleKey) {
  // root path so every route sees it; SameSite=Lax is fine for same-site UX state
  document.cookie = `actor_role=${role}; path=/; max-age=31536000; SameSite=Lax`;
}