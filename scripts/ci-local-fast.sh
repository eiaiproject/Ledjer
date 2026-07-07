#!/usr/bin/env bash
# =============================================================================
# ci-local-fast.sh — Fast local CI for Cloudflare-native Ledjer
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

readonly SEPARATOR='═══════════════════════════════════════════════════════════════'

section() {
  local msg="$1"
  echo ""
  echo "$SEPARATOR"
  echo "  $msg"
  echo "$SEPARATOR"
}

section "1/8  pnpm install --frozen-lockfile"
if ! command -v pnpm >/dev/null 2>&1; then
  corepack enable >/dev/null 2>&1 || true
fi
pnpm install --frozen-lockfile

section "2/8  TypeScript typecheck"
pnpm --filter web typecheck

section "3/8  ESLint"
pnpm --filter web lint

section "4/8  Vitest unit tests"
pnpm --filter web test

section "5/8  Production build"
pnpm --filter web build

section "6/8  Build secrets scan"
bash scripts/check-build-secrets.sh

section "7/8  D1 migration naming guard"
bash scripts/check-migration-naming.sh

section "8/8  Guard: no test code in D1 migrations"
tmp=$(mktemp)
hits=$(mktemp)
trap 'rm -f "$tmp" "$hits"' EXIT

for f in apps/web/worker/db/migrations/*.sql; do
  [[ -f "$f" ]] || continue
  perl -0777 -pe 's{/\*.*?\*/}{}gs; s/(?m)^[ \t]*--.*$//g' "$f" \
    | awk -v file="$f" '{ print file ":" NR ":" $0 }'
done > "$tmp"

if grep -n '_test_assert' "$tmp" > "$hits"; then
  echo "ERROR: _test_assert referenced in executable D1 migration code:" >&2
  cat "$hits" >&2
  exit 1
fi

echo "OK: fast local CI passed"
