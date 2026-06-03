// Roles are *assigned* server-side (users.role, JAS-77/79) and arrive on the
// frontend via GET /me — never chosen or sent by the client.
export const BACKEND_ROLES = [
  "salesperson",
  "floor_manager",
  "installer",
  "qa_engineer",
  "site_manager",
] as const;

export type Role = (typeof BACKEND_ROLES)[number];

/** Human-readable label for an assigned role (or a read-only session). */
const ROLE_LABELS: Record<Role, string> = {
  salesperson: "Salesperson",
  floor_manager: "Floor Manager",
  installer: "Installer",
  qa_engineer: "QA Engineer",
  site_manager: "Site Manager",
};

export function roleLabel(role: string | null): string {
  return (ROLE_LABELS as Record<string, string>)[role ?? ""] ?? "Read-only";
}

// The six seeded demo personas (backend JAS-77). `email` is the login identity
// each persona is seeded with — the one-click demo logins POST it to
// /demo-sessions (JAS-80). `label` is persona flavor for the login screen
// (Jamie and Riley share the `installer` role; four-eyes is enforced per
// *identity*, not per role).
export const PERSONAS = [
  { person: "Sarah Chen",   label: "Salesperson",        email: "sarah.chen@example.com" },
  { person: "Marcus Webb",  label: "Floor Manager",      email: "marcus.webb@example.com" },
  { person: "Jamie Torres", label: "Tech 1 / Installer", email: "jamie.torres@example.com" },
  { person: "Riley Park",   label: "Tech 2 / Validator", email: "riley.park@example.com" },
  { person: "Dr. Quinn",    label: "QA Engineer",        email: "dr.quinn@example.com" },
  { person: "Alex Reyes",   label: "Site Manager",       email: "alex.reyes@example.com" },
] as const;

/** Roles permitted to view/manage customer (sales) orders. UI-only gate — the
 *  backend has no sales-specific endpoint restriction. */
const SALES_ROLES: readonly string[] = ["salesperson", "site_manager"];

/** Whether the assigned role may access the Sales / Customer Orders screen. */
export function canViewSales(role: string | null): boolean {
  return role !== null && SALES_ROLES.includes(role);
}

/** Labels of the roles that unlock Sales, e.g. "Salesperson or Site Manager". */
export const SALES_ROLE_LABELS = SALES_ROLES
  .map((r) => roleLabel(r))
  .join(" or ");
