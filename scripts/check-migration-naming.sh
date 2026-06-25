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
shopt -s nullglob
FILES=(*.sql)

# Self-test sample that must be rejected by this guard:
#   2026070100000_bad.sql        # 13-digit prefix, mixed width
#   20260701000000_good.sql      # 14-digit prefix

if [[ ${#FILES[@]} -eq 0 ]]; then
  echo "❌ No migration files found in $MIGRATIONS_DIR" >&2
  exit 1
fi

# Check 1: All files must match YYYYMMDDHHMMSS_name.sql pattern
for f in "${FILES[@]}"; do
  if [[ ! "$f" =~ ^[0-9]{14}_[a-z0-9_]+\.sql$ ]]; then
    echo "❌ Invalid migration name: $f" >&2
    echo "   Expected: YYYYMMDDHHMMSS_descriptive_name.sql" >&2
    ERRORS=$((ERRORS + 1))
  fi
done

# Check 2: No duplicate timestamps
declare -a TIMESTAMPS=()
declare -a DUPES=()

for f in "${FILES[@]}"; do
  TS="${f%%_*}"
  TIMESTAMPS+=("$TS")
done

PREV_DUP_CHECK=""
LAST_DUPE=""
while IFS= read -r TS; do
  if [[ -n "$TS" && "$TS" == "$PREV_DUP_CHECK" && "$TS" != "$LAST_DUPE" ]]; then
    DUPES+=("$TS")
    LAST_DUPE="$TS"
  fi
  PREV_DUP_CHECK="$TS"
done <<< "$(printf '%s\n' "${TIMESTAMPS[@]}" | sort)"

if [[ ${#DUPES[@]} -gt 0 ]]; then
  echo "❌ Duplicate migration timestamps found:" >&2
  for ts in "${DUPES[@]}"; do
    MATCHING=()
    for f in "${FILES[@]}"; do
      [[ "${f%%_*}" == "$ts" ]] && MATCHING+=("$f")
    done
    echo "   $ts: ${MATCHING[*]}" >&2
  done
  ERRORS=$((ERRORS + 1))
fi

# Check 3: Files are in strictly increasing chronological order.
# Prefix width is validated above; compare as base-10 integers to avoid a
# future mixed-width name silently reordering the apply sequence.
PREV_TS=""
PREV_FILE=""
for f in "${FILES[@]}"; do
  TS="${f%%_*}"
  if [[ -n "$PREV_TS" ]]; then
    TS_NUM=$((10#$TS))
    PREV_NUM=$((10#$PREV_TS))
    if (( TS_NUM <= PREV_NUM )); then
      echo "❌ Migration order violation: $f (timestamp $TS) comes after $PREV_FILE (timestamp $PREV_TS)" >&2
      ERRORS=$((ERRORS + 1))
    fi
  fi
  PREV_TS="$TS"
  PREV_FILE="$f"
done

# Check 4: Explicitly reject non-14-digit prefixes before any future arithmetic.
for f in "${FILES[@]}"; do
  TS="${f%%_*}"
  if [[ ! "$TS" =~ ^[0-9]{14}$ ]]; then
    echo "❌ Migration timestamp must be exactly 14 digits: $f" >&2
    ERRORS=$((ERRORS + 1))
  fi
done

if [[ $ERRORS -eq 0 ]]; then
  echo "✅ Migration naming is valid: ${#FILES[@]} files, all canonical, strictly increasing, no duplicates"
else
  echo "" >&2
  echo "❌ Found $ERRORS migration naming issues" >&2
  exit 1
fi
