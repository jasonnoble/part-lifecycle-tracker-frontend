import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import WorkOrdersList from "./WorkOrdersList";
import {
  jsonError,
  jsonOk,
  mockFetchByUrl,
  renderWithProviders,
} from "../test/utils";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
type Step = { id: string; status: string };

function makeWorkOrder(over: {
  id: string;
  serialNumber: string;
  partNumber?: string;
  status?: string;
  steps?: Step[];
  updatedAt?: string;
}) {
  return {
    id: over.id,
    status: over.status ?? "OPEN",
    customerOrderLineId: null,
    partNumber: over.partNumber ?? "THE-HOMER-001",
    serialNumber: over.serialNumber,
    steps: (over.steps ?? []).map((s, i) => ({
      id: s.id,
      bomItemId: `bom-${i}`,
      status: s.status,
      installedPartInstanceId: null,
      installedActor: null,
      validatedActor: null,
      certifiedActor: null,
      childPartNumber: `PN-${i}`,
      childPartName: `Part ${i}`,
      installedAt: null,
      validatedAt: null,
      certifiedAt: null,
    })),
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: over.updatedAt ?? "2026-01-01T00:00:00Z",
  };
}

function workOrdersRoute(orders: ReturnType<typeof makeWorkOrder>[]) {
  return {
    match: (url: string) => /\/work-orders$/.test(url),
    respond: () => jsonOk({ data: orders, meta: {} }),
  };
}

function renderScreen() {
  return renderWithProviders(<WorkOrdersList />, {
    route: { path: "/", initialEntry: "/" },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("WorkOrdersList", () => {
  it("shows a loading state then lists work orders with serial, part, and status", async () => {
    mockFetchByUrl([
      workOrdersRoute([
        makeWorkOrder({
          id: "wo-1",
          serialNumber: "HMR-0006",
          steps: [{ id: "s1", status: "VALIDATED" }],
        }),
      ]),
    ]);

    renderScreen();

    expect(screen.getByText("Loading…")).toBeInTheDocument();

    expect(await screen.findByText("HMR-0006")).toBeInTheDocument();
    expect(screen.getByText("THE-HOMER-001")).toBeInTheDocument();
    expect(screen.getByText("1 work order")).toBeInTheDocument();
    // WO status pill + a step-summary pill.
    expect(screen.getByText("OPEN")).toBeInTheDocument();
    expect(screen.getByText("1 VALIDATED")).toBeInTheDocument();
  });

  it("surfaces a query error", async () => {
    mockFetchByUrl([
      {
        match: (url) => /\/work-orders$/.test(url),
        respond: () => jsonError(500, "Error", { error: "boom" }),
      },
    ]);

    renderScreen();

    expect(await screen.findByText(/Error:/)).toBeInTheDocument();
  });

  it("shows an empty state when there are no work orders", async () => {
    mockFetchByUrl([workOrdersRoute([])]);

    renderScreen();

    expect(
      await screen.findByText("No work orders found."),
    ).toBeInTheDocument();
  });

  it("renders 'No steps' for an empty work order", async () => {
    mockFetchByUrl([
      workOrdersRoute([
        makeWorkOrder({ id: "wo-empty", serialNumber: "HOMER-CO0001-005" }),
      ]),
    ]);

    renderScreen();

    expect(await screen.findByText("No steps")).toBeInTheDocument();
  });

  it("surfaces step-bearing work orders above empty shells regardless of updatedAt", async () => {
    mockFetchByUrl([
      workOrdersRoute([
        // Newer, but empty — should sink below the step-bearing one.
        makeWorkOrder({
          id: "wo-empty",
          serialNumber: "EMPTY-NEW",
          updatedAt: "2026-05-01T00:00:00Z",
        }),
        // Older, but has steps — should float to the top.
        makeWorkOrder({
          id: "wo-steps",
          serialNumber: "HAS-STEPS",
          updatedAt: "2026-01-01T00:00:00Z",
          steps: [{ id: "s1", status: "PENDING" }],
        }),
      ]),
    ]);

    renderScreen();

    await screen.findByText("HAS-STEPS");
    const rows = screen.getAllByRole("link");
    // First data row is the step-bearing order.
    expect(within(rows[0]).getByText("HAS-STEPS")).toBeInTheDocument();
    expect(within(rows[1]).getByText("EMPTY-NEW")).toBeInTheDocument();
  });

  it("navigates to the work-order detail route when a row is clicked", async () => {
    const user = userEvent.setup();
    mockFetchByUrl([
      workOrdersRoute([
        makeWorkOrder({
          id: "wo-42",
          serialNumber: "HMR-0006",
          steps: [{ id: "s1", status: "PENDING" }],
        }),
      ]),
    ]);

    renderScreen();

    const row = await screen.findByRole("link", {
      name: "Open work order HMR-0006",
    });
    await user.click(row);

    // The memory router has no /work-orders/:id route registered, so a
    // successful navigation renders React Router's "No routes matched" — the
    // row's own content disappears, confirming we left the list.
    expect(
      screen.queryByText("THE-HOMER-001"),
    ).not.toBeInTheDocument();
  });
});
