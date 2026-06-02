import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { RouterProvider, createMemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import InstanceDetail from "./InstanceDetail";

type JsonResponse = {
    ok?: boolean;
    status?: number;
    statusText?: string;
    body: unknown;
};

const SERIAL = "HMR-0001";

const instanceBody = {
    id: "inst-1",
    serialNumber: SERIAL,
    currentStatus: "IN_SERVICE",
    partNumber: "THE-HOMER-001",
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-05T00:00:00Z",
};

// Intentionally out of chronological order to prove the component sorts ASC.
const eventsBody = {
    data: [
        {
            id: "evt-late",
            eventType: "SHIPPED",
            actor: "logistics@acme.test",
            notes: "Left the warehouse.",
            metadata: null,
            occurredAt: "2024-03-10T12:00:00Z",
            recordedAt: "2024-03-10T12:05:00Z",
        },
        {
            id: "evt-early",
            eventType: "CREATED",
            actor: "tech@acme.test",
            notes: null,
            metadata: null,
            occurredAt: "2024-01-02T09:00:00Z",
            recordedAt: "2024-01-02T09:01:00Z",
        },
    ],
    meta: { total: 2 },
};

const testsBody = {
    data: [
        {
            id: "test-pass",
            testType: "BURN_IN",
            result: "PASS",
            notes: "Nominal.",
            conductedBy: "qa@acme.test",
            occurredAt: "2024-02-01T10:00:00Z",
            recordedAt: "2024-02-01T10:30:00Z",
        },
        {
            id: "test-fail",
            testType: "STRESS",
            result: "FAIL",
            notes: null,
            conductedBy: "qa2@acme.test",
            occurredAt: "2024-02-02T10:00:00Z",
            recordedAt: "2024-02-02T10:30:00Z",
        },
        {
            id: "test-incon",
            testType: "VIBRATION",
            result: "INCONCLUSIVE",
            notes: "Sensor glitch.",
            conductedBy: "qa3@acme.test",
            occurredAt: "2024-02-03T10:00:00Z",
            recordedAt: "2024-02-03T10:30:00Z",
        },
    ],
    meta: { total: 3 },
};

function jsonResponse({ ok = true, status = 200, statusText = "OK", body }: JsonResponse) {
    return {
        ok,
        status,
        statusText,
        json: async () => body,
    };
}

/**
 * URL-routing fetch mock for the three read-only endpoints. Per-endpoint
 * overrides let individual tests force loading/error/empty states.
 */
function stubRouterFetch(
    overrides: {
        instance?: JsonResponse;
        events?: JsonResponse;
        tests?: JsonResponse;
    } = {},
) {
    const fetchMock = vi.fn((input: string | URL) => {
        const url = String(input);
        if (url.endsWith(`/instances/${SERIAL}/events`)) {
            return Promise.resolve(
                jsonResponse(overrides.events ?? { body: eventsBody }),
            );
        }
        if (url.endsWith(`/instances/${SERIAL}/tests`)) {
            return Promise.resolve(
                jsonResponse(overrides.tests ?? { body: testsBody }),
            );
        }
        if (url.endsWith(`/instances/${SERIAL}`)) {
            return Promise.resolve(
                jsonResponse(overrides.instance ?? { body: instanceBody }),
            );
        }
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
}

function renderScreen() {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    const router = createMemoryRouter(
        [{ path: "/instances/:serial", element: <InstanceDetail /> }],
        { initialEntries: [`/instances/${SERIAL}`] },
    );
    return render(
        <QueryClientProvider client={client}>
            <RouterProvider router={router} />
        </QueryClientProvider>,
    );
}

beforeEach(() => {
    stubRouterFetch();
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("InstanceDetail", () => {
    it("shows a loading state before the instance resolves", () => {
        renderScreen();
        expect(screen.getByText("Loading…")).toBeInTheDocument();
    });

    it("renders the header with serial number, current status and part number", async () => {
        renderScreen();

        expect(
            await screen.findByRole("heading", { level: 1, name: SERIAL }),
        ).toBeInTheDocument();
        expect(screen.getByText("IN_SERVICE")).toBeInTheDocument();
        expect(screen.getByText("THE-HOMER-001")).toBeInTheDocument();
    });

    it("renders lifecycle events in occurredAt ascending order with actor, type, notes and both timestamps", async () => {
        renderScreen();

        const items = await screen.findAllByRole("listitem");
        // The first three list items are events (events render as <ol><li>),
        // followed by the test records list. Grab the events list explicitly.
        const eventsList = screen.getByRole("list", { name: /lifecycle events/i });
        const eventItems = within(eventsList).getAllByRole("listitem");

        expect(eventItems).toHaveLength(2);
        // Ascending by occurredAt: CREATED (Jan) before SHIPPED (Mar).
        expect(eventItems[0]).toHaveTextContent("CREATED");
        expect(eventItems[0]).toHaveTextContent("tech@acme.test");
        expect(eventItems[1]).toHaveTextContent("SHIPPED");
        expect(eventItems[1]).toHaveTextContent("logistics@acme.test");
        expect(eventItems[1]).toHaveTextContent("Left the warehouse.");

        // Both timestamp labels present for an event.
        expect(within(eventItems[1]).getByText("Occurred:")).toBeInTheDocument();
        expect(within(eventItems[1]).getByText("Recorded:")).toBeInTheDocument();

        // Sanity: there are more list items overall (tests render too).
        expect(items.length).toBeGreaterThan(eventItems.length);
    });

    it("omits the notes paragraph when an event has null notes", async () => {
        renderScreen();

        const eventsList = await screen.findByRole("list", {
            name: /lifecycle events/i,
        });
        const eventItems = within(eventsList).getAllByRole("listitem");
        const createdEvent = eventItems[0];

        // CREATED event has notes: null → no extra notes paragraph.
        expect(createdEvent).toHaveTextContent("CREATED");
        expect(createdEvent).not.toHaveTextContent("Left the warehouse.");
    });

    it("renders test records with color-coded PASS/FAIL/INCONCLUSIVE badges", async () => {
        renderScreen();

        const testsList = await screen.findByRole("list", {
            name: /test records/i,
        });
        const testItems = within(testsList).getAllByRole("listitem");
        expect(testItems).toHaveLength(3);

        const pass = within(testsList).getByText("PASS");
        const fail = within(testsList).getByText("FAIL");
        const inconclusive = within(testsList).getByText("INCONCLUSIVE");

        expect(pass.className).toContain("green");
        expect(fail.className).toContain("red");
        expect(inconclusive.className).toContain("gray");

        // Test detail fields render.
        expect(within(testsList).getByText("BURN_IN")).toBeInTheDocument();
        expect(
            within(testsList).getByText("Conducted by qa@acme.test"),
        ).toBeInTheDocument();
        expect(within(testsList).getByText("Nominal.")).toBeInTheDocument();
    });

    it("shows an empty-state message when there are no events", async () => {
        stubRouterFetch({ events: { body: { data: [], meta: { total: 0 } } } });
        renderScreen();

        expect(
            await screen.findByText("No events recorded."),
        ).toBeInTheDocument();
    });

    it("shows an empty-state message when there are no test records", async () => {
        stubRouterFetch({ tests: { body: { data: [], meta: { total: 0 } } } });
        renderScreen();

        expect(await screen.findByText("No test records.")).toBeInTheDocument();
    });

    it("shows per-section loading states while events and tests are pending", async () => {
        // Instance resolves immediately; events/tests never resolve so the
        // section-level loading branches render.
        const fetchMock = vi.fn((input: string | URL) => {
            const url = String(input);
            if (url.endsWith(`/instances/${SERIAL}`)) {
                return Promise.resolve(jsonResponse({ body: instanceBody }));
            }
            // events + tests: pending forever.
            return new Promise(() => {});
        });
        vi.stubGlobal("fetch", fetchMock);

        renderScreen();

        // Header rendered from resolved instance query.
        await screen.findByRole("heading", { level: 1, name: SERIAL });
        expect(screen.getByText("Loading events…")).toBeInTheDocument();
        expect(screen.getByText("Loading tests…")).toBeInTheDocument();
    });

    it("renders the top-level error state when the instance request fails", async () => {
        stubRouterFetch({
            instance: { ok: false, status: 500, statusText: "Server Error", body: {} },
        });
        renderScreen();

        expect(
            await screen.findByText(/Error: 500 Server Error/),
        ).toBeInTheDocument();
    });

    it("renders a section error when the events request fails", async () => {
        stubRouterFetch({
            events: { ok: false, status: 502, statusText: "Bad Gateway", body: {} },
        });
        renderScreen();

        // Header still renders from the successful instance query.
        await screen.findByRole("heading", { level: 1, name: SERIAL });
        expect(
            await screen.findByText(/Error: 502 Bad Gateway/),
        ).toBeInTheDocument();
    });

    it("renders a section error when the tests request fails", async () => {
        stubRouterFetch({
            tests: { ok: false, status: 503, statusText: "Unavailable", body: {} },
        });
        renderScreen();

        await screen.findByRole("heading", { level: 1, name: SERIAL });
        expect(
            await screen.findByText(/Error: 503 Unavailable/),
        ).toBeInTheDocument();
    });
});
