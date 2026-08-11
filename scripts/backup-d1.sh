#!/usr/bin/env bash
# Backup the Ledjer D1 database (remote or local).
# Usage:
#   bash scripts/backup-d1.sh               # remote backup
#   bash scripts/backup-d1.sh --local        # local (dev) backup
set -euo pipefail

MODE="${1:-remote}"
FLAG="--remote"
if [[ "$MODE" == "--local" ]]; then
  FLAG="--local"
  echo "[backup] Using local D1 database"
else
  echo "[backup] Using remote D1 database"
fi

TIMESTAMP=$(date +%Y%m%d-%H%M)
OUTPUT="backup-ledjer-${TIMESTAMP}.sql"

cd "$(dirname "$0")/.."

echo "[backup] Exporting D1 database to $OUTPUT ..."
npx wrangler d1 export ledjer-production --output "$OUTPUT" $FLAG

echo "[backup] Done — $OUTPUT ($(wc -c < "$OUTPUT") bytes)"
