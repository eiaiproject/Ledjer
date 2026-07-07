# Phase 4 Handoff - Organizations and Permissions

Status: complete.

## Completed

- Added D1 migration for `sessions.current_organization_id`.
- Added Worker organization service for organization creation, current organization selection, membership lookup, role-derived permissions, and default account seeding.
- Added auth middleware and organization permission middleware for future domain routes.
- Added `/api/organizations` routes:
  - `GET /api/organizations`
  - `POST /api/organizations`
  - `GET /api/organizations/current`
  - `POST /api/organizations/current`
  - `GET /api/organizations/:organizationId`
- Updated frontend `useOrganization` to call Worker API instead of Supabase.
- Updated onboarding submit to call Worker organization API instead of `create_organization_with_opening_balances`.
- Added organization route tests covering current org, cross-org fail-closed behavior, and opening balance rejection.

## Important Files

- `apps/web/worker/db/migrations/0003_current_organization.sql`
- `apps/web/worker/services/organization.service.ts`
- `apps/web/worker/middleware/auth.middleware.ts`
- `apps/web/worker/middleware/organization.middleware.ts`
- `apps/web/worker/routes/organization.routes.ts`
- `apps/web/worker/organization.test.ts`
- `apps/web/src/lib/api/organizations.ts`
- `apps/web/src/hooks/useOrganization.ts`
- `apps/web/src/pages/onboarding.tsx`
- `docs/cloudflare-rewrite-plan.md`

## Design Decisions

- Current organization is stored on the session as `current_organization_id`.
- If no selected org exists, `GET /api/organizations/current` falls back to the oldest active membership and stores it on the session.
- Organization access is always derived from the authenticated session user; request bodies are not trusted for tenant scope.
- Roles are `owner`, `admin`, `member`, `viewer`; legacy frontend permission booleans are computed from role in the Worker response.
- Onboarding creates:
  - organization
  - owner membership
  - current org selection
  - 26 default chart-of-account rows
- Positive opening balances are intentionally rejected with `opening_balances_not_supported` until transaction/journal posting is ported. This avoids silent accounting data loss.

## Tests Run

- `pnpm --filter web exec vitest run worker/organization.test.ts worker/index.test.ts worker/db/schema.test.ts`: pass, 3 files / 10 tests
- `pnpm --filter web lint`: pass
- `pnpm --filter web test`: pass, 16 files / 118 tests
- `pnpm --filter web typecheck`: pass
- `pnpm typecheck`: pass
- `pnpm --filter web build`: pass
- `pnpm --filter web db:migrations:apply:local`: pass
- `pnpm --filter web db:migrations:list`: pass, no migrations to apply
- Fresh D1 apply with `--persist-to /tmp/...`: pass

## Manual Smoke Test

Ran against local Worker dev server on `http://localhost:5174` because port 5173 was already in use.

- User A registered, was manually email-verified in local D1, logged in, and created org A.
- User B registered, was manually email-verified in local D1, logged in, and created org B.
- User A `GET /api/organizations/current`: 200, returned org A.
- User A `GET /api/organizations/{orgB}`: 403 `organization_forbidden`.
- User A `POST /api/organizations/current` with org B: 403 `organization_forbidden`.
- User A `POST /api/organizations` with positive opening cash balance: 400 `opening_balances_not_supported`.
- D1 query confirmed org A has 26 default account rows.
- Temporary dev server was stopped after the smoke test.

## Remaining Supabase Usage

Organization hook and onboarding creation no longer use Supabase. Supabase imports still remain in later domains:

- dashboard summary
- accounts CRUD/detail lists
- products
- transactions
- reports
- team/invitations
- invitation accept
- CSV export/profile helpers

## Next Phase

- Phase 5 accounts and chart of accounts:
  - port account list/query APIs
  - enforce `accounts:read` / `accounts:write`
  - preserve default system account protections
  - implement cash/bank account code generation without reusing 1110/1120
  - update accounts page and account-dependent dropdown APIs

## Notes for Next Agent

- Read `docs/cloudflare-rewrite-plan.md` first.
- Do not remove Supabase dependencies yet; several domain pages still depend on them.
- Opening balance posting remains blocked until transaction/journal services exist.
- The team settings page still uses Supabase and only received a type-narrowing fix after the role-derived `OrgMember` type changed.
