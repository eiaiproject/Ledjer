# Security Release Checklist

Security verification for Ledjer production release.

## Database Security

| Item | Status | Verification |
|------|--------|--------------|
| RLS enabled on all tenant tables | ✅ | SQL tests verify |
| Org isolation in SELECT policies | ✅ | `is_org_member()` check |
| No INSERT/UPDATE/DELETE policies on financial tables | ✅ | Writes via RPCs only |
| RPCs use SECURITY DEFINER | ✅ | All mutation RPCs |
| RPCs set search_path = public | ✅ | All RPCs |
| Permission checks in RPCs | ✅ | `has_permission()` |
| Client cannot modify billing columns | ✅ | Trigger-protected |
| Test helpers revoked from anon/authenticated | ✅ | Verified in test harness |
| Default privileges not auto-granting | ✅ | Revoked in baseline |

## Authentication Security

| Item | Status | Verification |
|------|--------|--------------|
| Email verification required | ✅ | For auth |
| Login attempt tracking | ✅ | `login_attempts` table |
| Rate limiting on auth endpoints | ✅ | `check_rate_limit()` |
| Password recovery flow tested | ✅ | E2E tests |
| Session management via Supabase Auth | ✅ | JWT-based |
| Generic error messages | ✅ | Anti account-enumeration |

## Frontend Security

| Item | Status | Verification |
|------|--------|--------------|
| No service role key in frontend | ✅ | Only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` |
| No secrets in repository | ✅ | `.gitignore` excludes `.env*` |
| CSP configured | ✅ | `index.html`, `_headers`, `vercel.json` |
| HSTS configured | ✅ | Via hosting platform headers |
| X-Frame-Options set | ✅ | `DENY` |
| XSS prevention tested | ✅ | Security E2E tests |
| Error boundaries | ✅ | `ErrorBoundary` component |

## Auth Redirect Security

| Item | Status | Verification |
|------|--------|--------------|
| Redirect URLs whitelisted | ✅ | `supabase/config.toml` |
| No open redirect to external domains | ✅ | Only whitelisted URLs |
| Recovery flow tested | ✅ | E2E tests |
| Callback handles all OTP types | ✅ | `auth-callback.tsx` |

## Sentry Observability

| Item | Status | Verification |
|------|--------|--------------|
| Replay privacy (maskAllText, blockAllMedia, maskAllInputs) | ✅ | Configured in `main.tsx` |
| `beforeSend` URL sanitization | ✅ | Strips query params and hash |
| `beforeSend` request headers scrubbed | ✅ | Authorization, Cookie, Set-Cookie, x-auth-token, api-key |

## Invitation Security

| Item | Status | Verification |
|------|--------|--------------|
| Tokens not guessable | ✅ | 32 bytes hex (`gen_random_bytes(32)`) |
| **Tokens hashed at rest** | ✅ | SHA-256 hash via `compute_invitation_token_hash` trigger |
| **Hash-only lookup** | ✅ | `accept_invitation` uses `WHERE token_hash = ...` (index-optimized) |
| **Pre-migration tokens expired** | ✅ | All pending invitations from before hashing were expired in migration |
| Expiration enforced | ✅ | 7-day expiry, checked on accept |
| Email verification on accept | ✅ | Must match invitation email |
| Cross-org isolation | ✅ | Invitation tied to organization |
| Plan limit enforced | ✅ | Business plan required |

## Data Export Security

| Item | Status | Verification |
|------|--------|--------------|
| Export requires org membership | ✅ | `is_org_member()` check |
| Export requires appropriate permission | ✅ | `can_view_reports` etc. |
| Export respects RLS | ✅ | Via RPCs with membership check |
| **CSV formula injection protected** | ✅ | `csv_escape()` prefixes `'` on cells starting with `=`, `+`, `-`, `@`

## Pre-Release Security Actions

- [ ] Rotate Supabase anon key if ever exposed in git history
- [ ] Configure Sentry alerts for security events
- [ ] Set up Supabase database monitoring
- [ ] Review all RLS policies after latest migration
- [ ] Test admin RPCs are not callable from frontend
- [ ] Verify billing trigger protection works
- [ ] Test invitation token generation and acceptance flow

## Known Security Risks (Accepted)

1. **Service role key security** depends on Supabase dashboard access controls
2. **No IP-based rate limiting** — only identifier-based
3. **No automated closing entries** — manual process
4. **Backup retention** depends on Supabase plan (7 days on Pro)
5. **Payment webhook verification** not yet implemented (scaffold only)
6. **Admin dashboard** requires server-side auth implementation
