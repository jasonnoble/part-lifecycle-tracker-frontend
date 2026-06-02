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

| Var | Dev | Prod (set as a Workers Build variable) |
|-----|-----|----------------------------------------|
| `VITE_API_BASE_URL` | `/api` (goes through the Vite proxy) | the API origin, e.g. `https://partledger.jasonnoble.dev` |

> ⚠️ **`VITE_*` vars are baked into the JS bundle at build time and are publicly visible in DevTools.** Don't put anything genuinely sensitive behind a `VITE_` prefix. Authorization is handled by the `X-Actor-Role` header (see below), not an API key.

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

Cloudflare Workers (static-assets) via Workers Builds, auto-deploying on push:

- **Build command:** `npm run build`  ·  **Output dir:** `dist/` (see `wrangler.jsonc`).
- **Build-time vars:** set `VITE_API_BASE_URL` (the API origin) under the Worker's *Build → Variables and secrets*. These are build-time only — Workers does not share runtime and build-time vars, and `VITE_*` must exist when `vite build` runs to be inlined.
- SPA deep-link fallback is handled by `not_found_handling: "single-page-application"` in `wrangler.jsonc` (no `_redirects` file — it conflicts with this flow).
- The backend must allow the deployed origin via `rack-cors`, including the `X-Actor-Role` request header.
