import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  jsonOk,
  jsonError,
  mockFetchByUrl,
  renderWithProviders,
  setRole,
} from "../test/utils";
import CustomerOrders from "./CustomerOrders";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const ORDERS = [
  {
    id: "CO-1001",
    customerName: "Springfield Taxi Co",
    status: "OPEN",
    lines: [
      { id: "L1", quantity: 2, partNumber: "BRK-100", partName: "Brake Pad" },
      { id: "L2", quantity: 1, partNumber: "FLT-200", partName: "Oil Filter" },
    ],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "CO-1002",
    customerName: "Shelbyville Fleet",
    status: "DELIVERED",
    lines: [
      { id: "L3", quantity: 5, partNumber: "TIR-300", partName: "Tire" },
    ],
    createdAt: "2026-01-02T00:00:00Z",
    updatedAt: "2026-01-02T00:00:00Z",
  },
  {
    id: "CO-1003",
    customerName: "Ogdenville Motors",
    status: "SHIPPED",
    lines: [],
    createdAt: "2026-01-03T00:00:00Z",
    updatedAt: "2026-01-03T00:00:00Z",
  },
  {
    id: "CO-1004",
    customerName: "Capital City Cabs",
    status: "CANCELLED",
    lines: [],
    createdAt: "2026-01-04T00:00:00Z",
    updatedAt: "2026-01-04T00:00:00Z",
  },
  {
    id: "CO-1005",
    customerName: "North Haverbrook Co",
    status: "WEIRD_STATUS",
    lines: [],
    createdAt: "2026-01-05T00:00:00Z",
    updatedAt: "2026-01-05T00:00:00Z",
  },
];

const PARTS = [
  { id: "P1", partNumber: "BRK-100", name: "Brake Pad", status: "RELEASED" },
  { id: "P2", partNumber: "FLT-200", name: "Oil Filter", status: "RELEASED" },
];

// Supplier POs linked to CO-1001:
//  - BRK-100 has an OPEN (outstanding) PO line  -> PENDING_PO
//  - FLT-200 has no matching PO line            -> IN_STOCK
const SUPPLIER_POS = [
  {
    id: "SPO-1",
    supplierId: "S1",
    status: "OPEN",
    customerOrderId: "CO-1001",
    lines: [
      {
        id: "SL1",
        quantity: 2,
        quantityReceived: 0,
        status: "OPEN",
        partNumber: "BRK-100",
        partName: "Brake Pad",
      },
    ],
  },
  // Unrelated PO (different customer order) — must be ignored by the derivation.
  {
    id: "SPO-2",
    supplierId: "S2",
    status: "OPEN",
    customerOrderId: "CO-9999",
    lines: [
      {
        id: "SL2",
        quantity: 1,
        quantityReceived: 0,
        status: "NEEDS_ORDERING",
        partNumber: "FLT-200",
        partName: "Oil Filter",
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Fetch mock — built on the shared `mockFetchByUrl` URL router. The per-test
// `handlers` map keeps the original ergonomics; unset routes use defaults.
// ---------------------------------------------------------------------------
type Handlers = {
  listOrders?: () => unknown;
  getOrder?: (id: string) => unknown;
  listParts?: () => unknown;
  listSupplierPos?: () => unknown;
  createOrder?: (payload: unknown) => unknown;
};

let lastCreatePayload: unknown = null;

function pathOf(url: string) {
  return url.replace(/^.*?(\/[^?]*).*$/, "$1");
}

function installFetch(handlers: Handlers = {}) {
  // Match on the path suffix so routes work whether or not VITE_API_BASE_URL
  // adds a prefix (e.g. "/api/customer-orders" vs "/customer-orders").
  return mockFetchByUrl([
    {
      match: (url, init) =>
        (init?.method ?? "GET").toUpperCase() === "POST" &&
        pathOf(url).endsWith("/customer-orders"),
      respond: (_url, init) => {
        lastCreatePayload = init?.body
          ? JSON.parse(init.body as string)
          : null;
        return (
          handlers.createOrder ??
          (() =>
            jsonOk({
              id: "CO-NEW",
              ...((lastCreatePayload as object) ?? {}),
            }))
        )(lastCreatePayload);
      },
    },
    {
      match: (url) => pathOf(url).endsWith("/customer-orders"),
      respond: () =>
        (handlers.listOrders ?? (() => jsonOk({ data: ORDERS })))(),
    },
    {
      match: (url) => /\/customer-orders\/[^/]+$/.test(pathOf(url)),
      respond: (url) => {
        const id = pathOf(url).split("/").pop() ?? "";
        return (
          handlers.getOrder ??
          ((oid: string) => jsonOk(ORDERS.find((o) => o.id === oid)))
        )(id);
      },
    },
    {
      match: (url) => pathOf(url).endsWith("/parts"),
      respond: () =>
        (handlers.listParts ?? (() => jsonOk({ data: PARTS })))(),
    },
    {
      match: (url) => pathOf(url).endsWith("/supplier-purchase-orders"),
      respond: () =>
        (handlers.listSupplierPos ??
          (() => jsonOk({ data: SUPPLIER_POS })))(),
    },
  ]);
}

function renderScreen() {
  return renderWithProviders(<CustomerOrders />);
}

beforeEach(() => {
  lastCreatePayload = null;
});

// ---------------------------------------------------------------------------
// Role gating
// ---------------------------------------------------------------------------
describe("CustomerOrders role gating", () => {
  it("renders content for SALESPERSON", async () => {
    setRole("SALESPERSON");
    installFetch();
    renderScreen();

    expect(
      screen.getByRole("heading", { name: "Customer Orders" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Springfield Taxi Co")).toBeInTheDocument();
  });

  it("renders content for SITE_MANAGER", async () => {
    setRole("SITE_MANAGER");
    installFetch();
    renderScreen();

    expect(await screen.findByText("Shelbyville Fleet")).toBeInTheDocument();
  });

  it("shows the access notice for a disallowed role (TECH_1) and does not fetch", () => {
    setRole("TECH_1");
    const fetchMock = installFetch();
    renderScreen();

    expect(
      screen.getByText(/not available for your role/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Customer Orders" }),
    ).not.toBeInTheDocument();
    // enabled:false on the list query means no network call.
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Order list
// ---------------------------------------------------------------------------
describe("CustomerOrders list", () => {
  it("shows loading then renders orders with status badges", async () => {
    setRole("SALESPERSON");
    installFetch();
    renderScreen();

    expect(screen.getByText("Loading orders…")).toBeInTheDocument();

    expect(await screen.findByText("CO-1001")).toBeInTheDocument();
    expect(screen.getByText("OPEN")).toBeInTheDocument();
    expect(screen.getByText("DELIVERED")).toBeInTheDocument();
    // Exercises the SHIPPED, CANCELLED, and default badge color branches.
    expect(screen.getByText("SHIPPED")).toBeInTheDocument();
    expect(screen.getByText("CANCELLED")).toBeInTheDocument();
    expect(screen.getByText("WEIRD_STATUS")).toBeInTheDocument();
  });

  it("renders an empty-state when there are no orders", async () => {
    setRole("SALESPERSON");
    installFetch({ listOrders: () => jsonOk({ data: [] }) });
    renderScreen();

    expect(
      await screen.findByText("No customer orders yet."),
    ).toBeInTheDocument();
  });

  it("shows an error message when the list request fails", async () => {
    setRole("SALESPERSON");
    installFetch({
      listOrders: () =>
        jsonError(500, "Server Error", { error: "boom" }),
    });
    renderScreen();

    expect(await screen.findByText(/Error: boom/)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Order detail + derived fulfillment
// ---------------------------------------------------------------------------
describe("CustomerOrders detail", () => {
  it("expands a selected order showing line items and derived fulfillment badges", async () => {
    setRole("SALESPERSON");
    const user = userEvent.setup();
    installFetch();
    renderScreen();

    const row = await screen.findByText("CO-1001");
    await user.click(row);

    // Line items appear.
    expect(await screen.findByText("Brake Pad")).toBeInTheDocument();
    expect(screen.getByText("Oil Filter")).toBeInTheDocument();

    // BRK-100 has an outstanding supplier PO -> Pending supplier PO.
    expect(
      await screen.findByText("Pending supplier PO"),
    ).toBeInTheDocument();
    // FLT-200 has no matching outstanding PO -> In stock.
    expect(screen.getByText("In stock")).toBeInTheDocument();
  });

  it("collapses an expanded order when clicked again", async () => {
    setRole("SALESPERSON");
    const user = userEvent.setup();
    installFetch();
    renderScreen();

    const row = await screen.findByText("CO-1001");
    await user.click(row);
    expect(await screen.findByText("Brake Pad")).toBeInTheDocument();

    await user.click(row);
    expect(screen.queryByText("Brake Pad")).not.toBeInTheDocument();
  });

  it("shows 'unknown' fulfillment when the supplier-PO lookup fails", async () => {
    setRole("SALESPERSON");
    const user = userEvent.setup();
    installFetch({
      listSupplierPos: () =>
        jsonError(503, "Unavailable", { error: "po service down" }),
    });
    renderScreen();

    await user.click(await screen.findByText("CO-1001"));
    expect(await screen.findByText("Brake Pad")).toBeInTheDocument();
    expect(screen.getAllByText("unknown").length).toBeGreaterThan(0);
  });

  it("shows an error in the detail panel when the order fetch fails", async () => {
    setRole("SALESPERSON");
    const user = userEvent.setup();
    installFetch({
      getOrder: () =>
        jsonError(404, "Not Found", { error: "order gone" }),
    });
    renderScreen();

    await user.click(await screen.findByText("CO-1001"));
    expect(await screen.findByText(/Error: order gone/)).toBeInTheDocument();
  });

  it("renders a no-line-items message for an order with no lines", async () => {
    setRole("SALESPERSON");
    const user = userEvent.setup();
    installFetch({
      getOrder: () =>
        jsonOk({
          id: "CO-1001",
          customerName: "Springfield Taxi Co",
          status: "OPEN",
          lines: [],
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-01T00:00:00Z",
        }),
    });
    renderScreen();

    await user.click(await screen.findByText("CO-1001"));
    expect(await screen.findByText("No line items.")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// New order form
// ---------------------------------------------------------------------------
describe("CustomerOrders new-order form", () => {
  it("toggles the form open and closed", async () => {
    setRole("SALESPERSON");
    const user = userEvent.setup();
    installFetch();
    renderScreen();
    await screen.findByText("CO-1001");

    await user.click(
      screen.getByRole("button", { name: "New Customer Order" }),
    );
    expect(
      screen.getByRole("heading", { name: "New Customer Order" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(
      screen.queryByRole("heading", { name: "New Customer Order" }),
    ).not.toBeInTheDocument();
  });

  it("disables submit until a customer name and at least one line are provided", async () => {
    setRole("SALESPERSON");
    const user = userEvent.setup();
    installFetch();
    renderScreen();
    await screen.findByText("CO-1001");

    await user.click(
      screen.getByRole("button", { name: "New Customer Order" }),
    );
    const submit = screen.getByRole("button", { name: "Create order" });
    expect(submit).toBeDisabled();

    // Part options load from GET /parts.
    await screen.findByRole("option", { name: "BRK-100 — Brake Pad" });
    await user.type(
      screen.getByPlaceholderText("e.g. Springfield Taxi Co"),
      "Acme Corp",
    );
    // Still disabled — no part selected yet.
    expect(submit).toBeDisabled();

    await user.selectOptions(
      screen.getByRole("combobox"),
      "BRK-100",
    );
    expect(submit).toBeEnabled();
  });

  it("submits the expected payload and refreshes the list", async () => {
    setRole("SALESPERSON");
    const user = userEvent.setup();
    const fetchMock = installFetch();
    renderScreen();
    await screen.findByText("CO-1001");

    await user.click(
      screen.getByRole("button", { name: "New Customer Order" }),
    );
    await screen.findByRole("option", { name: "BRK-100 — Brake Pad" });

    await user.type(
      screen.getByPlaceholderText("e.g. Springfield Taxi Co"),
      "Acme Corp",
    );
    await user.selectOptions(screen.getByRole("combobox"), "BRK-100");
    const qty = screen.getByRole("spinbutton");
    await user.clear(qty);
    await user.type(qty, "3");

    await user.click(screen.getByRole("button", { name: "Create order" }));

    // Form closes on success.
    await vi.waitFor(() =>
      expect(
        screen.queryByRole("heading", { name: "New Customer Order" }),
      ).not.toBeInTheDocument(),
    );

    expect(lastCreatePayload).toEqual({
      customerName: "Acme Corp",
      lines: [{ partNumber: "BRK-100", quantity: 3 }],
    });
    // A POST was issued.
    const postCall = fetchMock.mock.calls.find(
      ([, init]) => (init?.method ?? "GET").toUpperCase() === "POST",
    );
    expect(postCall).toBeTruthy();
  });

  it("supports adding and removing line items", async () => {
    setRole("SALESPERSON");
    const user = userEvent.setup();
    installFetch();
    renderScreen();
    await screen.findByText("CO-1001");

    await user.click(
      screen.getByRole("button", { name: "New Customer Order" }),
    );
    await screen.findByRole("option", { name: "BRK-100 — Brake Pad" });

    expect(screen.getAllByRole("combobox")).toHaveLength(1);
    await user.click(
      screen.getByRole("button", { name: "+ Add line item" }),
    );
    expect(screen.getAllByRole("combobox")).toHaveLength(2);

    // Remove buttons appear once there is more than one line.
    const removeButtons = screen.getAllByRole("button", { name: "Remove" });
    await user.click(removeButtons[0]);
    expect(screen.getAllByRole("combobox")).toHaveLength(1);
  });

  it("surfaces a 422 validation error from the backend", async () => {
    setRole("SALESPERSON");
    const user = userEvent.setup();
    installFetch({
      createOrder: () =>
        jsonError(422, "Unprocessable Entity", {
          error: "Customer name is required",
          code: "validation_error",
        }),
    });
    renderScreen();
    await screen.findByText("CO-1001");

    await user.click(
      screen.getByRole("button", { name: "New Customer Order" }),
    );
    await screen.findByRole("option", { name: "BRK-100 — Brake Pad" });

    await user.type(
      screen.getByPlaceholderText("e.g. Springfield Taxi Co"),
      "Acme Corp",
    );
    await user.selectOptions(screen.getByRole("combobox"), "BRK-100");
    await user.click(screen.getByRole("button", { name: "Create order" }));

    expect(
      await screen.findByText(
        /Could not create order: Customer name is required/,
      ),
    ).toBeInTheDocument();
    // Form stays open on error.
    expect(
      screen.getByRole("heading", { name: "New Customer Order" }),
    ).toBeInTheDocument();
  });

  it("shows a parts-load error inside the form", async () => {
    setRole("SALESPERSON");
    const user = userEvent.setup();
    installFetch({
      listParts: () =>
        jsonError(500, "Server Error", { error: "parts down" }),
    });
    renderScreen();
    await screen.findByText("CO-1001");

    await user.click(
      screen.getByRole("button", { name: "New Customer Order" }),
    );

    expect(
      await screen.findByText(/Could not load parts: parts down/),
    ).toBeInTheDocument();
  });

  it("does not submit when the customer name is only whitespace", async () => {
    setRole("SALESPERSON");
    const user = userEvent.setup();
    const fetchMock = installFetch();
    renderScreen();
    await screen.findByText("CO-1001");

    await user.click(
      screen.getByRole("button", { name: "New Customer Order" }),
    );
    await screen.findByRole("option", { name: "BRK-100 — Brake Pad" });
    await user.selectOptions(screen.getByRole("combobox"), "BRK-100");

    // Whitespace-only name: canSubmit stays false, submit disabled.
    await user.type(
      screen.getByPlaceholderText("e.g. Springfield Taxi Co"),
      "   ",
    );
    expect(
      screen.getByRole("button", { name: "Create order" }),
    ).toBeDisabled();

    const postCall = fetchMock.mock.calls.find(
      ([, init]) => (init?.method ?? "GET").toUpperCase() === "POST",
    );
    expect(postCall).toBeUndefined();
  });
});

describe("CustomerOrders fulfillment derivation edge cases", () => {
  it("marks a line as In stock when its supplier PO line is RECEIVED", async () => {
    setRole("SALESPERSON");
    const user = userEvent.setup();
    installFetch({
      getOrder: () =>
        jsonOk({
          id: "CO-1001",
          customerName: "Springfield Taxi Co",
          status: "OPEN",
          lines: [
            {
              id: "L1",
              quantity: 2,
              partNumber: "BRK-100",
              partName: "Brake Pad",
            },
          ],
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-01T00:00:00Z",
        }),
      listSupplierPos: () =>
        jsonOk({
          data: [
            {
              id: "SPO-1",
              supplierId: "S1",
              status: "RECEIVED",
              customerOrderId: "CO-1001",
              lines: [
                {
                  id: "SL1",
                  quantity: 2,
                  quantityReceived: 2,
                  status: "RECEIVED",
                  partNumber: "BRK-100",
                  partName: "Brake Pad",
                },
              ],
            },
          ],
        }),
    });
    renderScreen();

    await user.click(await screen.findByText("CO-1001"));
    const detail = await screen.findByText("Brake Pad");
    expect(detail).toBeInTheDocument();
    expect(await screen.findByText("In stock")).toBeInTheDocument();
    expect(screen.queryByText("Pending supplier PO")).not.toBeInTheDocument();
  });
});
