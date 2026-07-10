# Incident Response Runbook

Last updated: 2026-06-27

## Severity Definitions

| Severity | Description | Response Time | Example |
|----------|-------------|---------------|---------|
| **P0 — Critical** | Service down, data loss risk, security breach | Immediate (< 15 min) | Database outage, auth bypass, data deletion |
| **P1 — High** | Major feature broken | < 1 hour | Transaction posting fails, login broken |
| **P2 — Medium** | Minor feature degraded, workaround exists | < 4 hours | Report rendering slow, export failing |
| **P3 — Low** | Cosmetic, minor UX issue | < 24 hours | UI glitch, typo, non-critical error |

## Incident Response Steps

### 1. Detect & Confirm
- Check Sentry for error spikes
- Check uptime monitoring alerts
- Check Cloudflare dashboard for Worker/D1 issues
- Confirm the issue is real (not user error or local)

### 2. Communicate
- Notify team via [communication channel]
- If user-facing: update status page or banner
- For P0/P1: send email to affected users if possible

### 3. Mitigate
- **Service down:** Check hosting platform status, restart if needed
- **Database issue:** Check D1 status, recent migrations, and Worker logs
- **Auth issue:** Check Worker auth logs and session/token tables
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

### Worker Rollback
```bash
pnpm --filter web exec wrangler deployments list
cd apps/web && pnpm exec wrangler rollback
```

### Database Rollback
⚠️ Database rollbacks are dangerous for accounting data. Prefer forward-fix.

```sql
-- Emergency: disable a problematic trigger
-- Prefer forward-fix migrations for accounting data.
-- For D1, restore from a verified backup/snapshot only after impact review.
```

### Environment Variable Rollback
```bash
# Revert to previous env vars in hosting platform dashboard
# Never delete env vars — set to previous values
```

## Specific Scenarios

### Authentication Failure Spike
1. Check `login_attempts` table for patterns
2. Check for brute force attacks
3. Tighten Worker auth throttling if needed
4. Check session revocation and token cleanup

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
| Cloudflare support | Via Cloudflare dashboard |
