import { afterEach, describe, expect, it } from "vitest";
import {
  clearAuthUser,
  getAuthUser,
  sessionJwt,
  setAuthUser,
  type AuthUser,
} from "./session";

const QUINN: AuthUser = {
  email: "dr.quinn@example.com",
  name: "Dr. Quinn",
  role: "qa_engineer",
  permissions: ["step.certify"],
  via: "demo",
  sessionJwt: "jwt-123",
};

afterEach(() => {
  document.cookie = "pl_session=; path=/; max-age=0";
});

describe("session", () => {
  it("returns null when no session is stored", () => {
    expect(getAuthUser()).toBeNull();
    expect(sessionJwt()).toBeUndefined();
  });

  it("round-trips the authenticated identity", () => {
    setAuthUser(QUINN);
    expect(getAuthUser()).toEqual(QUINN);
    expect(sessionJwt()).toBe("jwt-123");
  });

  it("supports read-only sessions (authenticated but unseeded)", () => {
    setAuthUser({
      email: null,
      name: null,
      role: null,
      permissions: [],
      via: "magic_link",
      sessionJwt: "jwt-anon",
    });

    const user = getAuthUser();
    expect(user?.role).toBeNull();
    expect(user?.permissions).toEqual([]);
    expect(sessionJwt()).toBe("jwt-anon");
  });

  it("clears the session on logout", () => {
    setAuthUser(QUINN);
    clearAuthUser();
    expect(getAuthUser()).toBeNull();
  });

  it("treats malformed or JWT-less stored sessions as logged out", () => {
    document.cookie = `pl_session=${encodeURIComponent("not json")}; path=/`;
    expect(getAuthUser()).toBeNull();

    // No sessionJwt → every API call would 401; treat as logged out.
    document.cookie = `pl_session=${encodeURIComponent(
      JSON.stringify({ email: "x@y.com", role: "installer" }),
    )}; path=/`;
    expect(getAuthUser()).toBeNull();
  });
});
