#!/usr/bin/env bash
# Restore Ledjer D1 database from backup
# Usage:
#   bash scripts/restore-d1.sh <backup-file> [--db ledjer-production]
#
# The backup file should be a SQL dump created by backup-d1.sh --local
# or downloaded from R2 (for production).
#
# For production D1, use:
#   wrangler d1 execute ledjer-production --file=<backup-file> --remote
#
# For local dev D1, use:
#   wrangler d1 execute ledjer-dev --file=<backup-file> --local
#
# CAUTION: This REPLACES the database. Run against a test instance first.

set -euo pipefail

BACKUP_FILE="${1:-}"
DB_NAME="${2:-ledjer-production}"

if [ -z "$BACKUP_FILE" ]; then
  echo "Usage: $0 <backup-file> [--db ledjer-production]"
  echo ""
  echo "Example:"
  echo "  $0 backups/ledjer-2026-01-15.sql --db ledjer-dev"
  exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo "Backup file not found: $BACKUP_FILE"
  exit 1
fi

echo "⚠️  About to restore $BACKUP_FILE to D1 database: $DB_NAME"
echo "   This will REPLACE all data in $DB_NAME."
echo "   Press Ctrl+C to cancel, or wait 5 seconds to continue..."
sleep 5

echo "Restoring..."
wrangler d1 execute "$DB_NAME" --file="$BACKUP_FILE" --remote
echo "✅ Restore complete: $DB_NAME from $BACKUP_FILE"
echo ""
echo "Verify: run 'wrangler d1 execute \"$DB_NAME\" --command=\"SELECT COUNT(*) FROM transactions\" --remote'"
