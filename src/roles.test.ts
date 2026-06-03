import { describe, expect, it } from "vitest";
import {
  PERSONAS,
  SALES_ROLE_LABELS,
  canViewSales,
  roleLabel,
} from "./roles";

describe("roles", () => {
  it("exposes the six seeded demo personas with their login emails", () => {
    expect(PERSONAS).toHaveLength(6);
    expect(PERSONAS.map((p) => p.email)).toContain("dr.quinn@example.com");
    // Jamie and Riley are distinct identities even though both are installers
    // on the backend (four-eyes is per identity, not per role).
    expect(PERSONAS.map((p) => p.person)).toEqual(
      expect.arrayContaining(["Jamie Torres", "Riley Park"]),
    );
  });

  it("labels assigned roles for display, and read-only sessions", () => {
    expect(roleLabel("qa_engineer")).toBe("QA Engineer");
    expect(roleLabel("floor_manager")).toBe("Floor Manager");
    expect(roleLabel(null)).toBe("Read-only");
    expect(roleLabel("something_new")).toBe("Read-only");
  });

  it("gates Sales to salesperson and site_manager", () => {
    expect(canViewSales("salesperson")).toBe(true);
    expect(canViewSales("site_manager")).toBe(true);
    expect(canViewSales("installer")).toBe(false);
    expect(canViewSales("qa_engineer")).toBe(false);
    expect(canViewSales(null)).toBe(false);
  });

  it("names the Sales-permitted roles for the restricted-tab tooltip", () => {
    expect(SALES_ROLE_LABELS).toBe("Salesperson or Site Manager");
  });
});
