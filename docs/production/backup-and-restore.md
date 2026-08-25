# Backup and Restore

## Implementation

- **Schedule**: Daily at 03:00 UTC (10:00 WIB) - `wrangler.jsonc` crons `0 3 * * *` (UTC).
- **Destination**: R2 bucket (`BACKUP_BUCKET` binding), prefix `backups/`.
- **Format**: JSON export per major table (organizations, users, accounts, journal entries, products, etc.) with manifest.
- **Checksum**: SHA-256 per backup payload, recorded in manifest.
- **Retention**: 30 days (automatic cleanup in backup cycle).
- **RPO**: 24 hours (daily schedule).
- **RTO**: ~30 minutes (restore via validateBackup + sequential D1 inserts).
  - Not yet automated restore drill - manual restore only.
- **Validation**: `validateBackup()` - checks schema version, entity counts, SHA-256 match.
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
6. `verifyRestore()` returns `valid: true` and `schemaValid: true`.
7. `RestoreResult.warnings` is empty (no overwrite on populated DB).

## Restore Drill Implementation

The restore drill is implemented as a 7-step automated sequence:

```ts
// 1. Backup current state (if needed)
const manifest = await createBackup(db, bucket, Date.now());

// 2. List eligible backups (last 7 days)
const validBackups = await listEligibleBackups(bucket);

// 3. Validate backup integrity
const validation = await validateBackup(bucket, dateStr);

// 4. Restore to isolated DB (not same binding as production)
const result = await restoreBackup(targetDb, bucket, dateStr);

// 5. Verify restored schema
const verification = await verifyRestore(targetDb);

// 6. Run accounting invariants
const invariantsPass = verification.balancedJournals &&
                       verification.schemaValid;

// 7. Clean up + alert on failure
if (!result.success || !verification.valid) {
    await emitAlert({ severity: 'critical', source: 'restore-drill', result, verification });
}
```

## Alerting

`backup.service.ts` does NOT directly emit alerts. The restore code returns
result objects that monitoring tools must observe:

| Field | Meaning |
|-------|---------|
| `RestoreResult.success` | All tables restored without errors |
| `RestoreResult.errors` | Fatal errors (e.g., missing manifest, FK violations) |
| `RestoreResult.warnings` | Non-fatal issues (e.g., target DB had data) |
| `RestoreVerification.valid` | All post-restore checks passed |
| `RestoreVerification.schemaValid` | All core tables exist |
| `RestoreVerification.balancedJournals` | Σdebit = Σcredit |
| `RestoreVerification.errors[]` | Specific invariant failures |

Production monitoring MUST:
1. Pipe `RestoreResult.errors` into alert system (PagerDuty / Slack).
2. Alert on `RestoreVerification.valid === false`.
3. Track backup age (manifest.lastBackup > 36h → critical).
4. Run a restore drill weekly against an isolated D1 database.

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
