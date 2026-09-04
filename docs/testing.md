# Ledjer Testing Guide

## Core Gates

```bash
pnpm --filter web typecheck
pnpm --filter web lint
pnpm --filter web test
pnpm --filter web build
pnpm --filter web db:migrations:apply:local
```

Local CI wrapper (`scripts/ci-local.sh` mirrors the GitHub Actions quality
job):

```bash
pnpm ci:local            # dependency audit, org-scoping, typecheck, lint, test, build, secret scan
pnpm ci:local:full       # + fresh D1 migration apply + seed + public Playwright E2E
```

## Unit Tests (Vitest)

Two suites, one runner (`vitest run` covers `src/**/*.{test,spec}.{ts,tsx}` and
`worker/**/*.{test,spec}.ts`):

- **Frontend** (`apps/web/src/__tests__`) - jsdom + React Testing Library for
  auth provider, login/register forms, dashboard and transactions pages.
- **Worker** (`apps/web/worker`) - services, routes, middleware, auth, DB
  guards. Worker tests do not hit a real D1: they run against
  `worker/test/fake-d1.ts`, an in-memory `FakeD1Database` that mirrors the SQL
  shapes the services emit, seeded deterministically by
  `worker/test/fixtures.ts` (two orgs + an empty org, full COA, posted and
  voided transactions, pre-hashed sessions). Functional areas covered:
  accounting invariants, tenant isolation, CSRF/security/error redaction,
  reports, exports, sessions, rate limits, backup/restore.

Coverage thresholds (lines 80%, branches 75%) apply to worker services,
middleware, db, auth, and http files; run with `vitest run --coverage`.

## E2E (Playwright)

E2E is **public-first**: the always-on suites exercise public pages and route
protection. Authenticated accounting behavior is covered by Worker unit tests;
authenticated E2E specs exist but need a seeded session token.

| Mode | Env | What runs |
|------|-----|-----------|
| `local-smoke` | `E2E_MODE=local-smoke`, `E2E_BASE_URL=http://localhost:4173` | smoke + security-public |
| `local-full` | `E2E_MODE=local-full` | smoke, auth, security-public, static-routes |
| `deploy-smoke` | `E2E_MODE=deploy-smoke`, `E2E_BASE_URL=https://ledjer.id` | smoke + security-public on the deployed site |

Commands (root):

```bash
pnpm test:e2e:local          # public smoke + security + static routes
pnpm test:e2e:local:full     # plus auth-form flows
pnpm test:e2e:deploy         # against production
pnpm test:e2e:cross-browser-smoke
```

Specs in `apps/web/e2e/`: `smoke`, `static-routes`, `security-public`,
`csrf`, `security-headers`, `injection`, `auth`, `auth-flows`, and the
authenticated specs (`new-transaction`, `accounts`, `exports`,
`profit-loss`, `balance-sheet`, `settings-crud`, `tenant-isolation`) which use
the `authPage` fixture from `e2e/helpers/auth.ts`.

### Authenticated E2E (session token)

The `authPage` fixture logs in via the login API, or skips login entirely when
`PLAYWRIGHT_SESSION_TOKEN` is set (a session row inserted directly into the
target D1 - see `scripts/create-e2e-session.mjs`) to stay under the login rate
limit during full runs. Credentials come from `E2E_EMAIL` / `E2E_PASSWORD`
(defaults: `ledjer@yopmail.com` / `Ledjer26#`).

Local seeding (after `db:migrations:apply:local`):

```bash
bash scripts/seed-e2e-local.sh
```

## D1 Migrations

```bash
pnpm --filter web db:migrations:apply:local
pnpm --filter web db:migrations:list
```

Fresh-database verification (CI does this too):

```bash
TMP_D1="$(mktemp -d /tmp/ledjer-d1.XXXXXX)"
cd apps/web && pnpm exec wrangler d1 migrations apply DB --local --persist-to "$TMP_D1"
rm -rf "$TMP_D1"
```

`worker/db/migrations.test.ts` additionally parses every migration and asserts
the final schema contains exactly the MVP core tables (pre-MVP tables are a
forbidden list) and that numbering stays sequential 0001-0005.

## CI

`.github/workflows/ci.yml` runs: dependency audit → org-scoping check →
typecheck → lint → unit tests → production build (with secret scan) →
migration naming guard; a second job applies D1 migrations from an empty local
database. Public Playwright smoke and cross-browser checks run in their own
workflows against preview/production.
