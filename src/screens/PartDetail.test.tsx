import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import {
    jsonOk,
    jsonError,
    mockFetchByUrl,
    renderWithProviders,
} from "../test/utils";
import PartDetail from "./PartDetail";

// --- Fixtures ------------------------------------------------------------

const PART = {
    id: "p1",
    partNumber: "THE-HOMER-001",
    name: "The Homer",
    description: "Every car a man has ever dreamed of.",
    revision: "C",
    status: "DRAFT" as const,
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-02-01T00:00:00Z",
};

const BOM = {
    data: [
        {
            id: "b1",
            quantity: 4,
            childPartNumber: "WHEEL-001",
            childPartName: "Whitewall Wheel",
            deletedAt: null,
            dependencies: [],
        },
        {
            id: "b2",
            quantity: 1,
            childPartNumber: "HORN-OLD",
            childPartName: "Three Horns",
            // Soft-deleted line — should render struck-through with the date.
            deletedAt: "2024-03-15T00:00:00Z",
            dependencies: [],
        },
    ],
};

const CONTEXT = {
    partNumber: "THE-HOMER-001",
    name: "The Homer",
    revision: "C",
    status: "DRAFT" as const,
    summary: "summary text",
    inventory: {
        total: 5,
        byStatus: { IN_STOCK: 3, SCRAPPED: 2 },
    },
    openPurchaseOrders: 0,
    bom: [],
    recentEvents: [],
    generatedAt: "2024-04-01T00:00:00Z",
};

// --- Fetch routing -------------------------------------------------------

type Stub = ReturnType<typeof jsonOk>;
// Sentinel marking a route whose fetch should never resolve (keeps that
// query pending). Routed below into a non-settling promise.
const PENDING = Symbol("pending");
type Route = Stub | typeof PENDING;

type RouteOverrides = {
    part?: Route;
    bom?: Route;
    context?: Route;
    status?: Route;
};

const isPost = (init?: RequestInit) => (init?.method ?? "GET") === "POST";

/**
 * Installs a URL-routed fetch stub across the four endpoints this screen
 * touches, via the shared `mockFetchByUrl` helper. Returns the mock for call
 * assertions. A `PENDING` route never settles, keeping its query pending.
 */
function installFetchRouter(overrides: RouteOverrides = {}) {
    const respond = (route: Route | undefined, fallback: Stub) => {
        const chosen = route ?? fallback;
        return chosen === PENDING ? new Promise<Stub>(() => {}) : chosen;
    };

    return mockFetchByUrl([
        {
            match: (url, init) => isPost(init) && url.endsWith("/status"),
            respond: () => respond(overrides.status, jsonOk(PART)),
        },
        {
            match: (url) => url.endsWith("/bom"),
            respond: () => respond(overrides.bom, jsonOk(BOM)),
        },
        {
            match: (url) => url.endsWith("/context"),
            respond: () => respond(overrides.context, jsonOk(CONTEXT)),
        },
        // GET /parts/:partNumber
        { match: () => true, respond: () => respond(overrides.part, jsonOk(PART)) },
    ]);
}

function renderScreen() {
    return renderWithProviders(<PartDetail />, {
        route: { path: "/parts/:partNumber", initialEntry: "/parts/THE-HOMER-001" },
    });
}

beforeEach(() => {
    installFetchRouter();
});

describe("PartDetail", () => {
    it("shows a loading state before the part resolves", () => {
        // Every route stays pending, so the part query never resolves.
        installFetchRouter({
            part: PENDING,
            bom: PENDING,
            context: PENDING,
            status: PENDING,
        });

        renderScreen();

        expect(screen.getByText("Loading…")).toBeInTheDocument();
    });

    it("surfaces an error when the part query fails", async () => {
        installFetchRouter({
            part: jsonError(404, "Not Found", {
                error: "No such part",
                code: "NOT_FOUND",
            }),
        });

        renderScreen();

        expect(await screen.findByText("Error: No such part")).toBeInTheDocument();
    });

    it("renders the header (partNumber, name, revision, status)", async () => {
        renderScreen();

        const heading = await screen.findByRole("heading", { level: 1 });
        expect(heading).toHaveTextContent("THE-HOMER-001 — The Homer");
        expect(screen.getByText(/Revision C/)).toBeInTheDocument();
        // Status appears in the header line as a StatusBadge pill (a <span>).
        expect(
            screen.getByText("DRAFT", { selector: "span" }),
        ).toBeInTheDocument();
        expect(
            screen.getByText("Every car a man has ever dreamed of."),
        ).toBeInTheDocument();
    });

    it("renders the BOM table with a soft-deleted row struck through and dated", async () => {
        renderScreen();

        const liveCell = await screen.findByText("WHEEL-001");
        const liveRow = liveCell.closest("tr");
        expect(liveRow).not.toBeNull();
        expect(liveRow).not.toHaveClass("line-through");
        // Active line shows an em-dash in the Deleted column.
        expect(within(liveRow as HTMLElement).getByText("—")).toBeInTheDocument();

        const deletedCell = screen.getByText("HORN-OLD");
        const deletedRow = deletedCell.closest("tr");
        expect(deletedRow).not.toBeNull();
        expect(deletedRow).toHaveClass("line-through");
        // The deleted date is formatted and shown.
        const formatted = new Date("2024-03-15T00:00:00Z").toLocaleDateString();
        expect(
            within(deletedRow as HTMLElement).getByText(formatted),
        ).toBeInTheDocument();
    });

    it("shows instance counts from context.inventory.byStatus", async () => {
        renderScreen();

        await screen.findByRole("heading", { level: 1 });
        const list = await screen.findByRole("list");
        expect(within(list).getByText("IN_STOCK")).toBeInTheDocument();
        expect(within(list).getByText(/3/)).toBeInTheDocument();
        expect(within(list).getByText("SCRAPPED")).toBeInTheDocument();
        expect(within(list).getByText(/2/)).toBeInTheDocument();
    });

    it("renders an empty BOM and empty instances message", async () => {
        installFetchRouter({
            bom: jsonOk({ data: [] }),
            context: jsonOk({ ...CONTEXT, inventory: { total: 0, byStatus: {} } }),
        });

        renderScreen();

        await screen.findByRole("heading", { level: 1 });
        expect(await screen.findByText("No BOM lines.")).toBeInTheDocument();
        expect(screen.getByText("No instances.")).toBeInTheDocument();
    });

    it("falls back to an em-dash when the revision is null", async () => {
        installFetchRouter({ part: jsonOk({ ...PART, revision: null }) });

        renderScreen();

        await screen.findByRole("heading", { level: 1 });
        expect(screen.getByText(/Revision —/)).toBeInTheDocument();
    });

    it("shows loading placeholders for the BOM and instances sections", async () => {
        // Part resolves; bom and context stay pending.
        installFetchRouter({ bom: PENDING, context: PENDING });

        renderScreen();

        await screen.findByRole("heading", { level: 1 });
        // The two section-level "Loading…" placeholders (instances + BOM).
        await waitFor(() => {
            expect(screen.getAllByText("Loading…")).toHaveLength(2);
        });
    });

    it("surfaces errors in the BOM and instances sections", async () => {
        installFetchRouter({
            bom: jsonError(500, "Server Error", { error: "bom boom" }),
            context: jsonError(500, "Server Error", { error: "context boom" }),
        });

        renderScreen();

        await screen.findByRole("heading", { level: 1 });
        expect(await screen.findByText("Error: bom boom")).toBeInTheDocument();
        expect(screen.getByText("Error: context boom")).toBeInTheDocument();
    });

    it("disables status buttons for invalid transitions", async () => {
        renderScreen();

        await screen.findByRole("heading", { level: 1 });
        // From DRAFT: RELEASED and OBSOLETE are valid; DRAFT itself is filtered out.
        const released = screen.getByRole("button", { name: "→ RELEASED" });
        const obsolete = screen.getByRole("button", { name: "→ OBSOLETE" });
        expect(released).toBeEnabled();
        expect(obsolete).toBeEnabled();
    });

    it("disables the invalid target when the part is RELEASED", async () => {
        installFetchRouter({ part: jsonOk({ ...PART, status: "RELEASED" }) });

        renderScreen();

        await screen.findByRole("heading", { level: 1 });
        // From RELEASED: only OBSOLETE is valid; DRAFT is invalid → disabled.
        expect(screen.getByRole("button", { name: "→ DRAFT" })).toBeDisabled();
        expect(screen.getByRole("button", { name: "→ OBSOLETE" })).toBeEnabled();
    });

    it("fires a valid status transition POST", async () => {
        const user = userEvent.setup();
        const fetchMock = installFetchRouter({
            status: jsonOk({ ...PART, status: "RELEASED" }),
        });

        renderScreen();

        await screen.findByRole("heading", { level: 1 });
        await user.click(screen.getByRole("button", { name: "→ RELEASED" }));

        await waitFor(() => {
            const statusPost = fetchMock.mock.calls.find(
                ([url, init]) =>
                    String(url).endsWith("/status") &&
                    (init as RequestInit | undefined)?.method === "POST",
            );
            expect(statusPost).toBeDefined();
            expect((statusPost?.[1] as RequestInit).body).toBe(
                JSON.stringify({ status: "RELEASED" }),
            );
        });
    });

    it("surfaces a 422 INVALID_TRANSITION error from the transition", async () => {
        const user = userEvent.setup();
        installFetchRouter({
            status: jsonError(422, "Unprocessable Entity", {
                error: "Cannot release a draft yet",
                code: "INVALID_TRANSITION",
            }),
        });

        renderScreen();

        await screen.findByRole("heading", { level: 1 });
        await user.click(screen.getByRole("button", { name: "→ RELEASED" }));

        expect(
            await screen.findByText(
                "Invalid transition: Cannot release a draft yet",
            ),
        ).toBeInTheDocument();
    });

    it("shows a non-INVALID_TRANSITION error message verbatim", async () => {
        const user = userEvent.setup();
        installFetchRouter({
            status: jsonError(403, "Forbidden", {
                error: "You may not change this part",
                code: "FORBIDDEN",
            }),
        });

        renderScreen();

        await screen.findByRole("heading", { level: 1 });
        await user.click(screen.getByRole("button", { name: "→ RELEASED" }));

        // No "Invalid transition:" prefix for non-INVALID_TRANSITION codes.
        expect(
            await screen.findByText("You may not change this part"),
        ).toBeInTheDocument();
    });

    it("wraps a non-ApiError transition failure", async () => {
        const user = userEvent.setup();
        // Route POST /status to a plain network rejection; others resolve.
        mockFetchByUrl([
            {
                match: (url, init) => isPost(init) && url.endsWith("/status"),
                respond: () => Promise.reject(new Error("network down")),
            },
            { match: (url) => url.endsWith("/bom"), respond: () => jsonOk(BOM) },
            {
                match: (url) => url.endsWith("/context"),
                respond: () => jsonOk(CONTEXT),
            },
            { match: () => true, respond: () => jsonOk(PART) },
        ]);

        renderScreen();

        await screen.findByRole("heading", { level: 1 });
        await user.click(screen.getByRole("button", { name: "→ RELEASED" }));

        expect(await screen.findByText("network down")).toBeInTheDocument();
    });

    it("opens the /context modal and shows the payload", async () => {
        const user = userEvent.setup();
        renderScreen();

        await screen.findByRole("heading", { level: 1 });
        await user.click(screen.getByRole("button", { name: "View /context" }));

        const dialog = await screen.findByRole("dialog");
        expect(
            within(dialog).getByText("Raw /context response"),
        ).toBeInTheDocument();
        // The serialized payload is rendered in the modal.
        await waitFor(() => {
            expect(dialog.textContent).toContain("IN_STOCK");
            expect(dialog.textContent).toContain("openPurchaseOrders");
        });

        // Closing via the Close button removes the dialog.
        await user.click(within(dialog).getByRole("button", { name: "Close" }));
        await waitFor(() => {
            expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        });
    });

    it("shows a loading state inside the /context modal while context is pending", async () => {
        const user = userEvent.setup();
        installFetchRouter({ context: PENDING });

        renderScreen();

        await screen.findByRole("heading", { level: 1 });
        await user.click(screen.getByRole("button", { name: "View /context" }));

        const dialog = await screen.findByRole("dialog");
        expect(within(dialog).getByText("Loading…")).toBeInTheDocument();
    });

    it("shows an error inside the /context modal when context fails", async () => {
        const user = userEvent.setup();
        installFetchRouter({
            context: jsonError(500, "Server Error", { error: "context exploded" }),
        });

        renderScreen();

        await screen.findByRole("heading", { level: 1 });
        await user.click(screen.getByRole("button", { name: "View /context" }));

        const dialog = await screen.findByRole("dialog");
        expect(
            await within(dialog).findByText("Error: context exploded"),
        ).toBeInTheDocument();
    });

    it("closes the /context modal when the backdrop is clicked", async () => {
        const user = userEvent.setup();
        renderScreen();

        await screen.findByRole("heading", { level: 1 });
        await user.click(screen.getByRole("button", { name: "View /context" }));

        const dialog = await screen.findByRole("dialog");
        // Clicking the backdrop (the dialog element itself) closes it.
        await user.click(dialog);
        await waitFor(() => {
            expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        });
    });
});
