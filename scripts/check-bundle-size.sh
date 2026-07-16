#!/usr/bin/env bash
# Check that the total client JS bundle stays under 750 KB.
set -euo pipefail

MAX_KB=750
DIR="dist/client/assets"

if [[ ! -d "$DIR" ]]; then
  echo "[bundle] $DIR not found — skipping"
  exit 0
fi

TOTAL=0
for f in "$DIR"/*.js; do
  size=$(wc -c < "$f")
  TOTAL=$((TOTAL + size))
done

TOTAL_KB=$((TOTAL / 1024))
echo "[bundle] Total JS: ${TOTAL_KB} KB (limit: ${MAX_KB} KB)"

if [[ "$TOTAL_KB" -gt "$MAX_KB" ]]; then
  echo "[bundle] FAIL — bundle exceeds ${MAX_KB} KB"
  exit 1
fi

echo "[bundle] OK"
