import type { ReactElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PartsList from "./PartsList";

function renderWithClient(ui: ReactElement) {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("PartsList", () => {
    it("renders parts fetched through react-query", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                ok: true,
                status: 200,
                statusText: "OK",
                json: async () => ({
                    data: [
                        { id: "1", part_number: "THE-HOMER-001", name: "The Homer", status: "RELEASED" },
                    ],
                }),
            }),
        );

        renderWithClient(<PartsList />);

        // Loading state shows first, then the resolved list item.
        expect(screen.getByText("Loading…")).toBeInTheDocument();
        const item = await screen.findByRole("listitem");
        expect(item).toHaveTextContent("THE-HOMER-001 — The Homer (RELEASED)");
    });

    it("shows an error message when the request fails", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                ok: false,
                status: 500,
                statusText: "Server Error",
                json: async () => ({}),
            }),
        );

        renderWithClient(<PartsList />);

        expect(await screen.findByText(/Error: 500 Server Error/)).toBeInTheDocument();
    });
});
