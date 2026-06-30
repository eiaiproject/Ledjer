# Ledjer E2E Testing Guide

## Modes

| Mode | Env | Purpose |
|------|-----|---------|
| `deploy-smoke` | Production URL | Fast public smoke, no Supabase |
| `full-local` | localhost + Supabase | Full authenticated E2E with seed |
| `local-smoke` | localhost | Local smoke without seed |

Auto-detected from `E2E_BASE_URL`:
- Any non-localhost URL → deploy-smoke
- `localhost` + `E2E_SUPABASE_SERVICE_ROLE_KEY` → full-local
- `localhost` without service role → local-smoke

## Quick Start

### Deploy Smoke (against production)
```bash
pnpm test:e2e:deploy
```
Runs: `smoke.spec.ts` + `security-public.spec.ts` against `https://app.ledjer.id`

### Full Local E2E
```bash
# 1. Start Supabase
supabase start --workdir .

# 2. Build app
VITE_SUPABASE_URL=http://localhost:54321 \
VITE_SUPABASE_ANON_KEY=$(supabase status --workdir . --output env | grep SUPABASE_ANON_KEY | cut -d= -f2) \
pnpm --filter web build

# 3. Run E2E
E2E_MODE=full-local \
E2E_BASE_URL=http://localhost:4173 \
E2E_SUPABASE_URL=http://localhost:54321 \
E2E_SUPABASE_ANON_KEY=$(supabase status --workdir . --output env | grep SUPABASE_ANON_KEY | cut -d= -f2) \
E2E_SUPABASE_SERVICE_ROLE_KEY=$(supabase status --workdir . --output env | grep SUPABASE_SERVICE_ROLE_KEY | cut -d= -f2) \
pnpm --filter web exec playwright test --project=chromium
```

### Visual Regression
```bash
# Generate baselines
pnpm test:visual -- --update-snapshots

# Compare against baselines
pnpm test:visual
```

### Cross-Browser Smoke
```bash
pnpm test:e2e:cross-browser-smoke
```

## Test Files

### Public (safe for deploy smoke)
| File | Tests | Description |
|------|-------|-------------|
| `smoke.spec.ts` | 18 | Landing, auth pages, route guards |
| `security-public.spec.ts` | 8 | XSS, secrets, headers, error safety |
| `static-routes.spec.ts` | 5 | /terms, /privacy, /refund, /security, /contact |

### Authenticated (require seeded user)
| File | Tests | Description |
|------|-------|-------------|
| `auth.spec.ts` | 14 | Login, register, logout, forgot password |
| `auth-email.spec.ts` | 1 | Password reset via Inbucket (local only) |
| `onboarding.spec.ts` | 3 | Onboarding flow, dashboard access |
| `transactions.spec.ts` | 8 | Transaction creation, types, list |
| `transaction-negative.spec.ts` | 4 | Validation, empty fields |
| `transaction-list.spec.ts` | 4 | Search, special chars, detail |
| `transaction-report-flow.spec.ts` | 4 | Cash sale → report E2E flow |
| `void.spec.ts` | 3 | Void reason, void success, double-void prevention |
| `products-inventory.spec.ts` | 5 | Products, purchase-to-sale flow |
| `reports.spec.ts` | 8 | Reports smoke + golden number assertions |
| `accounts.spec.ts` | 4 | CoA, add form |
| `permissions.spec.ts` | 8 | Owner full access, staff restrictions, cross-org |
| `billing.spec.ts` | 5 | Billing, plan info, upgrade prompts, payment safety |
| `export-import.spec.ts` | 5 | CSV export buttons, download verification |

### UI Quality
| File | Tests | Description |
|------|-------|-------------|
| `accessibility.spec.ts` | 14 | axe-core, semantics, keyboard, a11y |
| `responsive.spec.ts` | 6 | Mobile/tablet/desktop viewports |
| `visual.spec.ts` | 8 | Screenshot baselines |
| `performance.spec.ts` | 8 | Load timing, bundle size |

### Local-only (Supabase required)
| File | Tests | Description |
|------|-------|-------------|
| `security-supabase-local.spec.ts` | 6 | RLS, RPC, service role checks |

## Global Setup

When `E2E_MODE=full-local`, `global-setup.ts` runs before tests:
1. Cleans previous E2E data (organizations, users)
2. Seeds owner + staff users
3. Creates organization with onboarding
4. Adds staff member with permissions

When `E2E_MODE=deploy-smoke` or `local-smoke`, global setup is skipped.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `E2E_MODE` | No | `deploy-smoke`, `full-local`, `local-smoke` |
| `E2E_BASE_URL` | No | App URL (default: `http://localhost:4173`) |
| `E2E_SUPABASE_URL` | Yes (full-local) | Supabase API URL |
| `E2E_SUPABASE_ANON_KEY` | Yes (full-local) | Supabase anon key |
| `E2E_SUPABASE_SERVICE_ROLE_KEY` | Yes (full-local) | Supabase service role (test setup only) |
| `E2E_INBUCKET_URL` | No | Inbucket URL (default: `http://localhost:54324`) |

## Test Data

All test data is prefixed with `[E2E]` or `e2e-`:
- Users: `e2e-owner@ledjer.test`, `e2e-staff@ledjer.test`, `e2e-owner2@ledjer.test`
- Passwords: `Password123!`
- Organizations: `[E2E] Toko Otomatis`
- Products: `[E2E] Product <timestamp>`

## CI Pipeline

See `.github/workflows/ci.yml` for full CI configuration.

Key jobs:
- `frontend`: typecheck + lint + vitest + build
- `supabase`: Docker Supabase + apply migrations + SQL tests + live database-types drift check
- `db-types-guard`: fast CANONICAL-FILE sanity check on `packages/database-types/index.ts` (does NOT prove drift)
- `e2e-full-local`: Full E2E with seeded data
- `e2e-cross-browser`: Firefox + WebKit smoke subset
- `visual-regression`: Linux Chromium visual baselines (comparison only, requires committed baselines)

## Deployment

Cloudflare Pages Git integration auto-deploys `main` to production (`https://app.ledjer.id`).
GitHub Actions CI runs on all branch pushes and PRs to main/master.

Manual deployment available via `Deploy to Cloudflare Pages` workflow (workflow_dispatch only).

### Database Types: SANITY vs LIVE

`scripts/check-db-types.sh` has two modes:

| Mode | Command | What it checks | Speed | Needs Supabase? |
|------|---------|----------------|-------|-----------------|
| SANITY (default) | `pnpm db-types:check` | `packages/database-types/index.ts` exists and looks like regenerated content (size heuristic). Does NOT prove drift. | <1s | No |
| LIVE | `bash scripts/check-db-types.sh --live` | Regenerates `supabase gen types typescript --local --schema public` and diffs against the canonical file. Catches real drift. Includes retry+backoff for ECR rate limits on `postgres-meta`. | tens of seconds | Yes |

CI runs both: `db-types-guard` runs the fast sanity check on every PR.
The `supabase` job runs `--live` after migrations apply.

### Visual Baselines Workflow

1. Commit Linux Chromium baselines by running the manual **`Generate visual baselines`** workflow (or locally: `pnpm --filter web exec playwright test e2e/visual.spec.ts --project=chromium --update-snapshots`).
2. Commit the resulting PNGs under `apps/web/e2e/visual.spec.ts-snapshots/`.
3. The normal `visual-regression` CI job runs comparison only (no `--update-snapshots`); failures are real regressions.

Visual tests use a reduced-motion stylesheet injected via `page.addStyleTag` to disable animations and transitions for deterministic screenshots.
