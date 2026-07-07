# Phase 11 Handoff - Supabase Removal and Dashboard Port

Status: complete.

## Completed

- Ported dashboard summary from Supabase RPC to Worker API.
- Added Worker dashboard service, route, frontend API helper, and focused tests.
- Removed frontend Supabase runtime client and unused profile helper.
- Removed Supabase runtime dependencies and generated database-types workspace package.
- Removed legacy RPC arg contract test.
- Removed Supabase frontend env requirements and CSP allowances.
- Regenerated `pnpm-lock.yaml`.
- Archived historical Supabase assets under `archive/supabase-reference/`:
  - `supabase/` Postgres migrations, SQL tests, config, scripts
  - Supabase REST/RPC Playwright full-local specs and fixtures
  - Supabase-era private beta and production docs
- Reworked active Playwright config and scripts to public smoke only.
- Reworked local CI scripts for Cloudflare/D1.
- Reworked GitHub CI/deploy/visual-baseline workflows to remove Supabase setup, env, and jobs.
- Updated README, web README, testing docs, auth-flow docs, production monitoring/incident docs, env examples, and Sonar config.

## Important Files

- `apps/web/worker/services/dashboard.service.ts`
- `apps/web/worker/services/dashboard.service.test.ts`
- `apps/web/worker/routes/dashboard.routes.ts`
- `apps/web/worker/index.ts`
- `apps/web/src/lib/api/dashboard.ts`
- `apps/web/src/pages/dashboard.tsx`
- `apps/web/playwright.config.ts`
- `package.json`
- `apps/web/package.json`
- `pnpm-lock.yaml`
- `.github/workflows/ci.yml`
- `.github/workflows/deploy.yml`
- `.github/workflows/visual-baselines.yml`
- `scripts/ci-local-fast.sh`
- `scripts/ci-local-full.sh`
- `scripts/check-migration-naming.sh`
- `archive/supabase-reference/`
- `docs/cloudflare-rewrite-plan.md`

## Design Decisions

- Dashboard route is `GET /api/dashboard/summary`.
- Dashboard route requires `reports:read`, matching existing dashboard behavior.
- Dashboard summary uses current UTC month for `period_from`/`period_to`.
- Revenue/expense calculations exclude `opening_balance` journal entries.
- AR/AP summary uses default system account codes:
  - `1200` for Piutang Usaha
  - `2100` for Utang Usaha
- Historical Supabase files were archived instead of deleted outright so accounting/security logic remains available as reference.
- Active Playwright suite is public smoke only until D1-native seed helpers are added.
- No active runtime/package/workflow/script references remain for Supabase or generated database-types.

## Tests Run

- `pnpm --filter web exec vitest run worker/services/dashboard.service.test.ts worker/index.test.ts`: pass, 2 files / 4 tests
- `pnpm --filter web typecheck`: pass
- `pnpm --filter web lint`: pass
- `pnpm --filter web test`: pass, 22 files / 139 tests
- `pnpm --filter web build`: pass
- `pnpm typecheck`: pass
- `bash scripts/check-build-secrets.sh`: pass
- `bash scripts/check-migration-naming.sh`: pass
- Fresh D1 apply with `wrangler d1 migrations apply DB --local --persist-to /tmp/...`: pass
- `pnpm --filter web db:migrations:list`: pass, no migrations to apply
- `pnpm test:e2e:local`: pass, 29 Playwright tests

## Runtime Reference Scan

Command run:

```bash
rg -n "supabase|@supabase|VITE_SUPABASE|SUPABASE|database-types|db-types|test:sql" \
  apps/web/src apps/web/worker apps/web/e2e apps/web/package.json package.json \
  pnpm-lock.yaml .github scripts .env.example apps/web/.env.example \
  apps/web/index.html apps/web/public/_headers apps/web/vercel.json apps/web/vite.config.ts \
  -g '!node_modules' -g '!dist'
```

Result: no matches.

Remaining matches are historical/reference notes only:

- `docs/cloudflare-rewrite-plan.md`
- older phase handoffs
- `archive/supabase-reference/`
- `README.md`/docs references to the archive path

## Notes for Next Agent

- Rebuild authenticated Playwright E2E with Worker/D1-native seed helpers before production launch.
- Email delivery is still stubbed for verification/reset/team invitation links.
- R2/Queues async export support is still deferred.
- Partial paid credit transaction voiding remains blocked pending a fuller settlement/refund model.
- Port or recreate any useful golden accounting scenarios from `archive/supabase-reference/supabase/tests/` into Worker/D1 tests.
