# Ledjer — Production Readiness Checklist

## Status Legend

- ✅ Ready
- ⚠️ Partially Ready
- ❌ Not Ready

---

## 1. Environment & Configuration

| Item | Status | Notes |
|------|--------|-------|
| Environment variables documented | ✅ | `.env.example` exists with placeholders |
| `.env.local` not tracked in git | ✅ | `.gitignore` excludes `.env.local` |
| Supabase URL configured | ✅ | Via `VITE_SUPABASE_URL` |
| Supabase anon key configured | ✅ | Via `VITE_SUPABASE_ANON_KEY` |
| No secrets in committed code | ✅ | Verified no real keys in tracked files |
| Build output excluded from git | ✅ | `dist/` in `.gitignore` |

**Action required:** Rotate Supabase anon key if it was ever exposed in version control history.

---

## 2. Security

| Item | Status | Notes |
|------|--------|-------|
| RLS enabled on all tables | ✅ | All financial tables have RLS |
| RLS policies enforce org isolation | ✅ | `is_org_member()` check on all policies |
| RPC functions use SECURITY DEFINER | ✅ | All transaction RPCs use SECURITY DEFINER |
| RPC functions set search_path | ✅ | `SET search_path = public` on all RPCs |
| Permission checks in RPCs | ✅ | `has_permission()` used for report/void access |
| Client cannot modify billing plan | ✅ | Trigger保护 `current_plan` column |
| Client cannot modify system flags | ✅ | Trigger保护 `is_system`, `is_locked` |
| Audit logging for financial actions | ✅ | `audit_logs` table populated by RPCs |
| Rate limiting implemented | ✅ | `rate_limits` table, `check_rate_limit()` function |
| Login attempt tracking | ✅ | `login_attempts` table, `record_login_attempt()` |
| Email verification required for invites | ✅ | `invite_staff` checks `email_confirmed_at` |
| Opening balance restricted to owner | ✅ | `post_opening_balance` checks `role = 'owner'` |
| Opening balance rejected after setup | ✅ | `post_opening_balance` rejects if onboarding completed or normal transactions exist |
| validate_product_sale_accounts not callable externally | ✅ | Revoke from authenticated; called only internally from SECURITY DEFINER post_transaction |

**Remaining risks:**
- Service role key security depends on Supabase dashboard access controls
- No IP-based rate limiting (only identifier-based)

---

## 3. Accounting Correctness

| Item | Status | Notes |
|------|--------|-------|
| Double-entry accounting enforced | ✅ | Journal balance check in all posting functions |
| Balance sheet uses CTE pre-filter | ✅ | Fixed in `20260722_100000_comprehensive_priority_fixes.sql` |
| Balance sheet respects as_of_date | ✅ | CTE filters `je.entry_date <= p_as_of_date` |
| Balance sheet excludes non-posted entries | ✅ | CTE filters `je.status = 'posted'` |
| Opening balance restricted to onboarding | ✅ | `post_transaction` rejects opening types |
| Opening balance restricted to owner | ✅ | `post_opening_balance` checks owner role |
| COGS validation for product sales | ✅ | `validate_product_sale_accounts` raises if COGS/inventory accounts missing; called before journal insert |
| Void creates balanced reversal | ✅ | Reversal journal validated before commit |
| Weighted average COGS | ✅ | `recalculate_product_average_cost()` on purchases |
| Transaction numbering unique | ✅ | Unique constraint on `(organization_id, transaction_number)` |
| Entry numbering unique | ✅ | Unique constraint on `(organization_id, entry_number)` |
| post_transaction single canonical overload | ✅ | All overloads dropped, single 17-param function with all 11 transaction types |
| p_debit_account_id included in signature | ✅ | Matches frontend TypeScript types and RPC calls |

**Remaining risks:**
- No automated reconciliation between stock movements and inventory account balance
- No closing entry automation (year-end retained earnings transfer)

---

## 4. Data Integrity

| Item | Status | Notes |
|------|--------|-------|
| Foreign key constraints | ✅ | All references use FK |
| NOT NULL on required fields | ✅ | Database schema enforced |
| Payment status enum | ✅ | `payment_status` type with valid values |
| Journal entry type enum | ✅ | `journal_entry_type` type with valid values |
| Organization scoping on all data | ✅ | `organization_id` on all tables |
| Soft delete for members | ✅ | `status = 'removed'` instead of DELETE |

**Remaining risks:**
- No database-level backup automation (Supabase handles this)
- No point-in-time recovery configured

---

## 5. Frontend

| Item | Status | Notes |
|------|--------|-------|
| TypeScript compilation | ✅ | `pnpm typecheck` passes (tsc -b clean, 0 errors) |
| ESLint passes | ✅ | `pnpm lint` passes (eslint . clean, 0 warnings) |
| Onboarding guard at layout level | ✅ | Dashboard layout redirects to onboarding |
| Transaction detail accessible to staff | ✅ | Journal lines gated by RLS |
| Search input sanitized | ✅ | Special characters escaped in PostgREST queries |
| Error boundaries | ✅ | `ErrorBoundary` component wraps app |
| Loading states | ✅ | Spinners for async operations |
| Mobile responsive | ✅ | Responsive layout tested |

**Remaining risks:**
- No automated E2E tests
- No accessibility audit (WCAG 2.1 AA)

---

## 6. Performance

| Item | Status | Notes |
|------|--------|-------|
| Database indexes | ✅ | Indexes on `organization_id`, `entry_date`, etc. |
| Query optimization | ⚠️ | Some queries may need EXPLAIN analysis |
| Lazy loading | ✅ | Route-level code splitting via `React.lazy` |
| Image optimization | ✅ | SVG logos only |

**Remaining risks:**
- No CDN configuration documented
- No caching strategy for reports

---

## 7. Monitoring & Observability

| Item | Status | Notes |
|------|--------|-------|
| Error logging | ⚠️ | Console errors only |
| Performance monitoring | ❌ | Not implemented |
| Uptime monitoring | ❌ | Not configured |
| Alerting | ❌ | Not configured |

**Required before production:**
- Set up Supabase dashboard monitoring
- Configure error tracking (Sentry or similar)
- Set up uptime monitoring

---

## 8. Testing

| Item | Status | Notes |
|------|--------|-------|
| SQL regression tests | ✅ | `supabase/tests/accounting_regression_tests.sql` |
| Unit tests | ✅ | Smoke tests pass (3/3 in vitest, 399ms) |
| Integration tests | ❌ | Not implemented |
| E2E tests | ❌ | Not implemented |

**Required before production:**
- Run SQL regression tests against test database
- Add critical path unit tests

---

## 9. Documentation

| Item | Status | Notes |
|------|--------|-------|
| README with setup instructions | ✅ | `apps/web/README.md` |
| Accounting rules documentation | ✅ | `docs/accounting-rules.md` |
| QA checklist | ✅ | `docs/qa-checklist.md` |
| API documentation | ⚠️ | RPC functions documented in code |
| Deployment guide | ❌ | Not created |

---

## 10. Deployment

| Item | Status | Notes |
|------|--------|-------|
| Supabase migration applied | ⚠️ | Must run latest migration (20260724_130000 + 20260724_130001) |
| Frontend build verified | ✅ | `pnpm build` passes (Vite production build, 168ms) |
| Environment variables set | ⚠️ | Must configure in hosting platform |
| Domain configured | ❌ | Not configured |
| SSL/HTTPS | ⚠️ | Depends on hosting platform |

**Build verification results (2026-06-22):**
```bash
pnpm install       → Done in 334ms (lockfile up to date)
pnpm typecheck     → tsc -b clean, 0 errors
pnpm lint          → eslint . clean, 0 warnings
pnpm test          → 3/3 smoke tests passed (vitest v3.2.6, 399ms)
pnpm build         → Vite production build, 168ms, 44 chunks
```

---

## 11. Packaging & Distribution

| Item | Status | Notes |
|------|--------|-------|
| `.git` excluded | ✅ | Listed in `.gitignore` |
| `node_modules` excluded | ✅ | Listed in `.gitignore` |
| `apps/web/node_modules` excluded | ✅ | Listed in `.gitignore` |
| `apps/web/dist` excluded | ✅ | Listed in `.gitignore` |
| `apps/web/.env.local` excluded | ✅ | Listed in `.gitignore` |
| `.DS_Store` excluded | ✅ | Listed in `.gitignore` |
| `__MACOSX` excluded | ✅ | Listed in `.gitignore` |
| `supabase/.temp` excluded | ✅ | Listed in `.gitignore` |
| `.impeccable/config.local.json` excluded | ✅ | Listed in `.gitignore` |

**Note:** `.gitignore` correctly excludes all listed items. ZIP must be created with `git archive` or an explicit exclude list to ensure compliance.

---

## Launch Blockers

1. **Run fresh build verification** — `pnpm install && pnpm typecheck && pnpm lint && pnpm test && pnpm build`
2. **Apply Supabase migrations** — Run `20260724_130000_fix_post_transaction_canonical_with_cogs.sql` and `20260724_130001_fix_post_opening_balance_and_revoke_validate.sql`
3. **Set up error monitoring** — Configure Sentry or similar before handling real users
4. **Run SQL regression tests** — Verify all tests pass against production database
5. **Configure environment variables** — Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in production
6. **Rotate Supabase anon key** — If it was ever in version control

## Recommended Before Launch

1. Set up uptime monitoring
2. Configure backup verification
3. Add basic E2E tests for critical paths
4. Perform accessibility audit
5. Load test with realistic data volume
6. Document rollback procedure

## Known Limitations

1. No invoice-level AR/AP tracking (party-level only)
2. No report export (CSV/PDF)
3. No automated closing entries
4. No multi-currency support
5. No audit log export
6. Limited to Indonesian business context (IDR, Bahasa Indonesia)
