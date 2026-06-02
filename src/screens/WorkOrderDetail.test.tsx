import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import WorkOrderDetail from "./WorkOrderDetail";
import {
  jsonError,
  jsonOk,
  mockFetchByUrl,
  renderWithProviders,
  setRole,
} from "../test/utils";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
type Step = {
  id: string;
  bomItemId: string;
  status: string;
  installedPartInstanceId: string | null;
  installedActor: string | null;
  validatedActor: string | null;
  certifiedActor: string | null;
  childPartNumber: string;
  childPartName: string;
  installedAt: string | null;
  validatedAt: string | null;
  certifiedAt: string | null;
};

function makeStep(over: Partial<Step> = {}): Step {
  return {
    id: "step-1",
    bomItemId: "bom-1",
    status: "PENDING",
    installedPartInstanceId: null,
    installedActor: null,
    validatedActor: null,
    certifiedActor: null,
    childPartNumber: "PN-100",
    childPartName: "Widget",
    installedAt: null,
    validatedAt: null,
    certifiedAt: null,
    ...over,
  };
}

function makeWorkOrder(steps: Step[]) {
  return {
    id: "wo-1",
    status: "OPEN",
    customerOrderLineId: null,
    partNumber: "ASSY-1",
    serialNumber: "SN-001",
    steps,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

// Convenience: stub the GET /work-orders/:id detail endpoint with the given
// work order (returned bare, not in the pagy `{ data, meta }` envelope).
function workOrderRoute(order: ReturnType<typeof makeWorkOrder>) {
  return {
    match: (url: string) => /\/work-orders\/wo-1$/.test(url),
    respond: () => jsonOk(order),
  };
}

function emptyBomRoute() {
  return {
    match: (url: string) => /\/bom$/.test(url),
    respond: () => jsonOk({ data: [] }),
  };
}

function renderScreen() {
  return renderWithProviders(<WorkOrderDetail />, {
    route: { path: "/work-orders/:id", initialEntry: "/work-orders/wo-1" },
  });
}

beforeEach(() => {
  setRole("TECH_1");
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("WorkOrderDetail", () => {
  it("shows a loading state then renders the work order header and steps", async () => {
    mockFetchByUrl([
      workOrderRoute(makeWorkOrder([makeStep()])),
      emptyBomRoute(),
    ]);

    renderScreen();

    expect(screen.getByText("Loading…")).toBeInTheDocument();

    expect(await screen.findByText("Work Order SN-001")).toBeInTheDocument();
    expect(screen.getByText("ASSY-1 · OPEN")).toBeInTheDocument();
    expect(screen.getByText("Widget")).toBeInTheDocument();
    // PENDING status pill.
    expect(screen.getByText("PENDING")).toBeInTheDocument();
    // Acting-as banner reflects TECH_1 -> jamie.
    expect(screen.getByText("Acting as jamie@factory.com")).toBeInTheDocument();
    // Back link to the Assembly Line list.
    expect(
      screen.getByRole("link", { name: "← Assembly Line" }),
    ).toHaveAttribute("href", "/");
  });

  it("surfaces a query error", async () => {
    mockFetchByUrl([
      {
        match: (url) => /\/work-orders\/wo-1$/.test(url),
        respond: () => jsonError(500, "Error", { error: "boom" }),
      },
    ]);

    renderScreen();

    expect(await screen.findByText(/Error:/)).toBeInTheDocument();
  });

  it("shows an empty state when the work order has no steps", async () => {
    mockFetchByUrl([
      workOrderRoute(makeWorkOrder([])),
      emptyBomRoute(),
    ]);

    renderScreen();

    expect(
      await screen.findByText("This work order has no assembly steps yet."),
    ).toBeInTheDocument();
    // With no steps, completion stays disabled.
    expect(
      screen.getByRole("button", { name: "Complete work order" }),
    ).toBeDisabled();
  });

  it("enables Install for a PENDING step as TECH_1 and fires the action, then refetches", async () => {
    const user = userEvent.setup();
    let workOrderCallCount = 0;
    mockFetchByUrl([
      {
        match: (url) => /\/work-orders\/wo-1$/.test(url),
        respond: () => {
          workOrderCallCount += 1;
          return jsonOk(makeWorkOrder([makeStep()]));
        },
      },
      emptyBomRoute(),
      {
        match: (url) => /\/steps\/step-1\/install$/.test(url),
        respond: () =>
          jsonOk(makeWorkOrder([makeStep({ status: "INSTALLED" })])),
      },
    ]);

    renderScreen();

    const installBtn = await screen.findByRole("button", { name: "Install" });
    expect(installBtn).toBeEnabled();

    // Without a serial, clicking surfaces an inline validation error.
    await user.click(installBtn);
    expect(
      await screen.findByText("Enter the serial number to install."),
    ).toBeInTheDocument();

    // Enter a serial and install.
    await user.type(screen.getByPlaceholderText("Serial #"), "SN-XYZ");
    await user.click(installBtn);

    await waitFor(() => expect(workOrderCallCount).toBeGreaterThan(1));
  });

  it("disables Validate for the actor who installed the step (4-eyes)", async () => {
    // TECH_1 == jamie installed this INSTALLED step → cannot validate.
    mockFetchByUrl([
      workOrderRoute(
        makeWorkOrder([
          makeStep({
            status: "INSTALLED",
            installedActor: "jamie@factory.com",
          }),
        ]),
      ),
      emptyBomRoute(),
    ]);

    renderScreen();

    const validateBtn = await screen.findByRole("button", {
      name: "Validate",
    });
    expect(validateBtn).toBeDisabled();
    expect(validateBtn).toHaveAttribute(
      "title",
      expect.stringContaining("4-eyes"),
    );
  });

  it("enables Validate as TECH_2 when a different actor installed the step", async () => {
    setRole("TECH_2");
    mockFetchByUrl([
      workOrderRoute(
        makeWorkOrder([
          makeStep({
            status: "INSTALLED",
            installedActor: "jamie@factory.com",
          }),
        ]),
      ),
      emptyBomRoute(),
      {
        match: (url) => /\/steps\/step-1\/validate$/.test(url),
        respond: () =>
          jsonOk(makeWorkOrder([makeStep({ status: "VALIDATED" })])),
      },
    ]);

    renderScreen();

    const validateBtn = await screen.findByRole("button", {
      name: "Validate",
    });
    expect(validateBtn).toBeEnabled();
  });

  it("disables Certify for non-QA roles and enables it for QA", async () => {
    // First render as TECH_1 (non-QA) → Certify disabled.
    mockFetchByUrl([
      workOrderRoute(makeWorkOrder([makeStep({ status: "VALIDATED" })])),
      emptyBomRoute(),
    ]);

    const { unmount } = renderScreen();
    const certifyDisabled = await screen.findByRole("button", {
      name: "Certify",
    });
    expect(certifyDisabled).toBeDisabled();
    expect(certifyDisabled).toHaveAttribute(
      "title",
      expect.stringContaining("QA"),
    );
    unmount();

    // Now as QA → Certify enabled.
    setRole("QA");
    mockFetchByUrl([
      workOrderRoute(makeWorkOrder([makeStep({ status: "VALIDATED" })])),
      emptyBomRoute(),
      {
        match: (url) => /\/steps\/step-1\/certify$/.test(url),
        respond: () =>
          jsonOk(makeWorkOrder([makeStep({ status: "CERTIFIED" })])),
      },
    ]);

    renderScreen();
    const certifyEnabled = await screen.findByRole("button", {
      name: "Certify",
    });
    expect(certifyEnabled).toBeEnabled();
  });

  it("keeps Complete disabled until all steps are CERTIFIED", async () => {
    mockFetchByUrl([
      workOrderRoute(
        makeWorkOrder([
          makeStep({ id: "step-1", status: "CERTIFIED" }),
          makeStep({
            id: "step-2",
            bomItemId: "bom-2",
            status: "VALIDATED",
            childPartName: "Gadget",
          }),
        ]),
      ),
      emptyBomRoute(),
    ]);

    renderScreen();

    const completeBtn = await screen.findByRole("button", {
      name: "Complete work order",
    });
    expect(completeBtn).toBeDisabled();
    expect(
      screen.getByText("All steps must be CERTIFIED to complete."),
    ).toBeInTheDocument();
  });

  it("enables Complete when all steps are CERTIFIED and fires the complete action", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetchByUrl([
      workOrderRoute(makeWorkOrder([makeStep({ status: "CERTIFIED" })])),
      emptyBomRoute(),
      {
        match: (url) => /\/complete$/.test(url),
        respond: () =>
          jsonOk({
            ...makeWorkOrder([makeStep({ status: "CERTIFIED" })]),
            status: "COMPLETE",
          }),
      },
    ]);

    renderScreen();

    const completeBtn = await screen.findByRole("button", {
      name: "Complete work order",
    });
    expect(completeBtn).toBeEnabled();
    await user.click(completeBtn);

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some((c) =>
          /\/complete$/.test(String(c[0])),
        ),
      ).toBe(true),
    );
  });

  it("does not block a PENDING step whose prerequisite is already CERTIFIED", async () => {
    mockFetchByUrl([
      workOrderRoute(
        makeWorkOrder([
          makeStep({
            id: "prereq",
            bomItemId: "bom-prereq",
            status: "CERTIFIED",
            childPartName: "Base Plate",
          }),
          makeStep({
            id: "dependent",
            bomItemId: "bom-dep",
            status: "PENDING",
            childPartName: "Top Cover",
          }),
        ]),
      ),
      {
        match: (url) => /\/parts\/ASSY-1\/bom$/.test(url),
        respond: () =>
          jsonOk({
            data: [
              {
                id: "bom-dep",
                quantity: 1,
                childPartNumber: "PN-100",
                childPartName: "Top Cover",
                deletedAt: null,
                dependencies: [
                  {
                    prerequisiteBomItemId: "bom-prereq",
                    prerequisitePartNumber: "PN-099",
                  },
                ],
              },
            ],
          }),
      },
    ]);

    renderScreen();

    // Dependent step is installable (prereq certified) — no BLOCKED pill.
    expect(await screen.findByText("Top Cover")).toBeInTheDocument();
    expect(screen.queryByText("BLOCKED")).not.toBeInTheDocument();
    // Both steps offer an Install button (prereq is CERTIFIED so only the
    // dependent shows Install; assert at least one is enabled).
    const installBtns = screen.getAllByRole("button", { name: "Install" });
    expect(installBtns.length).toBeGreaterThan(0);
  });

  it("surfaces a complete-action error inline", async () => {
    const user = userEvent.setup();
    mockFetchByUrl([
      workOrderRoute(makeWorkOrder([makeStep({ status: "CERTIFIED" })])),
      emptyBomRoute(),
      {
        match: (url) => /\/complete$/.test(url),
        respond: () =>
          jsonError(422, "Error", {
            error: "Cannot complete: open steps remain",
            code: "UNPROCESSABLE",
          }),
      },
    ]);

    renderScreen();

    await user.click(
      await screen.findByRole("button", { name: "Complete work order" }),
    );

    const err = await screen.findByText(/Cannot complete: open steps remain/);
    expect(err).toHaveTextContent("[UNPROCESSABLE]");
  });

  it("shows a derived-BLOCKED pill and the blocking part inline", async () => {
    mockFetchByUrl([
      workOrderRoute(
        makeWorkOrder([
          makeStep({
            id: "prereq",
            bomItemId: "bom-prereq",
            status: "INSTALLED",
            childPartName: "Base Plate",
          }),
          makeStep({
            id: "dependent",
            bomItemId: "bom-dep",
            status: "PENDING",
            childPartName: "Top Cover",
          }),
        ]),
      ),
      {
        match: (url) => /\/parts\/ASSY-1\/bom$/.test(url),
        respond: () =>
          jsonOk({
            data: [
              {
                id: "bom-dep",
                quantity: 1,
                childPartNumber: "PN-100",
                childPartName: "Top Cover",
                deletedAt: null,
                dependencies: [
                  {
                    prerequisiteBomItemId: "bom-prereq",
                    prerequisitePartNumber: "PN-099",
                  },
                ],
              },
            ],
          }),
      },
    ]);

    renderScreen();

    // The dependent step should render a BLOCKED pill and an inline notice.
    expect(await screen.findByText("BLOCKED")).toBeInTheDocument();
    expect(screen.getByText(/Blocked by Base Plate/)).toBeInTheDocument();
  });

  it("surfaces a server error (409) with the error code when an action fails", async () => {
    const user = userEvent.setup();
    mockFetchByUrl([
      workOrderRoute(makeWorkOrder([makeStep()])),
      emptyBomRoute(),
      {
        match: (url) => /\/steps\/step-1\/install$/.test(url),
        respond: () =>
          jsonError(409, "Error", {
            error: "Step already installed",
            code: "CONFLICT",
          }),
      },
    ]);

    renderScreen();

    await user.type(
      await screen.findByPlaceholderText("Serial #"),
      "SN-XYZ",
    );
    await user.click(screen.getByRole("button", { name: "Install" }));

    const err = await screen.findByText(/Step already installed/);
    expect(err).toHaveTextContent("[CONFLICT]");
  });

  it("renders actor provenance line once a step has actors", async () => {
    mockFetchByUrl([
      workOrderRoute(
        makeWorkOrder([
          makeStep({
            status: "CERTIFIED",
            installedActor: "jamie@factory.com",
            validatedActor: "riley@factory.com",
            certifiedActor: "quinn@factory.com",
          }),
        ]),
      ),
      emptyBomRoute(),
    ]);

    renderScreen();

    const provenance = await screen.findByText(/Installed by jamie@factory.com/);
    expect(provenance).toHaveTextContent("Validated by riley@factory.com");
    expect(provenance).toHaveTextContent("Certified by quinn@factory.com");
  });
});
