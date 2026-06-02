import { describe, expect, it } from "vitest";
import { ApiError, api, apiList } from "./apiClient";
import { jsonError, jsonOk, mockFetch } from "./test/utils";

describe("api", () => {
    it("sends Content-Type and X-Actor-Role headers and returns parsed JSON", async () => {
        const fetchMock = mockFetch({ data: [{ id: "1" }] });

        const result = await api<{ data: { id: string }[] }>("/parts");

        expect(result).toEqual({ data: [{ id: "1" }] });
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, options] = fetchMock.mock.calls[0];
        const headers = (options?.headers ?? {}) as Record<string, string>;
        // BASE comes from VITE_API_BASE_URL (may be "" or "/api" depending on env).
        expect(String(url)).toMatch(/\/parts$/);
        expect(headers["Content-Type"]).toBe("application/json");
        // No actor_role cookie in the test env → apiClient falls back to TECH_1.
        expect(headers["X-Actor-Role"]).toBe("TECH_1");
    });

    it("merges caller-provided method and headers", async () => {
        const fetchMock = mockFetch({});

        await api("/parts", { method: "POST", headers: { "X-Custom": "1" } });

        const [, options] = fetchMock.mock.calls[0];
        const headers = (options?.headers ?? {}) as Record<string, string>;
        expect(options?.method).toBe("POST");
        expect(headers["X-Custom"]).toBe("1");
        expect(headers["X-Actor-Role"]).toBe("TECH_1");
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
