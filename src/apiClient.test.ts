import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./apiClient";

type FetchOverrides = { ok?: boolean; status?: number; statusText?: string };

function stubFetch(body: unknown, overrides: FetchOverrides = {}) {
    const response = {
        ok: overrides.ok ?? true,
        status: overrides.status ?? 200,
        statusText: overrides.statusText ?? "OK",
        json: async () => body,
    };
    const fetchMock = vi.fn().mockResolvedValue(response);
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("api", () => {
    it("sends Content-Type and X-Actor-Role headers and returns parsed JSON", async () => {
        const fetchMock = stubFetch({ data: [{ id: "1" }] });

        const result = await api<{ data: { id: string }[] }>("/parts");

        expect(result).toEqual({ data: [{ id: "1" }] });
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, options] = fetchMock.mock.calls[0];
        // BASE comes from VITE_API_BASE_URL (may be "" or "/api" depending on env).
        expect(url).toMatch(/\/parts$/);
        expect(options.headers["Content-Type"]).toBe("application/json");
        // No actor_role cookie in the test env → apiClient falls back to TECH_1.
        expect(options.headers["X-Actor-Role"]).toBe("TECH_1");
    });

    it("merges caller-provided method and headers", async () => {
        const fetchMock = stubFetch({});

        await api("/parts", { method: "POST", headers: { "X-Custom": "1" } });

        const [, options] = fetchMock.mock.calls[0];
        expect(options.method).toBe("POST");
        expect(options.headers["X-Custom"]).toBe("1");
        expect(options.headers["X-Actor-Role"]).toBe("TECH_1");
    });

    it("throws on a non-2xx response", async () => {
        stubFetch({}, { ok: false, status: 404, statusText: "Not Found" });

        await expect(api("/missing")).rejects.toThrow("404 Not Found");
    });
});
