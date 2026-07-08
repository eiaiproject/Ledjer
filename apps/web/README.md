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
pnpm --filter web typecheck
pnpm --filter web lint
pnpm --filter web test
pnpm --filter web build
pnpm --filter web db:migrations:apply:local
pnpm --filter web cf:deploy
```

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
