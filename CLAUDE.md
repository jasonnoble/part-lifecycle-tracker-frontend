# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — start Vite dev server with HMR (calls to `/api` are proxied to the backend; see below)
- `npm run build` — type-check (`tsc -b`) then build for production with Vite
- `npm run lint` — run ESLint over the repo
- `npm test` — run the Vitest suite once (`npm run test:watch` for watch mode)
- `npm run test:coverage` — run with V8 coverage; global floor is 80% (lines/branches/functions/statements), enforced by `vite.config.ts`
- `npm run coverage:diff` — diff-cover gate: changed lines vs `origin/main` must be ≥90% covered

Tests are Vitest + Testing Library (jsdom). Every module has a colocated `*.test.ts(x)`; shared setup is `src/test/setup.ts`, render helpers in `src/test/utils.tsx`. Keep coverage above the floors when adding code.

## Architecture

A React 19 single-page app (Vite, React Router 7, TanStack Query 5, Tailwind v4, Stytch auth) — the frontend for a "Part Lifecycle Tracker": parts, serialized part instances, assembly work orders, and customer/sales orders. All main screens are implemented (work orders list/detail, parts list/detail with BOM editor, instance detail with lifecycle events, customer orders, login).

### Entry & providers
`src/main.tsx` renders `RouterProvider` inside `StytchProvider` + `QueryClientProvider`.

### Routing
`src/router.tsx` defines all routes with `createBrowserRouter`. A pathless layout puts `AuthProvider` inside the router so it wraps every route. `/login` and `/authenticate` are public; everything else renders inside `RequireAuth` + `src/Layout.tsx` (nav shell + `<Outlet />`). The index route (`/`) is the Assembly Line / work-orders screen. Screens live in `src/screens/`; `parts/:partNumber/context?` deep-links the raw-context modal on `PartDetail`.

### Auth (Stytch — real sessions, no passwords)
- **Demo logins:** the login screen one-click logs in as one of six seeded personas (`PERSONAS` in `src/roles.ts`) by POSTing `/demo-sessions`, which mints a real Stytch session (JAS-80).
- **Magic link:** Stytch email magic links land on `/authenticate` (needs `VITE_STYTCH_PUBLIC_TOKEN`; demo logins work without it).
- Either way, identity is resolved via `GET /me` — email, name, **server-assigned role**, and server-computed `permissions[]`. The client never chooses or sends a role.
- The resolved identity (including the Stytch session JWT) is cached in the `pl_session` cookie by `src/auth/session.ts`; `src/auth/AuthProvider.tsx` exposes it via `useAuth()`.

### API layer
All HTTP goes through `api<T>(path, init)` in `src/apiClient.ts`:
- Prefixes paths with `VITE_API_BASE_URL`
- Sends `Authorization: Bearer <Stytch session JWT>` on every request
- Throws `ApiError` (carries `status` + backend `code`) on non-2xx; a 401 while holding a session clears it and redirects to `/login` (Stytch sessions expire after ~60 min)

`apiList<T>` unwraps the backend's pagy-style `{ data, meta }` envelope for index endpoints. Screens consume these via TanStack Query `useQuery`/`useMutation`.

### Roles & permissions
`src/roles.ts` defines the five backend roles and six demo personas (two share the `installer` role — four-eyes rules are per *identity*, not per role). UI gating comes from the server-computed `permissions[]` on `/me` (same policy the API enforces); `canViewSales` is the one UI-only gate (Sales tab). The backend authorizes from the JWT — there is no `X-Actor-Role` or `X-Api-Key` header anymore.

## Backend connection & environment

The frontend talks to a separate Rails backend (sibling repo — verify API contracts there, not against prod). Configure via `.env.local` (see `.env.example`):
- `VITE_API_BASE_URL` — `/api` in dev (goes through the Vite proxy), or the API origin in prod
- `VITE_STYTCH_PUBLIC_TOKEN` — Stytch publishable token for magic-link login (optional in dev; demo logins don't need it)

In dev, `vite.config.ts` proxies `/api/*` to `http://localhost:3000`, stripping the `/api` prefix.

Production deploys as a **Cloudflare Workers static-assets** site (`wrangler.jsonc`, serving `./dist` with SPA fallback), not classic Pages — `VITE_*` vars must be set as *Build* variables in the Worker's settings so Vite inlines them. Live at https://app.partledger.jasonnoble.dev (API: https://partledger.jasonnoble.dev).
