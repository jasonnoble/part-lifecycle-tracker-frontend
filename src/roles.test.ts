import { afterEach, describe, expect, it } from "vitest";
import { ROLES, getRole, setRole } from "./roles";

function clearActorRole() {
  document.cookie = "actor_role=; path=/; max-age=0";
}

afterEach(clearActorRole);

describe("roles", () => {
  it("defaults to TECH_1 when no cookie is set", () => {
    clearActorRole();
    expect(getRole()).toBe("TECH_1");
  });

  it("round-trips a selected role through the cookie", () => {
    setRole("QA");
    expect(getRole()).toBe("QA");
    expect(document.cookie).toContain("actor_role=QA");
  });

  it("exposes the six demo roles with stable keys", () => {
    expect(ROLES).toHaveLength(6);
    expect(ROLES.map((r) => r.key)).toContain("SITE_MANAGER");
  });
});
