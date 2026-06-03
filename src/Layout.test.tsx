import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider, createMemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import Layout from "./Layout";
import type { AuthUser } from "./auth/session";
import { demoUser } from "./test/utils";

// Layout derives the shell from the authenticated identity. Stub useAuth so the
// tests don't need the Stytch provider; `state.user` is set per-test to drive
// role gating, and `state.logout` is asserted on the Log out button.
const state = vi.hoisted(() => ({
  user: null as AuthUser | null,
  logout: vi.fn(),
}));

vi.mock("./auth/AuthProvider", () => ({
  useAuth: () => ({
    user: state.user,
    logout: state.logout,
    loginAsDemo: vi.fn(),
    applyStytchUser: vi.fn(),
  }),
}));

afterEach(() => {
  state.user = null;
  state.logout.mockClear();
});

function renderLayout() {
  const router = createMemoryRouter(
    [
      {
        path: "/",
        element: <Layout />,
        children: [{ index: true, element: <p>Home content</p> }],
      },
    ],
    { initialEntries: ["/"] },
  );
  return render(<RouterProvider router={router} />);
}

describe("Layout", () => {
  it("renders the nav tabs and the matched outlet content", () => {
    state.user = demoUser("installer");
    renderLayout();

    expect(screen.getByRole("link", { name: "Assembly Line" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Parts" })).toBeInTheDocument();
    expect(screen.getByText("Home content")).toBeInTheDocument();
  });

  it("shows a read-only 'Acting as' identity badge (no role picker)", () => {
    state.user = demoUser("qa_engineer", { name: "Dr. Quinn" });
    renderLayout();

    // No dropdown anymore — identity is derived from the authenticated user.
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.getByText("Dr. Quinn")).toBeInTheDocument();
    expect(screen.getByText("(QA Engineer)")).toBeInTheDocument();
  });

  it("logs out when the Log out button is clicked", async () => {
    state.user = demoUser("installer");
    const user = userEvent.setup();
    renderLayout();

    await user.click(screen.getByRole("button", { name: "Log out" }));
    expect(state.logout).toHaveBeenCalledOnce();
  });

  it("labels a read-only session in the identity badge", () => {
    state.user = demoUser(null);
    renderLayout();

    expect(screen.getByText("Guest")).toBeInTheDocument();
    expect(screen.getByText("(Read-only)")).toBeInTheDocument();
  });

  it("shows the Sales tab as disabled (not a link) with a described-by tooltip for a disallowed role (installer)", () => {
    state.user = demoUser("installer");
    renderLayout();

    // Not navigable…
    expect(
      screen.queryByRole("link", { name: "Sales" }),
    ).not.toBeInTheDocument();

    // …but still visible, marked disabled, and described by a tooltip that
    // names the required roles (reachable by screen readers via the
    // aria-describedby association).
    const sales = screen.getByText("Sales");
    expect(sales).toHaveAttribute("aria-disabled", "true");

    const tipId = sales.getAttribute("aria-describedby");
    expect(tipId).toBeTruthy();
    const tip = document.getElementById(tipId!);
    expect(tip).toHaveAttribute("role", "tooltip");
    expect(tip).toHaveTextContent(
      "Requires the Salesperson or Site Manager role",
    );
  });

  it("reveals the restricted-Sales tooltip on keyboard focus and hides it on Escape", () => {
    state.user = demoUser("installer");
    renderLayout();

    const sales = screen.getByText("Sales");
    const tip = document.getElementById(sales.getAttribute("aria-describedby")!);

    // Hidden (opacity-0) until the tab receives focus…
    expect(tip).toHaveClass("opacity-0");

    // …shown when the disabled tab is focused (keyboard-reachable: tabIndex 0).
    fireEvent.focus(sales);
    expect(tip).toHaveClass("opacity-100");

    // Escape dismisses it without needing to move focus away.
    fireEvent.keyDown(sales, { key: "Escape" });
    expect(tip).toHaveClass("opacity-0");
  });

  it("shows the Sales tab as a real link for a sales-permitted role", () => {
    state.user = demoUser("salesperson", { name: "Sarah Chen" });
    renderLayout();

    expect(screen.getByRole("link", { name: "Sales" })).toBeInTheDocument();
  });
});
