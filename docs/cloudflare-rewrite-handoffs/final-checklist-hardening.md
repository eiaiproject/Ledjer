# Final Checklist Hardening Handoff

Status: complete for this pass.

This is not a numbered master-prompt phase. It is the post-Phase-11 checklist pass for security, accounting, and compatibility items from the master prompt sections 18-20.

## Completed

- Added explicit session cookie tests:
  - `HttpOnly`
  - `Secure`
  - `SameSite=Lax`
  - `Path=/`
  - secure clear-cookie boundary
- Added explicit CSRF/origin test for cookie-authenticated mutating requests from a foreign origin.
- Added explicit period-lock guard tests for transaction posting dates.
- Added explicit team-member removal safeguard tests:
  - owner cannot be removed through team removal
  - non-owner member cannot remove themselves
- Exported `assertPeriodOpen` from transaction service for focused invariant testing.
- Re-ran active Supabase/runtime scan; active code/package/workflow/script paths remain clean.

## Important Files

- `apps/web/worker/auth/cookies.test.ts`
- `apps/web/worker/index.test.ts`
- `apps/web/worker/services/transactions.service.ts`
- `apps/web/worker/services/transactions.service.test.ts`
- `apps/web/worker/services/team.service.test.ts`

## Checklist Notes

### Security

- Session cookie hardening is covered by unit tests.
- CSRF origin rejection is covered by Worker app test.
- Token storage remains hash-only for sessions, verification/reset tokens, and invitations.
- Login rate limiting exists in `auth.service.ts`; no new test was added in this pass.
- Team owner/self-removal safeguards are covered.
- Active build secret scan passes.

### Accounting

- Journal balance invariant remains covered.
- Period lock guard is now covered directly.
- Posted transaction void/reversal flow was covered in earlier Phase 7/10 smoke tests.
- Partial paid credit voiding remains intentionally blocked with `partial_void_not_supported`.
- Opening balances remain intentionally rejected until an explicit posting model is implemented.

### Compatibility

- Active build uses Cloudflare Vite/Worker output.
- D1 migration naming guard passes.
- D1 migration list reports no pending local migrations.
- No active Supabase/database-types references remain in runtime/package/workflow/script paths.

## Tests Run

- `pnpm --filter web exec vitest run worker/auth/cookies.test.ts worker/index.test.ts worker/services/transactions.service.test.ts worker/services/team.service.test.ts`: pass, 4 files / 16 tests
- `pnpm --filter web typecheck`: pass
- `pnpm --filter web lint`: pass
- `pnpm --filter web test`: pass, 23 files / 146 tests
- `pnpm --filter web build`: pass
- `pnpm typecheck`: pass
- `bash scripts/check-migration-naming.sh`: pass
- `bash scripts/check-build-secrets.sh`: pass
- `pnpm --filter web db:migrations:list`: pass, no migrations to apply
- `pnpm test:e2e:local`: pass, 29 Playwright tests

## Not Run

- `wrangler deploy`: not run because this pass does not deploy production.
- Remote D1 migration apply: not run because this pass only verifies local/fresh behavior.
- Visual regression: not run in this pass.
- Authenticated D1-native Playwright E2E: not available yet after archiving Supabase full-local suite.

## Remaining Work

- Rebuild authenticated E2E with Worker/D1-native seed helpers.
- Port useful golden scenarios from `archive/supabase-reference/supabase/tests/` into Worker/D1 tests.
- Implement real email delivery for auth verification/reset and team invitations.
- Decide the explicit opening-balance posting rule and implement it.
- Decide whether period-lock creation/management needs UI/API for launch.
- Revisit async R2/Queue exports only when export volume requires it.
