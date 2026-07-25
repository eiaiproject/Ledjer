# Disaster Recovery & Backup Documentation

## Overview

Ledjer uses Cloudflare D1 for its primary database and Cloudflare R2 for backup storage.
Backups are created automatically via a scheduled Cloudflare Worker cron trigger and can be
restored manually using scripts or the Worker `restoreBackup` function.

---

## Backup Specifications

| Property | Value |
|---|---|
| **Backup method** | D1-to-R2 via SQL `SELECT *` (JSON serialization per table) |
| **Backup frequency** | Daily at 03:00 UTC (configurable via Worker cron trigger) |
| **Retention** | 30 days (automatic cleanup of backups older than 30 days) |
| **Storage** | Cloudflare R2 bucket (`BACKUP_BUCKET` env var) |
| **Backup format** | Per-table JSON files + manifest with SHA-256 checksum |
| **Versioning** | Backup manifest version `1` (incremented on schema changes) |

### Recovery Point Objective (RPO)

- **Standard:** Up to 24 hours (daily backup at 03:00 UTC)
- **Optimistic:** If the D1 database is still accessible, the most recent transactions since the last backup are recoverable from the live database
- **Worst case:** 24 hours of data loss if the D1 database is unrecoverable

### Recovery Time Objective (RTO)

| Scenario | Estimated RTO | Notes |
|---|---|---|
| Restore to empty D1 (no existing data) | ~5–15 minutes | Depends on data volume; `restoreBackup` uses batched inserts of 50 rows |
| Restore over existing D1 (data replacement) | ~10–20 minutes | Includes `DELETE FROM` each table before insert |
| Restore drill validation (read-only check) | ~1–3 minutes | `runRestoreDrill` validates backup without touching live DB |
| Full restore + verify | ~10–20 minutes | `restoreBackup` + `verifyRestore` run sequentially |

### Measured Metrics

| Metric | Current Value |
|---|---|
| Last successful backup | Check cron logs: `type: "backup" status: "completed"` |
| Last successful restore drill | Check cron logs: `type: "restore_drill" status: "passed"` |
| Last full restore test | Run manually against a dev D1 database |

> **Note:** These metrics are tracked via structured logging in the scheduled cron handler.
> To check the latest results, query the Worker logs for entries with `type: "backup"`
> or `type: "restore_drill"`.

---

## Backup Implementation

### Automatic (Scheduled)

The Cloudflare Worker runs a cron trigger daily at 03:00 UTC that:

1. Runs `cleanupExpiredRows()` (session/token cleanup)
2. Creates a full database backup via `createBackup()` to R2
3. Logs backup completion with table count and row count
4. Runs `runRestoreDrill()` to validate the backup integrity
5. Logs drill result (pass/fail, entity counts, errors)

### Manual (CLI)

```bash
# Remote (production) backup
bash scripts/backup-d1.sh

# Local (development) backup
bash scripts/backup-d1.sh --local

# Manual backup to R2 (alternative)
bash scripts/backup.sh --db ledjer-production --bucket ledjer-backups
```

---

## Restore Procedures

### Automated (Worker Function)

Use `restoreBackup(db, bucket, dateStr)` to restore from a specific backup date.
The function:

1. Validates backup integrity (manifest, SHA-256, row counts)
2. Checks if target database already has data (warns but proceeds)
3. Clears existing data from all core tables (in reverse FK order)
4. Inserts backup data in batches of 50 rows
5. Returns success/failure with per-table counts

### Manual (CLI)

```bash
# Restore from SQL dump to remote D1
bash scripts/restore-d1.sh <backup-file.sql> --db ledjer-production

# Restore from SQL dump to local D1
bash scripts/restore-d1.sh <backup-file.sql> --db ledjer-dev
```

### Restore Drill (Read-Only Validation)

The `runRestoreDrill(bucket)` function validates backup integrity without restoring
to a live database. It runs automatically after every cron backup and validates:

1. Backup manifest existence and completeness
2. SHA-256 checksum integrity
3. Table data file existence and row count consistency
4. Transaction-to-journal-entry linkage (no orphan transactions)
5. Journal entry balance (each entry's debits = credits)
6. Trial balance (sum of all debits = sum of all credits)

For a full end-to-end restore test against an isolated database:

```bash
# Restore to a dev or staging D1 database, then verify
# 1. Restore
wrangler d1 execute ledjer-dev --file=<backup-file> --local
# 2. Run verifyRestore via the Worker (requires calling the function directly)
#    or run manual SQL checks:
wrangler d1 execute ledjer-dev --command="SELECT COUNT(*) FROM organizations" --local
wrangler d1 execute ledjer-dev --command="SELECT COUNT(*) FROM transactions" --local
wrangler d1 execute ledjer-dev --command="SELECT COUNT(*) FROM journal_entries" --local
```

---

## Operational Responsibilities

| Role | Responsibility |
|---|---|
| **System operator** | Ensure `BACKUP_BUCKET` env var is configured in production |
| **System operator** | Monitor cron logs for backup/drill failures |
| **Engineering team** | Review restore drill results weekly |
| **Engineering team** | Run full restore test to isolated DB monthly |
| **On-call engineer** | Execute restore procedure during incident |

---

## Alerting

Backup failures and restore drill failures are captured via:

1. **Structured logging**: All backup and drill events are logged as JSON with
   `type`, `status`, and `errors` fields. These logs are queryable in Cloudflare
   dashboard or log streams.
2. **Error capture**: Backup failures in the cron handler emit `console.error`
   with structured JSON for log aggregation tools.

### Failure Scenarios

| Symptom | Likely Cause | Action |
|---|---|---|
| `manifest not found` | R2 bucket misconfigured or permissions missing | Check `BACKUP_BUCKET` env var |
| `restore failed for <table>` | Schema mismatch or constraint violation | Run migration check, verify backup version |
| `trial balance off` | Data corruption or incomplete backup | Investigate backup data, restore from earlier date |
| `no backups found` | First run or retention cleanup removed all | Wait for next scheduled backup |
| Unbalanced journal entries | Data integrity issue | Investigate the specific journal entries |

---

## Escalation Procedure

1. **Level 1** (System operator): Check Worker logs for backup/drill errors.
   Retry the backup manually if it failed.
2. **Level 2** (Engineering): If restore drill fails with accounting integrity
   errors, investigate the backup data and determine if an earlier backup
   snapshot is valid.
3. **Level 3** (Engineering lead): If all backups are invalid or inaccessible,
   initiate data recovery from D1 export or contact Cloudflare support.

---

## Future Improvements

- [ ] Full end-to-end restore test in CI against a temporary D1 database
- [ ] Automated notification (email/Slack) on backup failure
- [ ] Point-in-time recovery via D1 database branching (when available)
- [ ] Backup encryption at rest in R2
- [ ] Cross-region backup replication
- [ ] Automated restore test with golden data comparison
