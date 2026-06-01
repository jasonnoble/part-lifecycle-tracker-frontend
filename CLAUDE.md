# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — start Vite dev server with HMR (calls to `/api` are proxied to the backend; see below)
- `npm run build` — type-check (`tsc -b`) then build for production with Vite
- `npm run lint` — run ESLint over the repo
- `npm run preview` — serve the production build locally

There is no test runner configured yet.

## Architecture

A React 19 single-page app (Vite, React Router 7, TanStack Query 5, Tailwind v4) that is the frontend for a "Part Lifecycle Tracker" — tracking parts, serialized part instances, assembly work orders, and customer/sales orders. The app is at an early stage: routing, data-fetching, and the role system are wired up, but most screens are still placeholder stubs.

### Entry & providers
`src/main.tsx` is the real entry point. It wraps `RouterProvider` in a `QueryClientProvider`.

### Routing
`src/router.tsx` defines all routes with `createBrowserRouter`. `src/Layout.tsx` is the shell (nav + `<Outlet />`) and all screens render as its children. The index route (`/`) is the Assembly Line / `WorkOrder` screen, not a landing page. Screens live in `src/screens/`.

### API layer
All HTTP goes through `api<T>(path, init)` in `src/apiClient.ts` — a thin `fetch` wrapper that:
- Prefixes paths with `VITE_API_BASE_URL`
- Sends `X-Api-Key: VITE_API_KEY` and `X-Actor-Role` (the current role, see below) on every request
- Throws on non-2xx and parses JSON otherwise

Screens consume `api()` via TanStack Query `useQuery` (see `src/screens/PartsList.tsx` for the canonical pattern). The backend wraps list responses in a pagy-style envelope (`{ data, meta }`), so expect `data.data` for collections.

### Role system (no real auth)
`src/roles.ts` defines a fixed list of demo personas/roles. The active role is stored in the `actor_role` cookie (`getRole`/`setRole`), defaults to `TECH_1`, and is sent as the `X-Actor-Role` header by `apiClient`. The backend enforces authorization based on this header. `src/RoleSelector.tsx` is the dropdown that switches roles (not yet mounted in `Layout`).

## Backend connection & environment

The frontend talks to a separate Rails-style backend. Configure via `.env.local` (see `.env.example`):
- `VITE_API_BASE_URL` — `/api` in dev (goes through the Vite proxy), or the API origin in prod
- `VITE_API_KEY` — API key sent as `X-Api-Key`

In dev, `vite.config.ts` proxies `/api/*` to `http://localhost:3000`, stripping the `/api` prefix. Production is deployed to Cloudflare Pages where `VITE_API_BASE_URL` is set to the real API origin.
