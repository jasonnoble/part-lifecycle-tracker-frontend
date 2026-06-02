import type { ReactElement, ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { RouterProvider, createMemoryRouter } from "react-router";
import { vi } from "vitest";

/** Fresh QueryClient with retries off so error states surface immediately in tests. */
function makeClient() {
    return new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
}

type RouteOption = { path: string; initialEntry: string };

/**
 * Render `ui` inside a QueryClientProvider. Pass `route` to also wrap it in a
 * memory router — needed for screens that use `useParams` / `useNavigate`.
 */
export function renderWithProviders(
    ui: ReactElement,
    opts: { route?: RouteOption } = {},
) {
    const client = makeClient();
    const tree: ReactNode = opts.route
        ? (
            <RouterProvider
                router={createMemoryRouter(
                    [{ path: opts.route.path, element: ui }],
                    { initialEntries: [opts.route.initialEntry] },
                )}
            />
        )
        : ui;
    return render(<QueryClientProvider client={client}>{tree}</QueryClientProvider>);
}

type ResponseInit = { ok?: boolean; status?: number; statusText?: string };

/** Minimal `fetch` Response stub carrying a JSON body (with a working `clone()`). */
export function jsonResponse(body: unknown, init: ResponseInit = {}) {
    const make = () => ({
        ok: init.ok ?? true,
        status: init.status ?? 200,
        statusText: init.statusText ?? "OK",
        json: async () => body,
        clone: () => make(),
    });
    return make();
}

export function jsonOk(body: unknown) {
    return jsonResponse(body);
}

export function jsonError(status: number, statusText: string, body: unknown = {}) {
    return jsonResponse(body, { ok: false, status, statusText });
}

type FetchImpl = (input: unknown, init?: RequestInit) => unknown;

/** Stub global `fetch` with a single JSON body, or a custom implementation. */
export function mockFetch(bodyOrImpl: unknown) {
    const impl: FetchImpl =
        typeof bodyOrImpl === "function"
            ? (bodyOrImpl as FetchImpl)
            : () => Promise.resolve(jsonOk(bodyOrImpl));
    const fetchMock = vi.fn(impl);
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
}

type UrlRoute = {
    match: (url: string, init?: RequestInit) => boolean;
    respond: (url: string, init?: RequestInit) => unknown;
};

/** Stub `fetch` with a URL router — the first matching route wins. */
export function mockFetchByUrl(routes: UrlRoute[]) {
    const fetchMock = vi.fn((input: unknown, init?: RequestInit) => {
        const url = String(input);
        for (const route of routes) {
            if (route.match(url, init)) return Promise.resolve(route.respond(url, init));
        }
        return Promise.reject(new Error(`Unhandled fetch: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
}

/** Set the actor-role cookie the apiClient reads (cleared globally after each test). */
export function setRole(role: string) {
    document.cookie = `actor_role=${role}; path=/`;
}

export function clearRole() {
    document.cookie = "actor_role=; path=/; max-age=0";
}
