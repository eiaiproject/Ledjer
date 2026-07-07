# Phase 0 Handoff - Discovery

Status: complete.

## Completed

- Inspected pnpm workspace, frontend Supabase usage, Supabase migrations, SQL tests, and E2E dependency shape.
- Created the main rewrite plan at `docs/cloudflare-rewrite-plan.md`.
- Identified current Supabase runtime usage:
  - `apps/web/src/lib/supabase.ts`
  - `apps/web/src/contexts/auth.tsx`
  - auth pages
  - onboarding/dashboard/accounts/products/transactions/reports/team/invitations
  - CSV/profile/org hooks
- Identified Supabase RPCs used by frontend and mapped them to Worker API replacements.

## Important Files

- `docs/cloudflare-rewrite-plan.md`
- `LEDJER_CLOUDFLARE_NATIVE_MASTER_PROMPT.md`
- `supabase/migrations/*`
- `supabase/tests/*`
- `apps/web/src/lib/supabase.ts`

## Tests Run

- Discovery phase did not change runtime code by itself. Tests were run after Phase 1/2 implementation.

## Next Phase

- Phase 1 Worker foundation.

## Notes for Next Agent

- Do not remove Supabase runtime code until replacement Worker APIs exist and tests are adjusted.
- Preserve accounting/security behavior from Supabase SQL tests conceptually.
