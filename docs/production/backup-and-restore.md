# Backup and Restore

## Current State

Automated D1 backups are not yet implemented. This document describes the
target architecture and manual restore procedure.

## Target Architecture

- **Schedule**: Daily at 03:00 WIB (via Worker cron trigger).
- **Destination**: Cloudflare R2 bucket `ledjer-backups`.
- **Format**: SQL dump via `wrangler d1 export`.
- **Checksum**: SHA-256 per backup file.
- **Retention**:
  - Daily backups: 30 days.
  - Monthly backups: 12 months.
- **Verification**: Monthly automated restore drill with row-count and
  accounting-invariant checks.

## Manual Backup (Current)

```bash
# Requires wrangler CLI and Cloudflare credentials
# Replace <database-name> with the actual D1 database name

# Export to SQL
npx wrangler d1 export <database-name> --output /tmp/ledjer-backup-$(date +%Y%m%d).sql

# Generate checksum
sha256sum /tmp/ledjer-backup-$(date +%Y%m%d).sql > /tmp/ledjer-backup-$(date +%Y%m%d).sha256

# Upload to R2 (requires R2 bucket configured)
# npx wrangler r2 object put ledjer-backups/$(date +%Y%m%d)/backup.sql --file /tmp/ledjer-backup-$(date +%Y%m%d).sql
```

## Manual Restore

```bash
# 1. Download backup from R2
npx wrangler r2 object get ledjer-backups/<date>/backup.sql --file /tmp/restore.sql

# 2. Verify checksum
sha256sum -c /tmp/restore-backup-<date>.sha256

# 3. Restore to D1 (warning: overwrites current data)
# wrangler d1 execute <database-name> --file /tmp/restore.sql

# 4. Verify row counts match expected
# 5. Run accounting invariant checks
# 6. Run tenant isolation checks
# 7. Run smoke tests
```

## Restore Verification

After any restore:
1. Check row count for each major table matches backup manifest.
2. Verify trial balance balances (Σdebit = Σcredit).
3. Verify balance sheet equation (Assets = Liabilities + Equity).
4. Verify no cross-tenant data leaks.
5. Run smoke tests against the restored database.

## R2 Bucket Setup

```bash
# Create bucket (one-time)
npx wrangler r2 bucket create ledjer-backups

# Add R2 binding to wrangler.jsonc
```

## Backup Alerts

- Backup age > 36 hours → Critical alert.
- Backup checksum mismatch → Critical alert.
- Restore drill failure → High alert.
