import { render, screen } from "@testing-library/react";
import { RouterProvider, createMemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import Layout from "./Layout";

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
    expect(screen.getByRole("link", { name: "Sales" })).toBeInTheDocument();
    expect(screen.getByText("Home content")).toBeInTheDocument();
  });

  it("renders the role selector with all six roles", () => {
    renderLayout();

    expect(screen.getByRole("combobox")).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(6);
  });
});
