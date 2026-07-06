# Security Launch Checklist

Last verified: 2026-07-31

## Database Security

| Item | Status | Notes |
|------|--------|-------|
| RLS enabled on all tenant tables | ✅ | `transactions`, `journal_entries`, `journal_lines`, `accounts`, `products`, `parties`, `audit_logs`, `organization_invitations` |
| Org isolation in all SELECT policies | ✅ | `is_org_member()` check |
| No INSERT/UPDATE/DELETE policies on financial tables | ✅ | Writes via RPCs only |
| RPCs use `SECURITY DEFINER` | ✅ | All mutation RPCs |
| RPCs set `search_path = public` | ✅ | All RPCs |
| Permission checks in RPCs | ✅ | `has_permission()` for create/void/report |
| Client cannot modify organization owner fields | ✅ | Trigger-protected `created_by` |
| `admin_*` RPCs revoked from anon/authenticated | ✅ | Service role only |
| Test helpers (`_test_*`) revoked from anon/authenticated | ✅ | Verified in test harness |
| Default privileges not auto-granting | ✅ | Revoked in baseline |

## Authentication Security

| Item | Status | Notes |
|------|--------|-------|
| Email verification required | ✅ | For auth |
| Login attempt tracking | ✅ | `login_attempts` table |
| Rate limiting on auth endpoints | ✅ | `check_rate_limit()` function |
| Password recovery flow tested | ✅ | E2E tests |
| Session management via Supabase Auth | ✅ | JWT-based |

## Frontend Security

| Item | Status | Notes |
|------|--------|-------|
| No service role key in frontend | ✅ | Only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` |
| No secrets in repository | ✅ | `.gitignore` excludes `.env*` |
| CSP configured | ✅ | `index.html`, `_headers`, `vercel.json` |
| HSTS configured | ✅ | Via hosting platform headers |
| X-Frame-Options set | ✅ | `DENY` or `SAMEORIGIN` |
| No localhost in production CSP | ✅ | CSP allows only production origins |
| Input sanitization | ✅ | Zod schema validation + Supabase parameter binding |
| Error boundaries | ✅ | `ErrorBoundary` component |

## Period Lock Security

| Item | Status | Notes |
|------|--------|-------|
| Period lock enforced server-side | ✅ | Trigger on `transactions` table |
| Owner-only lock/unlock | ✅ | `set_period_lock()` / `unlock_period_lock()` check role |
| Lock/unlock audited | ✅ | `audit_logs` |

## Invitation Security

| Item | Status | Notes |
|------|--------|-------|
| Tokens not guessable | ✅ | 32 bytes hex (`gen_random_bytes(32)`) |
| Expiration enforced | ✅ | 7-day expiry, checked on accept |
| Email verification on accept | ✅ | Must match invitation email |
| Cross-org isolation | ✅ | Invitation tied to organization |
| Owner-only invitation creation | ✅ | `create_invitation()` checks active owner role |

## Data Export Security

| Item | Status | Notes |
|------|--------|-------|
| Export requires org membership | ✅ | `is_org_member()` check |
| Export requires appropriate permission | ✅ | `can_view_reports` / `can_manage_accounts` / `can_manage_products` |
| No service role needed for export | ✅ | Authenticated role via RPC |
| Export respects RLS | ✅ | Via `SECURITY DEFINER` RPCs with membership check |

## Known Risks

1. **Service role key security** depends on Supabase dashboard access controls
2. **No IP-based rate limiting** — only identifier-based
3. **No automated closing entries** — manual process
4. **Backup retention** depends on Supabase plan (7 days on Pro)
5. **Admin dashboard** requires server-side auth implementation
6. **Email delivery** for invitations not yet implemented (token generated, email sending is provider setup)

## Pre-Launch Security Actions

- [ ] Rotate Supabase anon key if ever exposed in git history
- [ ] Configure Sentry alerts for security events
- [ ] Set up Supabase database monitoring
- [ ] Review all RLS policies after migration 20260627000000
- [ ] Test admin RPCs are not callable from frontend
- [ ] Verify period lock trigger works
- [ ] Test invitation token generation and acceptance flow
