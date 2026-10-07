#!/usr/bin/env bash
# Check bundle size halaman beranda agar gak terlalu gemuk.
# Ukur JS yang dimuat dari index.html (build output), batas default
# 900 KB (raw) — cukup untuk halaman beranda mobile di bawah 150 KB gzipped.
set -euo pipefail

DEFAULT_MAX_KB=900
MAX_KB=${BUNDLE_MAX_KB:-$DEFAULT_MAX_KB}

if [[ -n "${CI:-}" && "${CI:-}" == "1" ]]; then
  # CI runner dari workflow pekerjaan, di mana skrip dijalankan dari repo root.
  ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  cd "$ROOT"
fi

HTML="apps/web/dist/client/index.html"
ASSETS_DIR="apps/web/dist/client/assets"

if [[ ! -f "$HTML" ]]; then
  echo "[bundle] $HTML not found — skipping"
  exit 0
fi

if [[ ! -d "$ASSETS_DIR" ]]; then
  echo "[bundle] $ASSETS_DIR not found — skipping"
  exit 0
fi

raw=()

# HTML menyimpan /assets/<fingerprint>.js; yang diambil grep adalah full path.
while IFS= read -r asset; do
  rel="${asset#/}"
  full="$ASSETS_DIR/$(basename "$rel")"
  if [[ -f "$full" ]]; then
    raw+=("$(wc -c < "$full")")
  else
    echo "[bundle] WARN: script asset referenced in HTML missing: $asset" >&2
  fi
done < <(grep -oE '/assets/[A-Za-z0-9._-]+\.js' "$HTML" | sort -u)

if [[ ${#raw[@]} -eq 0 ]]; then
  echo "[bundle] No JS assets referenced in HTML"
  exit 0
fi

total_raw=0
for v in "${raw[@]}"; do
  total_raw=$((total_raw + v))
done
total_kb=$((total_raw / 1024))

# Di bawah batas ie11 (gzip raw < bronze LCP threshold) dianggap sehat;
# di atas itu bendera batas builder.
echo "[bundle] Total client JS referenced in HTML: ${total_kb} KB (raw)"
echo "[bundle] Limit: ${MAX_KB} KB"

if [[ "$total_kb" -gt "$MAX_KB" ]]; then
  echo "[bundle] FAIL — client bundle exceeds ${MAX_KB} KB"
  exit 1
fi

echo "[bundle] OK — client bundle within ${MAX_KB} KB"

