#!/usr/bin/env bash
# =============================================================================
# rename-migrations.sh
# Rename migration files from YYYYMMDD_HHMMSS_name.sql to YYYYMMDDHHMMSS_name.sql
# Usage: Run once, then delete this script.
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MIGRATIONS_DIR="$ROOT/supabase/migrations"

cd "$MIGRATIONS_DIR"

RENAMED=0
for f in *.sql; do
  # Check if filename matches old format (has underscore between date and time)
  if [[ "$f" =~ ^[0-9]{8}_[0-9]{6}_ ]]; then
    newname=$(echo "$f" | sed 's/_\([0-9]\{6\}\)/\1/')
    mv "$f" "$newname"
    echo "Renamed: $f -> $newname"
    RENAMED=$((RENAMED + 1))
  fi
done

if [[ $RENAMED -eq 0 ]]; then
  echo "No files needed renaming."
else
  echo "Renamed $RENAMED files."
fi
