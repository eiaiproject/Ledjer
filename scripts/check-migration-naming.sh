#!/usr/bin/env bash
# Enforce D1 migration filename convention: NNNN_snake_case.sql
# NNNN = 4-digit sequence, no gaps from the highest existing.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
dir="$root/apps/web/worker/db/migrations"

if [[ ! -d "$dir" ]]; then
  echo "ERROR: migrations dir not found: $dir" >&2
  exit 1
fi

fail=0
shopt -s nullglob
files=( "$dir"/*.sql )
shopt -u nullglob

if (( ${#files[@]} == 0 )); then
  echo "OK: no migrations to check"
  exit 0
fi

names=()
nums=()
for f in "${files[@]}"; do
  base="$(basename "$f")"
  name="${base%.sql}"
  if [[ ! "$name" =~ ^([0-9]{4})_([a-z0-9][a-z0-9_]*)$ ]]; then
    echo "FAIL: bad name '$base' (expected NNNN_snake_case.sql)" >&2
    fail=1
    continue
  fi
  nums+=( "${BASH_REMATCH[1]}" )
  names+=( "$base" )
done

# Check uniqueness
sorted_unique="$(printf '%s\n' "${nums[@]}" | sort -u | wc -l | tr -d ' ')"
total="${#nums[@]}"
if [[ "$sorted_unique" != "$total" ]]; then
  echo "FAIL: duplicate sequence numbers among migrations" >&2
  fail=1
fi

# Check no gaps in the contiguous sequence from 1
max=0
for n in "${nums[@]}"; do
  n_dec=$((10#$n))
  (( n_dec > max )) && max=$n_dec
done
expected="$(seq -f '%04g' 1 "$max" | sort)"
have="$(for n in "${nums[@]}"; do printf '%04d\n' "$((10#$n))"; done | sort -u)"
if [[ "$expected" != "$have" ]]; then
  echo "FAIL: gaps in migration sequence." >&2
  diff <(echo "$expected") <(echo "$have") >&2 || true
  fail=1
fi

# Sanity: files must not contain dollar-quoted DO $$ ... $$ blocks
# (D1 supports them but we forbid per repo policy)
for f in "${files[@]}"; do
  if grep -nE 'DO[[:space:]]*\$\$' "$f" >/dev/null 2>&1; then
    echo "FAIL: $f uses DO \$\$ block (forbidden by repo policy)" >&2
    fail=1
  fi
done

if [[ "$fail" -ne 0 ]]; then
  exit 1
fi

echo "OK: ${#files[@]} migration(s) named correctly, sequence 1..$max contiguous"
