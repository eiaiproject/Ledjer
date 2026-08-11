#!/usr/bin/env bash
# Daily D1 database backup to R2
# Usage: ./scripts/backup.sh [--db ledjer-production] [--bucket ledjer-backups]
set -euo pipefail

DB="${DB:-ledjer-production}"
BUCKET="${BUCKET:-ledjer-backups}"
DATE=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="/tmp/${DB}-${DATE}.sql"

echo "[backup] Exporting ${DB} (remote)..."
npx wrangler d1 export "${DB}" --remote --output "${BACKUP_FILE}" --no-prompt 2>/dev/null

echo "[backup] Uploading to r2://${BUCKET}/${DB}/"
npx wrangler r2 object put "${BUCKET}/${DB}/${DATE}.sql" --file "${BACKUP_FILE}" --local 2>/dev/null || \
  npx wrangler r2 object put "${BUCKET}/${DB}/${DATE}.sql" --file "${BACKUP_FILE}"

echo "[backup] Uploading checksum..."
sha256sum "${BACKUP_FILE}" | npx wrangler r2 object put "${BUCKET}/${DB}/${DATE}.sha256" --file - 2>/dev/null || \
  sha256sum "${BACKUP_FILE}" > "${BACKUP_FILE}.sha256" && \
  npx wrangler r2 object put "${BUCKET}/${DB}/${DATE}.sha256" --file "${BACKUP_FILE}.sha256"

rm -f "${BACKUP_FILE}" "${BACKUP_FILE}.sha256"
echo "[backup] Done: ${DB} → ${BUCKET}/${DB}/${DATE}.sql"
