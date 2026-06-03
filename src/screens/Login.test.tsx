import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import Login from "./Login";

const stytchStub = vi.hoisted(() => ({
  magicLinks: { email: { loginOrCreate: vi.fn() } },
}));
vi.mock("@stytch/react", () => ({ useStytch: () => stytchStub }));

const authStub = vi.hoisted(() => ({ loginAsDemo: vi.fn() }));
vi.mock("../auth/AuthProvider", () => ({ useAuth: () => authStub }));

afterEach(() => {
  authStub.loginAsDemo.mockReset();
  stytchStub.magicLinks.email.loginOrCreate.mockReset();
  vi.unstubAllEnvs();
});

// The magic-link form only renders with a real publishable token configured.
function stubStytchToken() {
  vi.stubEnv("VITE_STYTCH_PUBLIC_TOKEN", "public-token-test-abc123");
}

// loginAsDemo is async (POST /demo-sessions + GET /me); resolve by default.
function stubDemoLoginResolved() {
  authStub.loginAsDemo.mockResolvedValue(undefined);
}

describe("Login", () => {
  it("renders a one-click demo login for each of the six seeded users", () => {
    render(<Login />);
    for (const name of [
      "Sarah Chen",
      "Marcus Webb",
      "Jamie Torres",
      "Riley Park",
      "Dr. Quinn",
      "Alex Reyes",
    ]) {
      expect(
        screen.getByRole("button", { name: new RegExp(name) }),
      ).toBeInTheDocument();
    }
  });

  it("starts a demo session for the chosen persona's seeded email on one click", async () => {
    stubDemoLoginResolved();
    const user = userEvent.setup();
    render(<Login />);

    await user.click(screen.getByRole("button", { name: /Dr\. Quinn/ }));
    expect(authStub.loginAsDemo).toHaveBeenCalledWith("dr.quinn@example.com");
  });

  it("surfaces a demo-login failure and re-enables the buttons", async () => {
    authStub.loginAsDemo.mockRejectedValueOnce(new Error("Not found"));
    const user = userEvent.setup();
    render(<Login />);

    await user.click(screen.getByRole("button", { name: /Dr\. Quinn/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Not found");
    expect(
      screen.getByRole("button", { name: /Dr\. Quinn/ }),
    ).toBeEnabled();
  });

  it("hides the magic-link form and explains, when no Stytch token is configured", () => {
    render(<Login />);

    expect(
      screen.queryByLabelText("Email address"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/Magic-link sign-in isn't configured/),
    ).toBeInTheDocument();
  });

  it("sends a magic link and confirms the email was sent", async () => {
    stubStytchToken();
    stytchStub.magicLinks.email.loginOrCreate.mockResolvedValueOnce({});
    const user = userEvent.setup();
    render(<Login />);

    await user.type(screen.getByLabelText("Email address"), "someone@example.com");
    await user.click(screen.getByRole("button", { name: "Send magic link" }));

    expect(stytchStub.magicLinks.email.loginOrCreate).toHaveBeenCalledWith(
      "someone@example.com",
      expect.objectContaining({
        login_magic_link_url: expect.stringContaining("/authenticate"),
        signup_magic_link_url: expect.stringContaining("/authenticate"),
        login_expiration_minutes: 60,
      }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      /check .*someone@example.com.* for a sign-in link/i,
    );
  });

  it("surfaces an error when sending the magic link fails", async () => {
    stubStytchToken();
    stytchStub.magicLinks.email.loginOrCreate.mockRejectedValueOnce(
      new Error("invalid magic_link_url"),
    );
    const user = userEvent.setup();
    render(<Login />);

    await user.type(screen.getByLabelText("Email address"), "someone@example.com");
    await user.click(screen.getByRole("button", { name: "Send magic link" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "invalid magic_link_url",
    );
  });
});
