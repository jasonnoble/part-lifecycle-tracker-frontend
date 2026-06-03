// Extends Vitest's `expect` with jest-dom matchers (toBeInTheDocument, etc.)
// and registers automatic React Testing Library cleanup after each test.
import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";

// Global teardown so individual test files don't each repeat it: undo any
// stubbed globals (e.g. fetch) and clear the actor-role cookie between tests.
afterEach(() => {
  vi.unstubAllGlobals();
  // Clear the auth-session cookie so a login in one test doesn't leak into the next.
  document.cookie = "pl_session=; path=/; max-age=0";
});
