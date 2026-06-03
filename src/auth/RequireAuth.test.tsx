import { render, screen } from "@testing-library/react";
import { RouterProvider, createMemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import RequireAuth from "./RequireAuth";
import type { AuthUser } from "./session";
import { demoUser } from "../test/utils";

const state = vi.hoisted(() => ({ user: null as AuthUser | null }));
vi.mock("./AuthProvider", () => ({ useAuth: () => ({ user: state.user }) }));

afterEach(() => {
  state.user = null;
});

function renderGuarded() {
  const router = createMemoryRouter(
    [
      {
        path: "/secret",
        element: (
          <RequireAuth>
            <p>secret content</p>
          </RequireAuth>
        ),
      },
      { path: "/login", element: <p>login page</p> },
    ],
    { initialEntries: ["/secret"] },
  );
  return render(<RouterProvider router={router} />);
}

describe("RequireAuth", () => {
  it("redirects to /login when there is no session", () => {
    renderGuarded();
    expect(screen.getByText("login page")).toBeInTheDocument();
    expect(screen.queryByText("secret content")).not.toBeInTheDocument();
  });

  it("renders the protected content when authenticated", () => {
    state.user = demoUser("qa_engineer");
    renderGuarded();
    expect(screen.getByText("secret content")).toBeInTheDocument();
  });

  it("renders the protected content for a read-only session", () => {
    state.user = demoUser(null);
    renderGuarded();
    expect(screen.getByText("secret content")).toBeInTheDocument();
  });
});
