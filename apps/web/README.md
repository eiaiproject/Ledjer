# Ledjer Web App

React frontend and Cloudflare Worker API for Ledjer. For the product overview, architecture, setup, and deployment, start with the [root README](../../README.md).

## Local Development

Run these commands from the repository root:

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local
pnpm db:migrations:apply:local
pnpm dev
```

Local URL: [http://localhost:5173](http://localhost:5173)

`pnpm dev` runs Vite and the Worker together through `@cloudflare/vite-plugin`. The frontend and `/api/*` share the same origin. Local D1 data is stored under `apps/web/.wrangler/`, which is git-ignored.

`PASSWORD_PEPPER` is optional in local development but required in production. Optional Worker secrets for local Google OAuth or Sentry can be placed in `apps/web/.dev.vars`, which is also git-ignored.

## Scripts

Run these from the repository root:

```bash
pnpm --filter web dev
pnpm --filter web typecheck
pnpm --filter web lint
pnpm --filter web test
pnpm --filter web build
pnpm --filter web preview
pnpm --filter web db:migrations:apply:local
pnpm --filter web db:migrations:list
pnpm --filter web deploy
```

## Features

The app includes:

- Quick-entry parsing for Indonesian transaction text
- Manual forms for cash and bank transactions, multi-product sales, and purchases
- Seven transaction types, including stock loss
- Default chart of accounts with 16 accounts, plus additional cash, bank, income, and expense accounts
- Product master data with stock, moving-average cost, cost of goods sold, and movement history
- Dashboard, profit and loss, balance sheet, and general ledger reports
- CSV transaction export with the active filters applied
- Voiding with a posted-only reporting view
- Email/password authentication and optional Google OAuth
- Offline quick-entry queue with background replay when the API returns

Authenticated accounting behavior is covered by Worker tests. Public routes and authentication flows are covered by Playwright. See [docs/testing.md](../../docs/testing.md) for the full test setup.

## Structure

```text
src/
  components/            Shared UI and feature components
  contexts/              Authentication context
  hooks/                 React hooks
  layouts/               Public and dashboard layouts
  lib/                   API client, local database, sync, utilities
  pages/                 Route pages
  routes/                Public and protected route guards
  __tests__/             Frontend unit tests
worker/
  index.ts               Worker entrypoint and Hono app
  auth/                  Password hashing, tokens, and encoding
  db/                    D1 helpers, schema constants, and migrations
  middleware/            Auth, CSRF, errors, logging, and metrics
  routes/                Hono route handlers
  services/              Domain logic
  test/                  Fake D1 database and fixtures
e2e/                     Playwright tests
```

## Conventions

- Server state uses TanStack Query with query keys in `src/lib/query-keys.ts`.
- Forms use React Hook Form and Zod.
- API calls go through `src/lib/api/*`.
- Worker route handlers stay thin; domain logic belongs in `worker/services/*`.
- User-facing copy is in Bahasa Indonesia.
- Worker tests use an in-memory Fake D1 database; see [docs/testing.md](../../docs/testing.md).
