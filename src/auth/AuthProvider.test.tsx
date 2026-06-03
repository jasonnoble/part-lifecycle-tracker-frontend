import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  Outlet,
  RouterProvider,
  createMemoryRouter,
  useLocation,
} from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "./AuthProvider";
import { getAuthUser } from "./session";
import { jsonError, jsonOk, mockFetchByUrl } from "../test/utils";

// AuthProvider only touches stytch.session.revoke() (on logout); stub it.
const stytchStub = vi.hoisted(() => ({
  session: { revoke: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock("@stytch/react", () => ({ useStytch: () => stytchStub }));

afterEach(() => stytchStub.session.revoke.mockClear());

/** fetch stub answering the demo-login round-trip (JAS-80 + /me). */
function mockDemoBackend() {
  return mockFetchByUrl([
    {
      match: (url, init) =>
        url.includes("/demo-sessions") && init?.method === "POST",
      respond: () => jsonOk({ session_jwt: "jwt-demo", session_token: "tok" }),
    },
    {
      match: (url) => url.includes("/me"),
      respond: () =>
        jsonOk({
          email: "dr.quinn@example.com",
          name: "Dr. Quinn",
          role: "qa_engineer",
          permissions: ["step.certify"],
        }),
    },
  ]);
}

function Consumer() {
  const { user, loginAsDemo, applyStytchUser, logout } = useAuth();
  return (
    <div>
      <p data-testid="who">
        {user ? `${user.name}:${user.role}:${user.via}` : "anon"}
      </p>
      {/* Swallow rejections like the Login screen does (it shows the error). */}
      <button onClick={() => loginAsDemo("dr.quinn@example.com").catch(() => {})}>
        demo-quinn
      </button>
      <button
        onClick={() =>
          applyStytchUser({
            email: "ann@example.com",
            name: "Ann",
            role: "installer",
            permissions: ["step.install"],
            via: "magic_link",
            sessionJwt: "jwt-1",
          })
        }
      >
        apply
      </button>
      <button onClick={logout}>logout</button>
    </div>
  );
}

function Probe() {
  return <span data-testid="path">{useLocation().pathname}</span>;
}

function renderApp(initial = "/start") {
  const router = createMemoryRouter(
    [
      {
        element: (
          <AuthProvider>
            <Outlet />
            <Probe />
          </AuthProvider>
        ),
        children: [
          { path: "/start", element: <Consumer /> },
          { path: "/", element: <Consumer /> },
          { path: "/login", element: <Consumer /> },
        ],
      },
    ],
    { initialEntries: [initial] },
  );
  return render(<RouterProvider router={router} />);
}

describe("AuthProvider", () => {
  it("starts anonymous when no session is stored", () => {
    renderApp();
    expect(screen.getByTestId("who")).toHaveTextContent("anon");
  });

  it("loginAsDemo mints a demo session, resolves /me, and navigates home", async () => {
    const fetchMock = mockDemoBackend();
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByText("demo-quinn"));

    expect(await screen.findByTestId("who")).toHaveTextContent(
      "Dr. Quinn:qa_engineer:demo",
    );
    expect(screen.getByTestId("path")).toHaveTextContent("/");

    // Persisted with the minted JWT; /me was called with it as the Bearer.
    expect(getAuthUser()?.sessionJwt).toBe("jwt-demo");
    const meCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes("/me"),
    );
    const headers = (meCall?.[1]?.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer jwt-demo");
  });

  it("loginAsDemo rejects when the backend declines (caller shows the error)", async () => {
    mockFetchByUrl([
      {
        match: (url) => url.includes("/demo-sessions"),
        respond: () =>
          jsonError(404, "Not Found", { error: "Not found", code: "NOT_FOUND" }),
      },
    ]);
    const user = userEvent.setup();
    renderApp();

    // The click handler swallows nothing — the state must stay anonymous.
    await user.click(screen.getByText("demo-quinn"));
    expect(screen.getByTestId("who")).toHaveTextContent("anon");
    expect(getAuthUser()).toBeNull();
  });

  it("applyStytchUser persists a magic-link identity (with JWT)", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByText("apply"));

    expect(screen.getByTestId("who")).toHaveTextContent(
      "Ann:installer:magic_link",
    );
    expect(getAuthUser()?.sessionJwt).toBe("jwt-1");
  });

  it("logout clears the session, revokes the Stytch session, and routes to /login", async () => {
    mockDemoBackend();
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByText("demo-quinn"));
    await screen.findByText("Dr. Quinn:qa_engineer:demo");
    await user.click(screen.getByText("logout"));

    expect(getAuthUser()).toBeNull();
    expect(stytchStub.session.revoke).toHaveBeenCalledOnce();
    expect(screen.getByTestId("path")).toHaveTextContent("/login");
  });

  it("useAuth throws when used outside the provider", () => {
    // Silence the expected React error log for this render.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Consumer />)).toThrow(/useAuth must be used within/);
    spy.mockRestore();
  });
});
