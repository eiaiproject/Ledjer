# Backup & Restore — Ledjer D1 Database

## Backup

### Automated (via cron)

The `scripts/backup-d1.sh` script exports the production D1 database to a timestamped SQL file.

```bash
bash scripts/backup-d1.sh          # remote (production)
bash scripts/backup-d1.sh --local  # local (dev)
```

**Recommendation:** Schedule daily via Cloudflare Cron Trigger or external cron at 03:00 WIB.

### Manual

```bash
npx wrangler d1 export ledjer-production --remote --output=backup-$(date +%Y%m%d-%H%M).sql
```

**Retention:** Keep daily backups for 30 days. Older backups may be archived or deleted.

## Restore

### From a backup SQL file

```bash
npx wrangler d1 execute ledjer-production --remote --file=backup-20250101-0300.sql
```

### Restore checklist

1. **Stop the app** — disable the Worker route in Cloudflare dashboard or set `maintenance` mode.
2. **Verify the backup file** — check file size > 0 and SQL syntax (`head -5 backup.sql`).
3. **Run restore** — `wrangler d1 execute ledjer-production --remote --file=<backup>.sql`.
4. **Verify** — `wrangler d1 execute ledjer-production --remote --command="SELECT count(*) FROM users;"`
5. **Re-enable the app.**

## RPO / RTO Targets

| Metric | Target      |
|--------|-------------|
| RPO    | ≤ 24 hours  |
| RTO    | ≤ 1 hour    |

## Cron Trigger (Cloudflare Worker)

The Worker's `scheduled` handler (defined in `apps/web/worker/index.ts`) runs `cleanupExpiredRows` daily at 03:00 WIB. Backup is **not** live-migrated — use the CLI script or R2 upload separately until automated R2 backup is implemented.

## Future

- [ ] Store backups in R2 via a dedicated cron Worker.
- [ ] Monitor backup success/failure via Sentry.
