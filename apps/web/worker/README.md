# Ledjer Worker

Cloudflare Worker API for Ledjer.

## Routes

```
/api/health          — Health check
/api/auth/*          — Register, login, logout, me, email verification, password reset
/api/organizations/* — Organization CRUD and current org selection
/api/accounts/*      — Chart of accounts CRUD with code generation
/api/products/*      — Product CRUD with stock management
/api/inventory/*     — Stock movement reads
/api/transactions/*  — Transaction posting, listing, detail, void
/api/reports/*       — Trial balance, profit/loss, balance sheet, general ledger
/api/team/*          — Team members, invitations, role management
/api/exports/*       — CSV exports with formula injection protection
/api/parties/*       — Party lookup for transaction forms
/api/dashboard/*     — Dashboard summary
```

## Local Development

```bash
pnpm --filter web dev        # Vite dev server + Worker (port 5173)
pnpm --filter web cf:dev     # Standalone Wrangler dev
```

## D1 Migrations

```bash
pnpm --filter web db:migrations:apply:local
pnpm --filter web db:migrations:list
```

Fresh-database verification:

```bash
TMP_D1="$(mktemp -d /tmp/ledjer-d1.XXXXXX)"
cd apps/web && pnpm exec wrangler d1 migrations apply DB --local --persist-to "$TMP_D1"
rm -rf "$TMP_D1"
```

## Tests

```bash
pnpm --filter web exec vitest run worker/
```

## Structure

```
worker/
  index.ts              — Worker entrypoint + Hono app
  env.ts                — Env/binding types
  auth/                 — Password hashing, token generation, session cookies
  middleware/            — Auth, CSRF, secure headers, error handling, request ID
  routes/               — Hono route handlers (thin controllers)
  services/             — Domain logic (accounting, auth, reports, etc.)
  db/
    client.ts           — D1 query helpers
    schema.ts           — Table/column constants
    migrations/         — D1 SQL migrations
    repositories/       — Query helpers
  http/                 — Error types, JSON response helpers
```
