# Backup & Restore Runbook — Private Beta

## Backup Scope

| What | Why | How |
|------|-----|-----|
| Supabase Postgres database | All accounting data, auth users, RLS policies | Supabase Dashboard → Database → Backups |
| Supabase Auth users | Beta user accounts, sessions | Included in database backup (auth schema) |
| Supabase Storage buckets | Attachments if used (not currently implemented) | Supabase Dashboard → Storage → Buckets |
| Frontend code | Static hosting deploy | Git repository (already version-controlled) |

## Daily Backup Procedure

### Option 1: Supabase Dashboard (Recommended for Private Beta)

1. Go to Supabase Dashboard → Database → Backups.
2. Click **"Download backup"** or **"Create backup"** (if available on your plan).
3. Save the backup file to a secure location (e.g., encrypted drive, shared vault).

### Option 2: pg_dump via CLI

```bash
# Replace placeholders — do NOT commit real credentials
pg_dump \
  "postgresql://postgres:<password>@<host>:<port>/<database>" \
  --format=custom \
  --file="backup-ledjer-$(date +%Y%m%d).dump"
```

**Never hardcode passwords in scripts.** Use environment variables or a secrets manager.

### Option 3: Supabase CLI

```bash
# Link to your project (one-time setup)
supabase link --project-ref <your-project-ref>

# Dump the database
supabase db dump --file="backup-ledjer-$(date +%Y%m%d).sql"
```

## Backup Frequency — Private Beta Recommendation

| Backup Type | Frequency | Retention |
|-------------|-----------|-----------|
| Supabase automatic | Daily (included in plan) | 7 days (free tier) |
| Manual pg_dump | Weekly minimum | 30 days |
| Before migration | Always | Until verified |

For private beta with small user count, weekly manual backups plus Supabase automatic backups are sufficient.

## Restore Drill on Staging

**Never restore directly to production without testing on staging first.**

### Procedure

1. Create a staging Supabase project (or use a separate branch).
2. Apply the same migrations as production.
3. Restore the backup to the staging project:

```bash
# Using pg_restore
pg_restore \
  --dbname="postgresql://postgres:<password>@<staging-host>:<port>/<database>" \
  --no-owner \
  --no-privileges \
  "backup-ledjer-YYYYMMDD.dump"
```

4. Verify restored data:
   - Row counts in key tables (`organizations`, `transactions`, `journal_lines`)
   - Auth users exist
   - RLS policies still present
   - Frontend can load and display data

## Production Restore Emergency Checklist

> ⚠️  **STOP.** Ensure you have approval from the project owner before restoring production data. A restore overwrites current data.

1. [ ] Confirm approval from project owner.
2. [ ] Notify all beta users of downtime.
3. [ ] Take a fresh backup of current state (even if corrupted — you may need it).
4. [ ] Identify the backup file to restore (confirm date/time).
5. [ ] Run restore to production:

```bash
pg_restore \
  --dbname="postgresql://postgres:<password>@<prod-host>:<port>/<database>" \
  --no-owner \
  --no-privileges \
  --clean \
  "backup-ledjer-YYYYMMDD.dump"
```

6. [ ] Verify data integrity (see verification section below).
7. [ ] Test frontend connectivity and basic flows.
8. [ ] Notify users that service is restored.
9. [ ] Document what happened and why in an incident log.

## Verification After Restore

```sql
-- Check key row counts
SELECT 'organizations' AS tbl, COUNT(*) FROM organizations
UNION ALL
SELECT 'transactions', COUNT(*) FROM transactions
UNION ALL
SELECT 'journal_lines', COUNT(*) FROM journal_lines
UNION ALL
SELECT 'members', COUNT(*) FROM members;

-- Check auth users
SELECT id, email, created_at FROM auth.users LIMIT 5;

-- Check RLS is still enabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('transactions', 'journal_entries', 'journal_lines', 'audit_logs');
-- All should show rowsecurity = true
```

## RPO / RTO Recommendations

| Metric | Recommendation | Notes |
|--------|----------------|-------|
| **RPO** (Recovery Point Objective) | 24 hours | Acceptable for private beta with small user count |
| **RTO** (Recovery Time Objective) | 2 hours | Time to restore from backup and verify |

For public launch, consider hourly backups and < 1 hour RTO.

## Risks and Limitations

- Supabase free tier retains automatic backups for only 7 days.
- Manual pg_dump captures data but not Supabase platform configuration (auth settings, Edge Functions).
- Storage bucket contents may need separate backup if attachments are used.
- Restore may break if migrations have been applied after the backup was taken.
- Auth user passwords are hashed — restore preserves them but does not reset them.

## Who Can Perform Restore

- **Private beta:** Project owner only.
- **Must be performed via:** Supabase SQL Console or `pg_dump`/`pg_restore` CLI with service role credentials.
- **Never via:** Frontend code, CI pipeline, or untrusted scripts.
