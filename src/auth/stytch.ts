import { createStytchUIClient } from "@stytch/react";

// Stytch public (publishable) token — safe to ship in the browser bundle. Set
// `VITE_STYTCH_PUBLIC_TOKEN` in `.env.local`. Without a real token the magic-
// link flow can't reach Stytch (the send call will error and the form surfaces
// it), but the one-click demo logins — the primary explore-the-app path — work
// regardless. The placeholder keeps the client constructible so <StytchProvider>
// can still mount in dev/CI when no token is configured.
const PLACEHOLDER = "public-token-test-00000000-0000-0000-0000-000000000000";

const publicToken = import.meta.env.VITE_STYTCH_PUBLIC_TOKEN ?? PLACEHOLDER;

export const stytch = createStytchUIClient(publicToken);
