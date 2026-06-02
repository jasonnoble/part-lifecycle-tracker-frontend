import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import InstanceDetail from "./InstanceDetail";
import {
  jsonOk,
  jsonError,
  mockFetchByUrl,
  renderWithProviders,
} from "../test/utils";

type Override = {
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

/** Map a per-endpoint override to a shared `jsonOk`/`jsonError` response. */
function toResponse(override: Override) {
  return override.ok === false
    ? jsonError(
       override.status ?? 500,
       override.statusText ?? "Error",
       override.body,
     )
    : jsonOk(override.body);
}

/**
 * URL-routing fetch mock for the three read-only endpoints. Per-endpoint
 * overrides let individual tests force loading/error/empty states.
 */
function stubRouterFetch(
  overrides: {
    instance?: Override;
    events?: Override;
    tests?: Override;
  } = {},
) {
  return mockFetchByUrl([
    {
      match: (url) => url.endsWith(`/instances/${SERIAL}/events`),
      respond: () => toResponse(overrides.events ?? { body: eventsBody }),
    },
    {
      match: (url) => url.endsWith(`/instances/${SERIAL}/tests`),
      respond: () => toResponse(overrides.tests ?? { body: testsBody }),
    },
    {
      match: (url) => url.endsWith(`/instances/${SERIAL}`),
      respond: () =>
        toResponse(overrides.instance ?? { body: instanceBody }),
    },
  ]);
}

function renderScreen() {
  return renderWithProviders(<InstanceDetail />, {
    route: {
      path: "/instances/:serial",
      initialEntry: `/instances/${SERIAL}`,
    },
  });
}

beforeEach(() => {
  stubRouterFetch();
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
    mockFetchByUrl([
      {
        match: (url) => url.endsWith(`/instances/${SERIAL}`),
        respond: () => jsonOk(instanceBody),
      },
      // events + tests: pending forever.
      {
        match: () => true,
        respond: () => new Promise(() => {}),
      },
    ]);

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

// ---------------------------------------------------------------------------
// Recording lifecycle events + test results (JAS-70)
// ---------------------------------------------------------------------------
describe("InstanceDetail — recording", () => {
  const method = (init?: RequestInit) => init?.method ?? "GET";

  // Router that distinguishes POST writes from the GET reads (the read-only
  // stubRouterFetch matches by URL only, so a POST would hit the GET route).
  function installWriteRouter(
    over: { onEventPost?: () => unknown; onTestPost?: () => unknown } = {},
  ) {
    return mockFetchByUrl([
      {
        match: (url, init) =>
          method(init) === "POST" &&
          url.endsWith(`/instances/${SERIAL}/events`),
        respond: over.onEventPost ?? (() => jsonOk(eventsBody.data[0])),
      },
      {
        match: (url, init) =>
          method(init) === "POST" &&
          url.endsWith(`/instances/${SERIAL}/tests`),
        respond: over.onTestPost ?? (() => jsonOk(testsBody.data[0])),
      },
      {
        match: (url) => url.endsWith(`/instances/${SERIAL}/events`),
        respond: () => jsonOk(eventsBody),
      },
      {
        match: (url) => url.endsWith(`/instances/${SERIAL}/tests`),
        respond: () => jsonOk(testsBody),
      },
      {
        match: (url) => url.endsWith(`/instances/${SERIAL}`),
        respond: () => jsonOk(instanceBody),
      },
    ]);
  }

  it("records a lifecycle event: posts eventType, actor, notes, occurredAt", async () => {
    const user = userEvent.setup();
    const fetchMock = installWriteRouter();
    renderScreen();

    await user.click(await screen.findByRole("button", { name: "Record event" }));

    // Form prefills the actor from the active role (TECH_1 → jamie).
    const form = screen.getByRole("form", { name: "Record lifecycle event" });
    await user.selectOptions(
      within(form).getByLabelText("Event type"),
      "INSPECTED",
    );
    await user.type(within(form).getByLabelText("Notes (optional)"), "Looks good");
    await user.click(within(form).getByRole("button", { name: "Record event" }));

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(
        ([url, init]) =>
          /\/instances\/HMR-0001\/events$/.test(String(url)) &&
          (init as RequestInit | undefined)?.method === "POST",
      );
      expect(post).toBeDefined();
      const body = JSON.parse((post?.[1] as RequestInit).body as string);
      expect(body.eventType).toBe("INSPECTED");
      expect(body.actor).toBe("jamie@factory.com");
      expect(body.notes).toBe("Looks good");
      // occurredAt is sent as an ISO timestamp.
      expect(body.occurredAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    // Form closes on success (the toggle button returns).
    await waitFor(() =>
      expect(
        screen.queryByRole("form", { name: "Record lifecycle event" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("records a test result: posts testType, result, conductedBy, notes", async () => {
    const user = userEvent.setup();
    const fetchMock = installWriteRouter();
    renderScreen();

    await user.click(
      await screen.findByRole("button", { name: "Add test result" }),
    );

    const form = screen.getByRole("form", { name: "Add test result" });
    await user.type(within(form).getByLabelText("Test type"), "Pressure test");
    await user.selectOptions(within(form).getByLabelText("Result"), "FAIL");
    await user.click(
      within(form).getByRole("button", { name: "Add test result" }),
    );

    await waitFor(() => {
      const post = fetchMock.mock.calls.find(
        ([url, init]) =>
          /\/instances\/HMR-0001\/tests$/.test(String(url)) &&
          (init as RequestInit | undefined)?.method === "POST",
      );
      expect(post).toBeDefined();
      const body = JSON.parse((post?.[1] as RequestInit).body as string);
      expect(body.testType).toBe("Pressure test");
      expect(body.result).toBe("FAIL");
      expect(body.conductedBy).toBe("jamie@factory.com");
      expect(body.occurredAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  it("surfaces a server error (with code) when recording an event fails", async () => {
    const user = userEvent.setup();
    installWriteRouter({
      onEventPost: () =>
        jsonError(422, "Unprocessable", {
          error: "Actor can't be blank",
          code: "VALIDATION_FAILED",
        }),
    });
    renderScreen();

    await user.click(await screen.findByRole("button", { name: "Record event" }));
    const form = screen.getByRole("form", { name: "Record lifecycle event" });
    await user.click(within(form).getByRole("button", { name: "Record event" }));

    const err = await screen.findByText(/Actor can't be blank/);
    expect(err).toHaveTextContent("[VALIDATION_FAILED]");
    // Form stays open so the user can correct and retry.
    expect(
      screen.getByRole("form", { name: "Record lifecycle event" }),
    ).toBeInTheDocument();
  });

  it("can cancel the record-event form without posting", async () => {
    const user = userEvent.setup();
    const fetchMock = installWriteRouter();
    renderScreen();

    await user.click(await screen.findByRole("button", { name: "Record event" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(
      screen.queryByRole("form", { name: "Record lifecycle event" }),
    ).not.toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(
        ([, init]) => (init as RequestInit | undefined)?.method === "POST",
      ),
    ).toBe(false);
  });
});
