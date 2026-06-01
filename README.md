# Part Lifecycle Tracker — Frontend

A static React + TypeScript SPA (Vite) for tracking parts, serialized part instances, assembly work orders, and customer/sales orders. It is built as static files and served by Cloudflare Pages; the browser calls the Rails API over HTTP.

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

| Var | Dev | Prod (set in Cloudflare Pages) |
|-----|-----|--------------------------------|
| `VITE_API_BASE_URL` | `/api` (goes through the Vite proxy) | the API origin, e.g. `https://partledger.jasonnoble.dev` |
| `VITE_API_KEY` | the local dev key | the real key |

> ⚠️ **`VITE_*` vars are baked into the JS bundle and are publicly visible in DevTools.** The hardcoded `VITE_API_KEY` ships in the client and is therefore *not* a secret — this is an accepted trade-off for the no-real-auth demo, not an oversight. Don't put anything genuinely sensitive behind a `VITE_` prefix.

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

## Deploy

Cloudflare Pages, auto-deploying on push (per-PR previews):

- **Build command:** `npm run build`  ·  **Output dir:** `dist/`
- **Production env vars:** `VITE_API_BASE_URL` (the API origin), `VITE_API_KEY`
- `public/_redirects` (`/* /index.html 200`) provides SPA history fallback so deep-link refreshes don't 404.
- The backend must allow the Pages origin via `rack-cors`, including the custom request headers (`X-Actor-Role`, `X-Api-Key`).
