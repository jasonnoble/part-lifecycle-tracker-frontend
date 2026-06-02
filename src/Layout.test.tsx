import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider, createMemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import Layout from "./Layout";
import { setRole } from "./roles";

afterEach(() => {
  // Reset the actor-role cookie between tests.
  document.cookie = "actor_role=; path=/; max-age=0";
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
    renderLayout();

    expect(screen.getByRole("link", { name: "Assembly Line" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Parts" })).toBeInTheDocument();
    expect(screen.getByText("Home content")).toBeInTheDocument();
  });

  it("renders the role selector with all six roles", () => {
    renderLayout();

    expect(screen.getByRole("combobox")).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(6);
  });

  it("shows the Sales tab as disabled (not a link) with a role tooltip for a disallowed role (TECH_1)", () => {
    renderLayout();

    // Not navigable…
    expect(
      screen.queryByRole("link", { name: "Sales" }),
    ).not.toBeInTheDocument();

    // …but still visible, marked disabled, and explains which roles are needed.
    const sales = screen.getByText("Sales");
    expect(sales).toHaveAttribute("aria-disabled", "true");
    expect(sales).toHaveAttribute(
      "title",
      "Requires the Salesperson or Site Manager role",
    );
  });

  it("shows the Sales tab as a real link for a sales-permitted role", () => {
    setRole("SALESPERSON");
    renderLayout();

    expect(screen.getByRole("link", { name: "Sales" })).toBeInTheDocument();
  });

  it("enables the Sales tab when the role is switched to a permitted one", async () => {
    const user = userEvent.setup();
    renderLayout();

    expect(
      screen.queryByRole("link", { name: "Sales" }),
    ).not.toBeInTheDocument();

    // Switching role in the selector should re-render the shell and turn the
    // disabled Sales tab into a real link without a navigation.
    await user.selectOptions(screen.getByRole("combobox"), "SITE_MANAGER");

    expect(screen.getByRole("link", { name: "Sales" })).toBeInTheDocument();
  });
});
