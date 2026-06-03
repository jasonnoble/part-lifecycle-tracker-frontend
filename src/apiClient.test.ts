import { describe, expect, it, vi } from "vitest";
import { ApiError, api, apiList } from "./apiClient";
import { getAuthUser, setAuthUser } from "./auth/session";
import { demoUser, jsonError, jsonOk, mockFetch } from "./test/utils";

describe("api", () => {
  it("sends Content-Type (and nothing actor-ish) when logged out, returning parsed JSON", async () => {
    const fetchMock = mockFetch({ data: [{ id: "1" }] });

    const result = await api<{ data: { id: string }[] }>("/parts");

    expect(result).toEqual({ data: [{ id: "1" }] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    const headers = (options?.headers ?? {}) as Record<string, string>;
    // BASE comes from VITE_API_BASE_URL (may be "" or "/api" depending on env).
    expect(String(url)).toMatch(/\/parts$/);
    expect(headers["Content-Type"]).toBe("application/json");
    // X-Actor-Role is gone (JAS-79) and there's no session → no Authorization.
    expect(headers["X-Actor-Role"]).toBeUndefined();
    expect(headers.Authorization).toBeUndefined();
  });

  it("sends the session JWT as a Bearer token when logged in", async () => {
    setAuthUser(demoUser("installer", { sessionJwt: "jwt-abc" }));
    const fetchMock = mockFetch({});

    await api("/parts");

    const [, options] = fetchMock.mock.calls[0];
    const headers = (options?.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer jwt-abc");
  });

  it("merges caller-provided method and headers (caller wins on conflicts)", async () => {
    setAuthUser(demoUser("installer", { sessionJwt: "jwt-abc" }));
    const fetchMock = mockFetch({});

    await api("/parts", {
      method: "POST",
      headers: { "X-Custom": "1", Authorization: "Bearer fresh" },
    });

    const [, options] = fetchMock.mock.calls[0];
    const headers = (options?.headers ?? {}) as Record<string, string>;
    expect(options?.method).toBe("POST");
    expect(headers["X-Custom"]).toBe("1");
    // e.g. /me during login passes the just-minted JWT explicitly.
    expect(headers.Authorization).toBe("Bearer fresh");
  });

  it("throws an ApiError carrying the backend message, code, and status", async () => {
    mockFetch(() =>
      Promise.resolve(
        jsonError(422, "Unprocessable", {
          error: "Part number has already been taken",
          code: "VALIDATION_FAILED",
        }),
      ),
    );

    const err = (await api("/parts", { method: "POST" }).catch((e) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).toBe("Part number has already been taken");
    expect(err.code).toBe("VALIDATION_FAILED");
    expect(err.status).toBe(422);
  });

  it("drops the session and redirects to /login when a held session gets a 401", async () => {
    setAuthUser(demoUser("installer", { sessionJwt: "jwt-expired" }));
    mockFetch(() =>
      Promise.resolve(
        jsonError(401, "Unauthorized", {
          error: "Authentication required",
          code: "UNAUTHENTICATED",
        }),
      ),
    );
    // jsdom can't navigate; stub the redirect to observe it.
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });

    const err = (await api("/work-orders").catch((e) => e)) as ApiError;

    expect(err.status).toBe(401);
    // The dead session is gone and the user is sent back to the login screen.
    expect(getAuthUser()).toBeNull();
    expect(assign).toHaveBeenCalledWith("/login");
  });

  it("does not redirect on 401 when no session is held (e.g. a failed login)", async () => {
    mockFetch(() =>
      Promise.resolve(jsonError(401, "Unauthorized", { error: "nope" })),
    );
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });

    const err = (await api("/me").catch((e) => e)) as ApiError;

    expect(err.status).toBe(401);
    expect(assign).not.toHaveBeenCalled();
  });

  it("falls back to the status line when the error body is not JSON", async () => {
    mockFetch(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        statusText: "Server Error",
        json: async () => {
          throw new Error("not json");
        },
      }),
    );

    const err = (await api("/boom").catch((e) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.message).toBe("500 Server Error");
    expect(err.code).toBeUndefined();
  });
});

describe("apiList", () => {
  it("unwraps the pagy { data, meta } envelope to the data array", async () => {
    mockFetch(() =>
      Promise.resolve(
        jsonOk({
          data: [{ id: "a" }, { id: "b" }],
          meta: { currentPage: 1, totalPages: 1, totalCount: 2 },
        }),
      ),
    );

    const items = await apiList<{ id: string }>("/parts");
    expect(items).toEqual([{ id: "a" }, { id: "b" }]);
  });
});
