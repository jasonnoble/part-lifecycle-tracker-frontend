import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PartsList from "./PartsList";
import {
  renderWithProviders,
  jsonOk,
  jsonError,
  mockFetch,
} from "../test/utils";

// Spy on navigation; the screen calls `useNavigate` on row click.
const navigate = vi.fn();
vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>();
  return { ...actual, useNavigate: () => navigate };
});

const SAMPLE_PARTS = {
  data: [
    {
      id: "1",
      partNumber: "THE-HOMER-001",
      name: "The Homer",
      description: "A car designed by Homer.",
      revision: "A",
      status: "RELEASED",
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
    },
    {
      id: "2",
      partNumber: "DRAFT-002",
      name: "Draft Widget",
      description: "Work in progress.",
      revision: null,
      status: "DRAFT",
      createdAt: "2024-01-02T00:00:00Z",
      updatedAt: "2024-01-02T00:00:00Z",
    },
  ],
  meta: { total: 2 },
};

const EMPTY_LIST = { data: [], meta: {} };

function renderScreen() {
  return renderWithProviders(<PartsList />, {
    route: { path: "/parts", initialEntry: "/parts" },
  });
}

describe("PartsList", () => {
  beforeEach(() => navigate.mockClear());

  it("shows the loading state then renders parts from GET /parts", async () => {
    mockFetch(SAMPLE_PARTS);

    renderScreen();

    expect(screen.getByText("Loading…")).toBeInTheDocument();

    // camelCase partNumber renders.
    expect(await screen.findByText("THE-HOMER-001")).toBeInTheDocument();
    expect(screen.getByText("The Homer")).toBeInTheDocument();
    // Null revision falls back to an em dash.
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders status badges for each part", async () => {
    mockFetch(SAMPLE_PARTS);

    renderScreen();

    expect(await screen.findByText("RELEASED")).toBeInTheDocument();
    expect(screen.getByText("DRAFT")).toBeInTheDocument();
  });

  it("shows an empty state when no parts are returned", async () => {
    mockFetch(EMPTY_LIST);

    renderScreen();

    expect(await screen.findByText("No parts found.")).toBeInTheDocument();
  });

  it("surfaces an error message when the request fails", async () => {
    mockFetch(() =>
      Promise.resolve(jsonError(500, "Server Error", { error: "boom" })),
    );

    renderScreen();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Error: boom");
  });

  it("debounces the search box into the query string and refetches", async () => {
    const user = userEvent.setup();
    const fetchMock = mockFetch(EMPTY_LIST);

    renderScreen();

    // Initial unsearched fetch.
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/parts$/);

    await user.type(screen.getByLabelText("Search parts"), "homer");

    // After the debounce elapses a new fetch carries the encoded search term.
    await waitFor(() => {
      const urls = fetchMock.mock.calls.map((c) => c[0] as string);
      expect(urls.some((u) => u.includes("search=homer"))).toBe(true);
    });
  });

  it("navigates to the part detail route on row click", async () => {
    const user = userEvent.setup();
    mockFetch(SAMPLE_PARTS);

    renderScreen();

    const cell = await screen.findByText("THE-HOMER-001");
    await user.click(cell);

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith("/parts/THE-HOMER-001"),
    );
  });

  it("navigates from a focused row on Enter (keyboard access)", async () => {
    const user = userEvent.setup();
    mockFetch(SAMPLE_PARTS);

    renderScreen();

    const row = (await screen.findByText("THE-HOMER-001")).closest("tr")!;
    row.focus();
    await user.keyboard("{Enter}");

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith("/parts/THE-HOMER-001"),
    );
  });

  it("shows a singular result count when exactly one part is returned", async () => {
    mockFetch({ data: [SAMPLE_PARTS.data[0]], meta: { total: 1 } });

    renderScreen();

    expect(await screen.findByText("1 part")).toBeInTheDocument();
  });

  describe("New Part modal", () => {
    it("opens the modal when New Part is clicked", async () => {
      const user = userEvent.setup();
      mockFetch(EMPTY_LIST);

      renderScreen();

      await user.click(screen.getByRole("button", { name: "New Part" }));

      expect(
        screen.getByRole("heading", { name: "New Part" }),
      ).toBeInTheDocument();
    });

    it("blocks submit and shows validation errors when required fields are empty", async () => {
      const user = userEvent.setup();
      const fetchMock = mockFetch(EMPTY_LIST);

      renderScreen();
      await user.click(screen.getByRole("button", { name: "New Part" }));

      const callsBefore = fetchMock.mock.calls.length;
      await user.click(screen.getByRole("button", { name: "Create" }));

      expect(await screen.findByText("Part number is required.")).toBeInTheDocument();
      expect(screen.getByText("Name is required.")).toBeInTheDocument();
      expect(screen.getByText("Description is required.")).toBeInTheDocument();
      expect(screen.getByText("Revision is required.")).toBeInTheDocument();
      // No POST was fired.
      expect(fetchMock.mock.calls.length).toBe(callsBefore);
    });

    it("POSTs snake_case payload, refetches and closes on success", async () => {
      const user = userEvent.setup();
      const fetchMock = mockFetch((_url: unknown, init?: RequestInit) => {
        if (init?.method === "POST") {
          return Promise.resolve(jsonOk({ id: "9" }));
        }
        return Promise.resolve(jsonOk(EMPTY_LIST));
      });

      renderScreen();
      await waitFor(() => expect(fetchMock).toHaveBeenCalled());

      await user.click(screen.getByRole("button", { name: "New Part" }));

      const dialog = screen.getByRole("heading", { name: "New Part" })
        .parentElement as HTMLElement;
      const inputs = dialog.querySelectorAll("input, textarea");
      await user.type(inputs[0] as HTMLElement, "PN-1");
      await user.type(inputs[1] as HTMLElement, "Name");
      await user.type(inputs[2] as HTMLElement, "Desc");
      await user.type(inputs[3] as HTMLElement, "A");

      await user.click(screen.getByRole("button", { name: "Create" }));

      // Modal closes (heading gone).
      await waitFor(() =>
        expect(
          screen.queryByRole("heading", { name: "New Part" }),
        ).not.toBeInTheDocument(),
      );

      const postCall = fetchMock.mock.calls.find(
        (c) => (c[1] as RequestInit | undefined)?.method === "POST",
      );
      expect(postCall).toBeTruthy();
      const sentBody = JSON.parse((postCall![1] as RequestInit).body as string);
      expect(sentBody).toMatchObject({
        part_number: "PN-1",
        name: "Name",
        description: "Desc",
        revision: "A",
      });
    });

    it("surfaces a 422 error inside the modal", async () => {
      const user = userEvent.setup();
      mockFetch((_url: unknown, init?: RequestInit) => {
        if (init?.method === "POST") {
          return Promise.resolve(
            jsonError(422, "Unprocessable Entity", {
              error: "Part number already taken",
            }),
          );
        }
        return Promise.resolve(jsonOk(EMPTY_LIST));
      });

      renderScreen();
      await user.click(screen.getByRole("button", { name: "New Part" }));

      const dialog = screen.getByRole("heading", { name: "New Part" })
        .parentElement as HTMLElement;
      const inputs = dialog.querySelectorAll("input, textarea");
      await user.type(inputs[0] as HTMLElement, "PN-1");
      await user.type(inputs[1] as HTMLElement, "Name");
      await user.type(inputs[2] as HTMLElement, "Desc");
      await user.type(inputs[3] as HTMLElement, "A");

      await user.click(screen.getByRole("button", { name: "Create" }));

      expect(
        await screen.findByText(/Could not create part: Part number already taken/),
      ).toBeInTheDocument();
      // Modal stays open on error.
      expect(screen.getByRole("heading", { name: "New Part" })).toBeInTheDocument();
    });

    it("closes the modal via Cancel without posting", async () => {
      const user = userEvent.setup();
      const fetchMock = mockFetch(EMPTY_LIST);

      renderScreen();
      await user.click(screen.getByRole("button", { name: "New Part" }));
      expect(screen.getByRole("heading", { name: "New Part" })).toBeInTheDocument();

      const callsBefore = fetchMock.mock.calls.length;
      await user.click(screen.getByRole("button", { name: "Cancel" }));

      expect(
        screen.queryByRole("heading", { name: "New Part" }),
      ).not.toBeInTheDocument();
      expect(fetchMock.mock.calls.length).toBe(callsBefore);
    });
  });
});
