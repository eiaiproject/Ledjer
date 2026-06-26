# Incident Response Runbook

Last updated: 2026-06-27

## Severity Definitions

| Severity | Description | Response Time | Example |
|----------|-------------|---------------|---------|
| **P0 — Critical** | Service down, data loss risk, security breach | Immediate (< 15 min) | Database outage, auth bypass, data deletion |
| **P1 — High** | Major feature broken, billing failure | < 1 hour | Transaction posting fails, login broken |
| **P2 — Medium** | Minor feature degraded, workaround exists | < 4 hours | Report rendering slow, export failing |
| **P3 — Low** | Cosmetic, minor UX issue | < 24 hours | UI glitch, typo, non-critical error |

## Incident Response Steps

### 1. Detect & Confirm
- Check Sentry for error spikes
- Check uptime monitoring alerts
- Check Supabase dashboard for database issues
- Confirm the issue is real (not user error or local)

### 2. Communicate
- Notify team via [communication channel]
- If user-facing: update status page or banner
- For P0/P1: send email to affected users if possible

### 3. Mitigate
- **Service down:** Check hosting platform status, restart if needed
- **Database issue:** Check Supabase dashboard, check connection pool
- **Auth issue:** Check Supabase Auth logs, verify RLS policies
- **Billing issue:** Check webhook delivery, verify payment provider status
- **Security breach:** Rotate keys immediately, check audit logs

### 4. Resolve
- Apply fix (code change, config change, or rollback)
- Verify fix in production
- Monitor for recurrence

### 5. Postmortem
- Document root cause
- Document timeline
- Document what went well and what to improve
- Create action items to prevent recurrence

## Rollback Procedure

### Frontend Rollback (Vercel/Cloudflare)
```bash
# Vercel
vercel rollback [deployment-url]

# Cloudflare Pages
# Revert to previous deployment via dashboard
```

### Database Rollback
⚠️ Database rollbacks are dangerous for accounting data. Prefer forward-fix.

```sql
-- Emergency: disable a problematic trigger
ALTER TABLE transactions DISABLE TRIGGER trigger_name;

-- Emergency: revoke a problematic function
REVOKE EXECUTE ON FUNCTION problematic_function(UUID) FROM authenticated;
```

### Environment Variable Rollback
```bash
# Revert to previous env vars in hosting platform dashboard
# Never delete env vars — set to previous values
```

## Specific Scenarios

### Database Connection Pool Exhaustion
1. Check Supabase dashboard → Database → Connection pool
2. Check for long-running queries: `SELECT * FROM pg_stat_activity WHERE state != 'idle'`
3. Kill stuck queries if needed
4. Consider upgrading Supabase plan

### Authentication Failure Spike
1. Check `login_attempts` table for patterns
2. Check for brute force attacks
3. Enable additional rate limiting if needed
4. Check Supabase Auth logs

### RLS Policy Violation
1. Check recent migrations for RLS changes
2. Test policies with `SET ROLE authenticated`
3. Verify `is_org_member()` function returns correct results
4. Fix policy and re-deploy migration

### Billing/Webhook Failure
1. Check payment provider dashboard for delivery status
2. Check `billing_events` table for recorded events
3. Manually process failed webhooks if needed
4. Re-send from provider dashboard

## Communication Templates

### Service Down Notice
```
Kami sedang mengalami gangguan layanan. Tim kami sedang bekerja
untuk memulihkan layanan secepatnya. Kami akan memberikan update
setiap 30 menit.

— Tim Ledjer
```

### Post-Incident Notice
```
Layanan telah pulih sepenuhnya. Gangguan terjadi selama [duration]
dan disebabkan oleh [brief description].

Kami telah mengambil langkah pencegahan untuk mencegah kejadian
serupa di masa depan.

— Tim Ledjer
```

## Contacts

| Role | Contact |
|------|---------|
| Primary responder | [owner name, email] |
| Backup responder | [backup name, email] |
| Supabase support | Via Supabase dashboard |
| Hosting support | Via hosting platform |
