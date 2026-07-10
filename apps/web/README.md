# Ledjer Web App

React + Vite frontend and Cloudflare Worker API for Ledjer.

## Quick Start

```bash
pnpm install
pnpm --filter web dev
```

Local URL: `http://localhost:5173`.

## Scripts

```bash
pnpm --filter web typecheck   # TypeScript check
pnpm --filter web lint        # ESLint
pnpm --filter web test        # Vitest unit tests
pnpm --filter web build       # Production build (tsc + vite)
pnpm --filter web deploy      # Deploy to Cloudflare Workers
pnpm --filter web db:migrations:apply:local   # Apply D1 migrations locally
pnpm --filter web db:migrations:apply:remote  # Apply D1 migrations to production
pnpm --filter web cf:dev      # Vite dev (HMR + Worker simulator)
```

## Deploy

Deploy from the monorepo root:

```bash
pnpm deploy
```

Or step-by-step:

```bash
pnpm --filter web build
pnpm --filter web deploy
```

The `deploy` script runs `wrangler deploy` from the `apps/web` directory (not workspace root), which is required by Wrangler v4+.

## Structure

```text
src/
  components/
  contexts/
  hooks/
  layouts/
  lib/api/
  pages/
  __tests__/
worker/
  db/migrations/
  middleware/
  routes/
  services/
```

## Conventions

- Frontend server state uses TanStack React Query.
- Forms use React Hook Form + Zod.
- API calls go through `src/lib/api/*`.
- Worker route handlers stay thin; accounting logic lives in `worker/services/*`.
- User-facing copy is Bahasa Indonesia.
