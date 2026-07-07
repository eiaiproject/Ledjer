# Phase 3 Handoff - Custom Auth

Status: complete.

## Completed

- Added Worker auth API routes for register, login, logout, me, email verification resend/token verification, forgot password, reset password, change password, and Google OAuth placeholder.
- Added D1-backed session service with hashed session tokens.
- Added Worker-compatible password hashing and token hashing utilities.
- Added session cookie helpers using HttpOnly Secure SameSite=Lax cookies.
- Added CSRF/origin middleware for mutating API requests.
- Updated frontend auth context/provider and auth pages to use Worker API helpers instead of Supabase Auth.
- Added auth API client helpers under `apps/web/src/lib/api`.
- Added Worker auth crypto tests and updated existing auth page/provider tests.

## Important Files

- `apps/web/worker/routes/auth.routes.ts`
- `apps/web/worker/services/auth.service.ts`
- `apps/web/worker/services/session.service.ts`
- `apps/web/worker/auth/password.ts`
- `apps/web/worker/auth/tokens.ts`
- `apps/web/worker/auth/cookies.ts`
- `apps/web/worker/middleware/csrf.middleware.ts`
- `apps/web/src/lib/api/client.ts`
- `apps/web/src/lib/api/auth.ts`
- `apps/web/src/contexts/auth.tsx`
- `apps/web/src/contexts/auth-context.ts`
- `apps/web/src/pages/login.tsx`
- `apps/web/src/pages/register.tsx`
- `apps/web/src/pages/forgot-password.tsx`
- `apps/web/src/pages/reset-password.tsx`
- `apps/web/src/pages/auth-callback.tsx`
- `apps/web/worker/auth/auth-crypto.test.ts`

## Auth Decisions

- Session cookie name is `ledjer_session`.
- Raw session tokens are only returned as cookies; D1 stores `token_hash`.
- Password hashes use `pbkdf2-sha256$210000$salt$hash`.
- `PASSWORD_PEPPER` is optional and read from Worker env when configured.
- Registration creates an unverified user and returns `needsEmailConfirmation: true`.
- Login requires `email_verified_at` to be set.
- Forgot password and email verification create hashed token records, but email delivery is still stubbed.
- Reset password requires a valid recovery session created by the password reset token flow.
- Google OAuth currently returns `oauth_not_configured`.

## Tests Run

- `pnpm --filter web exec vitest run src/__tests__/auth-provider.test.tsx src/__tests__/login.test.tsx src/__tests__/register.test.tsx src/__tests__/forgot-password.test.tsx src/__tests__/reset-password.test.tsx src/__tests__/auth-callback.test.tsx src/__tests__/password-recovery-flow.test.tsx`: pass, 7 files / 43 tests
- `pnpm --filter web exec vitest run worker/auth/auth-crypto.test.ts`: pass, 1 file / 4 tests
- `pnpm --filter web lint`: pass
- `pnpm --filter web test`: pass, 15 files / 115 tests
- `pnpm typecheck`: pass
- `pnpm --filter web build`: pass
- `pnpm --filter web db:migrations:apply:local`: pass, no migrations to apply
- `pnpm --filter web db:migrations:list`: pass, no migrations to apply

## Manual Smoke Test

Ran against local Worker dev server on `http://localhost:5174` because port 5173 was already in use.

- `POST /api/auth/register`: 200, returned unverified user and `needsEmailConfirmation: true`
- D1 local update set `email_verified_at` for the smoke-test user
- `POST /api/auth/login`: 200, returned `Set-Cookie: ledjer_session=...; HttpOnly; Secure; SameSite=Lax`
- `GET /api/auth/me`: 200, returned the authenticated user/session
- `POST /api/auth/logout`: 200
- `GET /api/auth/me` after logout: 200, returned `user: null` and `session: null`

The temporary dev server was stopped after the smoke test.

## Remaining Supabase Usage

Auth provider/pages no longer use Supabase Auth. Supabase imports still remain in non-auth domains and are expected until later phases:

- onboarding and organization flows
- dashboard
- accounts
- products
- transactions
- reports
- team/invitations
- CSV export/profile helpers

## Next Phase

- Phase 4 organizations and permissions:
  - organization creation/onboarding API
  - membership and role services
  - current organization selection
  - permission middleware
  - onboarding/dashboard guard updates
  - cross-org fail-closed tests

## Notes for Next Agent

- Read `docs/cloudflare-rewrite-plan.md` before continuing.
- Do not remove Supabase dependencies yet; later phases still need to port domain pages.
- Email provider integration remains open. Until then, real verification/reset links cannot be delivered even though token storage and verification endpoints exist.
- Existing Playwright E2E still references Supabase-era helpers and needs replacement in a later phase.
