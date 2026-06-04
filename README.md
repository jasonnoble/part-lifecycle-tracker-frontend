# Part Lifecycle Tracker — Frontend

A static React + TypeScript SPA (Vite) for tracking parts, serialized part instances, assembly work orders, and customer/sales orders. It is built as static files and served by Cloudflare Workers (static assets); the browser calls the Rails API over HTTP.

**Stack:** Vite · React 19 · React Router 7 · TanStack Query 5 · Tailwind CSS v4

## Prerequisites

Toolchain is pinned in `mise.toml` (`node@26.2`, `npm@11.16.0`). With [mise](https://mise.jdx.dev) installed:

```bash
mise install   # installs the pinned node + npm
npm install
```

## Environment

Copy the example and fill in real values:

```bash
cp .env.example .env.local
```

| Var | Dev | Prod (set as a Workers Build variable) |
|-----|-----|----------------------------------------|
| `VITE_API_BASE_URL` | `/api` (goes through the Vite proxy) | the API origin, e.g. `https://partledger.jasonnoble.dev` |
| `VITE_STYTCH_PUBLIC_TOKEN` | optional — the one-click demo logins work without it; needed only for magic-link sign-in | the Stytch publishable token (Stytch dashboard → API Keys) |

> ⚠️ **`VITE_*` vars are baked into the JS bundle at build time and are publicly visible in DevTools.** Don't put anything genuinely sensitive behind a `VITE_` prefix. Neither var here is a secret: the Stytch token is publishable by design, and authorization is handled by Stytch session **Bearer JWTs** — the backend resolves identity from the JWT and assigns roles/`permissions[]` server-side (the demo personas mint real Stytch sessions), so the client never holds an API key or chooses a role.

`.env.local` is gitignored.

## Development

Local dev runs **two servers** — the Rails API and the Vite dev server:

```bash
# terminal 1 — backend repo
bin/dev          # Rails API on :3000

# terminal 2 — this repo
npm run dev      # Vite on :5173  ← open this one
```

In dev, the app calls relative `/api/*` paths. `vite.config.ts` proxies those to `http://localhost:3000` and strips the `/api` prefix (`/api/parts` → `/parts`), so there's no CORS in local dev.

## Scripts

| Command | What it does |
|---------|--------------|
| `npm run dev` | Vite dev server with HMR |
| `npm run build` | Type-check (`tsc -b`) then production build to `dist/` |
| `npm run lint` | ESLint over the repo |
| `npm run preview` | Serve the production build locally |
| `npm test` | Run the Vitest suite once |
| `npm run test:watch` | Vitest in watch mode |
| `npm run test:coverage` | Run tests with v8 coverage (enforces the global floor) |
| `npm run coverage:diff` | Diff-coverage gate on changed lines (needs `diff-cover`, see below) |

## Testing

Vitest + React Testing Library (jsdom). Two coverage gates run in CI on every PR:

1. **Global floor** — `npm run test:coverage` fails if overall coverage drops
   below the threshold in `vite.config.ts` (`coverage.thresholds`).
2. **Per-PR diff gate** — changed lines must be ≥ 90% covered, so no PR merges
   code its own diff didn't cover. CI runs [`diff-cover`](https://github.com/Bachmann1234/diff_cover)
   against the `lcov` report and the base branch.

To run the diff gate locally (requires Python; install once with
`pipx install diff-cover`):

```bash
git fetch origin main
npm run test:coverage      # writes coverage/lcov.info
npm run coverage:diff      # diff-cover vs origin/main, --fail-under=90
```

## Deploy

Cloudflare Workers (static-assets) via Workers Builds, auto-deploying on push:

- **Build command:** `npm run build`  ·  **Output dir:** `dist/` (see `wrangler.jsonc`).
- **Build-time vars:** set `VITE_API_BASE_URL` (the API origin) and `VITE_STYTCH_PUBLIC_TOKEN` under the Worker's *Build → Variables and secrets*. These are build-time only — Workers does not share runtime and build-time vars, and `VITE_*` must exist when `vite build` runs to be inlined.
- SPA deep-link fallback is handled by `not_found_handling: "single-page-application"` in `wrangler.jsonc` (no `_redirects` file — it conflicts with this flow).
- The backend must allow the deployed origin via `rack-cors`, including the `Authorization` request header (every API call carries a `Bearer` session JWT).
