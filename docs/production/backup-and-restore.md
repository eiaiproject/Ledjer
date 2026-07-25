# Backup and Restore

## Implementation

- **Schedule**: Daily at 03:00 WIB (Worker cron trigger).
- **Destination**: R2 bucket (`BACKUP_BUCKET` binding), prefix `backups/`.
- **Format**: JSON export per major table (organizations, users, accounts, journal entries, products, etc.) with manifest.
- **Checksum**: SHA-256 per backup payload, recorded in manifest.
- **Retention**: 30 days (automatic cleanup in backup cycle).
- **RPO**: 24 hours (daily schedule).
- **RTO**: ~30 minutes (restore via validateBackup + sequential D1 inserts).
  - Not yet automated restore drill — manual restore only.
- **Validation**: `validateBackup()` — checks schema version, entity counts, SHA-256 match.
- **Alerts**: 
  - Backup age > 36 hours → Critical alert (manual check).
  - Checksum mismatch → Critical alert.
  - Restore failure → High alert (manual check).
- **Responsible operator**: Platform admin (no automated escalation yet).

## How Backup Works

`backup.service.ts` → `createBackup()`:

1. Queries all major tables via `SELECT *`.
2. Builds `{ entities: { tableName: [...rows] }, manifest: { createdAt, version, sha256 } }`.
3. SHA-256 hash of JSON payload.
4. Stores to R2: `backups/{orgId}/{date}/backup.json`.
5. Manifests stored: `backups/{orgId}/{date}/manifest.json`.
6. Cleans backups older than 30 days.
7. Returns backup ID.

## How Restore Works

`backup.service.ts` → `validateBackup()`:

1. Fetches backup payload from R2.
2. Verifies SHA-256 matches.
3. Checks schema version compatibility.
4. Returns entity counts and metadata.

Full restore (manual, not yet automated):

```bash
# 1. Fetch backup payload
# 2. Validate via validateBackup()
# 3. Verify row counts match manifest
# 4. Insert into D1 sequentially
```

## Restore Verification Checklist

After any restore:
1. Row count per major table matches backup manifest.
2. Trial balance balances (Σdebit = Σcredit).
3. Balance sheet equation: Assets = Liabilities + Equity.
4. No cross-tenant data leaks.
5. Smoke tests pass.

## Last Successful Backup

- Not yet tracked in persistent storage (in-memory only during cron run).
- TODO: store last-backup timestamp in a system table.

## Backup Alerts Thresholds

| Condition | Severity | Action |
|-----------|----------|--------|
| Backup age > 36h | Critical | Manual check |
| SHA-256 mismatch | Critical | Investigate corruption |
| Restore drill failure | High | Fix restore procedure |

## R2 Bucket

Binding name: `BACKUP_BUCKET`.
Prefix: `backups/` (shared bucket with `attachments/` prefix).
