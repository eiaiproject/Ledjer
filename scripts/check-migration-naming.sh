#!/usr/bin/env bash
# =============================================================================
# check-migration-naming.sh
# Validates migration filenames are canonical and unique.
# Canonical format: YYYYMMDDHHMMSS_descriptive_name.sql
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MIGRATIONS_DIR="$ROOT/supabase/migrations"

if [[ ! -d "$MIGRATIONS_DIR" ]]; then
  echo "❌ Migrations directory not found: $MIGRATIONS_DIR" >&2
  exit 1
fi

cd "$MIGRATIONS_DIR"

ERRORS=0

# Check 1: All files must match YYYYMMDDHHMMSS_name.sql pattern
for f in *.sql; do
  if [[ ! "$f" =~ ^[0-9]{14}_[a-z0-9_]+\.sql$ ]]; then
    echo "❌ Invalid migration name: $f" >&2
    echo "   Expected: YYYYMMDDHHMMSS_descriptive_name.sql" >&2
    ERRORS=$((ERRORS + 1))
  fi
done

# Check 2: No duplicate timestamps
TIMESTAMPS=$(ls *.sql | cut -d'_' -f1 | sort)
DUPES=$(echo "$TIMESTAMPS" | uniq -d)

if [[ -n "$DUPES" ]]; then
  echo "❌ Duplicate migration timestamps found:" >&2
  for ts in $DUPES; do
    echo "   $ts: $(ls ${ts}_*.sql | tr '\n' ', ')" >&2
  done
  ERRORS=$((ERRORS + 1))
fi

# Check 3: Files are in chronological order
PREV=""
for f in *.sql; do
  TS=$(echo "$f" | cut -d'_' -f1)
  if [[ -n "$PREV" && "$TS" < "$PREV" ]]; then
    echo "❌ Migration order violation: $f (timestamp $TS) comes after $PREV" >&2
    ERRORS=$((ERRORS + 1))
  fi
  PREV="$TS"
done

if [[ $ERRORS -eq 0 ]]; then
  echo "✅ Migration naming is valid: $(ls *.sql | wc -l | tr -d ' ') files, all canonical, no duplicates"
else
  echo "" >&2
  echo "❌ Found $ERRORS migration naming issues" >&2
  exit 1
fi
