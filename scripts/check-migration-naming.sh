#!/usr/bin/env bash
# =============================================================================
# check-migration-naming.sh
# Validates Cloudflare D1 migration filenames are canonical and ordered.
# Canonical format: NNNN_descriptive_name.sql
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MIGRATIONS_DIR="$ROOT/apps/web/worker/db/migrations"

if [[ ! -d "$MIGRATIONS_DIR" ]]; then
  echo "ERROR: Migrations directory not found: $MIGRATIONS_DIR" >&2
  exit 1
fi

cd "$MIGRATIONS_DIR"

ERRORS=0
shopt -s nullglob
FILES=(*.sql)

if [[ ${#FILES[@]} -eq 0 ]]; then
  echo "ERROR: No migration files found in $MIGRATIONS_DIR" >&2
  exit 1
fi

SEEN_PREFIXES=()
SEEN_FILES=()
PREV_NUM=0
PREV_FILE=""

for f in "${FILES[@]}"; do
  if [[ ! "$f" =~ ^[0-9]{4}_[a-z0-9_]+\.sql$ ]]; then
    echo "ERROR: Invalid migration name: $f" >&2
    echo "       Expected: NNNN_descriptive_name.sql" >&2
    ERRORS=$((ERRORS + 1))
    continue
  fi

  PREFIX="${f%%_*}"
  NUM=$((10#$PREFIX))

  for i in "${!SEEN_PREFIXES[@]}"; do
    if [[ "${SEEN_PREFIXES[$i]}" == "$PREFIX" ]]; then
      echo "ERROR: Duplicate migration prefix: $PREFIX ($f and ${SEEN_FILES[$i]})" >&2
      ERRORS=$((ERRORS + 1))
    fi
  done
  SEEN_PREFIXES+=("$PREFIX")
  SEEN_FILES+=("$f")

  if [[ -n "$PREV_FILE" && "$NUM" -le "$PREV_NUM" ]]; then
    echo "ERROR: Migration order violation: $f comes after $PREV_FILE" >&2
    ERRORS=$((ERRORS + 1))
  fi

  PREV_NUM="$NUM"
  PREV_FILE="$f"
done

if [[ $ERRORS -eq 0 ]]; then
  echo "OK: D1 migration naming is valid: ${#FILES[@]} files"
else
  echo "" >&2
  echo "ERROR: Found $ERRORS migration naming issue(s)" >&2
  exit 1
fi
