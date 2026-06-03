import { render, screen } from "@testing-library/react";
import { RouterProvider, createMemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import Authenticate from "./Authenticate";
import { jsonOk, mockFetchByUrl } from "../test/utils";

const stytchStub = vi.hoisted(() => ({
  authenticateByUrl: vi.fn(),
  session: { getTokens: vi.fn() },
}));
vi.mock("@stytch/react", () => ({ useStytch: () => stytchStub }));

const authStub = vi.hoisted(() => ({ applyStytchUser: vi.fn() }));
vi.mock("../auth/AuthProvider", () => ({ useAuth: () => authStub }));

afterEach(() => {
  stytchStub.authenticateByUrl.mockReset();
  stytchStub.session.getTokens.mockReset();
  authStub.applyStytchUser.mockReset();
});

function mockMe(me: unknown) {
  return mockFetchByUrl([
    { match: (url) => url.includes("/me"), respond: () => jsonOk(me) },
  ]);
}

function renderAuth() {
  const router = createMemoryRouter(
    [
      { path: "/authenticate", element: <Authenticate /> },
      { path: "/", element: <p>home screen</p> },
    ],
    { initialEntries: ["/authenticate"] },
  );
  return render(<RouterProvider router={router} />);
}

describe("Authenticate", () => {
  it("exchanges the token, resolves identity via /me, and lands on home", async () => {
    stytchStub.authenticateByUrl.mockResolvedValue({});
    stytchStub.session.getTokens.mockReturnValue({ session_jwt: "jwt-x" });
    const fetchMock = mockMe({
      email: "dr.quinn@example.com",
      name: "Dr. Quinn",
      role: "qa_engineer",
      permissions: ["step.certify"],
    });

    renderAuth();

    expect(await screen.findByText("home screen")).toBeInTheDocument();
    expect(stytchStub.authenticateByUrl).toHaveBeenCalledWith({
      session_duration_minutes: 60,
    });
    // /me was authorized with the fresh JWT (the session isn't stored yet).
    const headers = (fetchMock.mock.calls[0]?.[1]?.headers ?? {}) as Record<
      string,
      string
    >;
    expect(headers.Authorization).toBe("Bearer jwt-x");
    expect(authStub.applyStytchUser).toHaveBeenCalledWith({
      email: "dr.quinn@example.com",
      name: "Dr. Quinn",
      role: "qa_engineer",
      permissions: ["step.certify"],
      via: "magic_link",
      sessionJwt: "jwt-x",
    });
  });

  it("stores an unseeded identity as a read-only session (null role, no permissions)", async () => {
    stytchStub.authenticateByUrl.mockResolvedValue({});
    stytchStub.session.getTokens.mockReturnValue({ session_jwt: "jwt-anon" });
    mockMe({ email: null, name: null, role: null, permissions: [] });

    renderAuth();

    expect(await screen.findByText("home screen")).toBeInTheDocument();
    expect(authStub.applyStytchUser).toHaveBeenCalledWith(
      expect.objectContaining({ role: null, permissions: [], sessionJwt: "jwt-anon" }),
    );
  });

  it("shows an error when the magic-link token is invalid", async () => {
    stytchStub.authenticateByUrl.mockRejectedValue(new Error("token expired"));

    renderAuth();

    expect(await screen.findByText("Sign-in failed")).toBeInTheDocument();
    expect(screen.getByText("token expired")).toBeInTheDocument();
    expect(authStub.applyStytchUser).not.toHaveBeenCalled();
  });

  it("shows an error when no session JWT was established", async () => {
    stytchStub.authenticateByUrl.mockResolvedValue({});
    stytchStub.session.getTokens.mockReturnValue(null);

    renderAuth();

    expect(await screen.findByText("Sign-in failed")).toBeInTheDocument();
    expect(screen.getByText("No session was established.")).toBeInTheDocument();
  });
});
