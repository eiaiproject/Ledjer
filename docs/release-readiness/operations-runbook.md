# Operations Runbook

Operational procedures for Ledjer production environments.

## Quick Reference

| Incident | Severity | First Action |
|----------|----------|--------------|
| App down | P0 | Check hosting status, Supabase status |
| Auth broken | P0 | Check Supabase Auth logs, RLS policies |
| Transaction fails | P1 | Check RPC permissions, RLS |
| Report wrong | P1 | Check data integrity, journal balance |
| Slow queries | P2 | Check `pg_stat_statements` |
| UI glitch | P3 | Check browser console, Sentry |

## Monitoring

### Sentry (Frontend Errors)

**Status:** ✅ Configured (behind `VITE_SENTRY_DSN`)

Setup:
1. Create project at sentry.io
2. Set `VITE_SENTRY_DSN` in production env
3. Configure alerts:
   - Error spike: ≥10 errors in 5 min
   - New error type notification
   - Performance regression: P95 > 2s

### Uptime Monitoring

**Status:** ⚠️ Requires setup

Recommended: UptimeRobot (free tier) or Checkly

| URL | Check | Interval |
|-----|-------|----------|
| `https://app.ledjer.id` | HTTP 200 | 5 min |
| `https://app.ledjer.id/login` | Page load | 15 min |

### Database Health

Check via Supabase dashboard → Database:

```sql
-- Active connections
SELECT count(*) FROM pg_stat_activity WHERE state = 'active';

-- Slow queries (top 10)
SELECT query, calls, mean_exec_time
FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 10;
```

## Incident Response

### P0: Service Down

1. Check hosting platform status page
2. Check Supabase status: https://status.supabase.com
3. Check Sentry for error spikes
4. If Supabase issue: contact Supabase support
5. If hosting issue: contact hosting support
6. Communicate to users (status page or email)

### P0: Auth Broken

1. Check Supabase dashboard → Authentication → Logs
2. Verify RLS policies not broken by recent migration
3. Test with service role: can users authenticate?
4. Check `login_attempts` table for patterns
5. If migration issue: rollback or fix forward

### P1: Transaction Fails

1. Check browser console for errors
2. Check Sentry for RPC errors
3. Verify user has required permissions
4. Check RLS policies on affected tables
5. Test with service role key

### P1: Report Wrong

1. Verify journal balance: `SELECT abs(sum(debit) - sum(credit)) FROM journal_lines`
2. Check for orphaned records
3. Verify data integrity post-restore
4. Check if recent transaction caused imbalance

## Rollback Procedure

### Frontend Rollback

Vercel:
```bash
vercel rollback [deployment-url]
```

Cloudflare Pages:
→ Dashboard → Deployments → find previous working deploy → Promote to Production

### Database Rollback

⚠️ **Dangerous for accounting data.** Prefer forward-fix.

```sql
-- Emergency: disable problematic trigger
ALTER TABLE transactions DISABLE TRIGGER trigger_name;

-- Emergency: revoke problematic function
REVOKE EXECUTE ON FUNCTION problematic_function(UUID) FROM authenticated;
```

## Backup & Restore

See `docs/production/backup-restore.md` for full procedures.

### Quick Restore

1. Supabase dashboard → Database → Backups → Restore
2. Select backup point
3. Verify data integrity
4. Re-enable access

### Restore Verification

```sql
-- Row counts
SELECT 'organizations' as tbl, count(*) FROM organizations
UNION ALL SELECT 'transactions', count(*) FROM transactions
UNION ALL SELECT 'journal_entries', count(*) FROM journal_entries;

-- Journal balance check
SELECT abs(sum(debit) - sum(credit)) as imbalance
FROM journal_lines jl
JOIN journal_entries je ON je.id = jl.journal_entry_id
WHERE je.status = 'posted';
```

## Migration Failure Response

If a migration fails during `supabase db push`:

1. Check migration file for syntax errors
2. Check Supabase logs for specific error
3. If safe to retry: `supabase db push` again
4. If migration partially applied: manually fix in SQL Editor
5. If data corruption risk: restore from backup

## E2E/CI Failure Triage

### CI Fails on `main`

1. Check GitHub Actions for failed job
2. Review job logs for specific error
3. Common causes:
   - TypeScript error → fix typecheck
   - ESLint error → fix lint
   - Test failure → fix test or code
   - Build failure → check dependencies

### E2E Fails Locally

1. Check Supabase is running: `supabase status`
2. Check frontend is running: `pnpm dev`
3. Check env vars in `.env.local`
4. Run with UI: `pnpm --filter web test:e2e:ui`

## Contacts

| Role | Contact |
|------|---------|
| Primary responder | [owner name, email] |
| Backup responder | [backup name, email] |
| Supabase support | Via Supabase dashboard |
| Hosting support | Via hosting platform |
