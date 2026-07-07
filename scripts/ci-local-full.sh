#!/usr/bin/env bash
# =============================================================================
# ci-local-full.sh — Full local CI for Cloudflare-native Ledjer
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

readonly SEPARATOR='═══════════════════════════════════════════════════════════════'
TMP_D1=""

cleanup() {
  local ec=$?
  if [[ -n "$TMP_D1" ]]; then
    rm -rf "$TMP_D1" 2>/dev/null || true
  fi
  [[ $ec -ne 0 ]] && echo "Script exited with code $ec"
  return "$ec"
}
trap cleanup EXIT

section() {
  local msg="$1"
  echo ""
  echo "$SEPARATOR"
  echo "  $msg"
  echo "$SEPARATOR"
}

section "1/10  pnpm install --frozen-lockfile"
if ! command -v pnpm >/dev/null 2>&1; then
  corepack enable >/dev/null 2>&1 || true
fi
pnpm install --frozen-lockfile

section "2/10  TypeScript typecheck"
pnpm --filter web typecheck

section "3/10  ESLint"
pnpm --filter web lint

section "4/10  Vitest unit tests"
pnpm --filter web test

section "5/10  Production build"
pnpm --filter web build

section "6/10  Build secrets scan"
bash scripts/check-build-secrets.sh

section "7/10  D1 migration naming guard"
bash scripts/check-migration-naming.sh

section "8/10  Fresh D1 migration apply"
TMP_D1="$(mktemp -d /tmp/ledjer-d1-ci.XXXXXX)"
pnpm --filter web exec wrangler d1 migrations apply DB --local --persist-to "$TMP_D1"

section "9/10  D1 migration list"
pnpm --filter web db:migrations:list

section "10/10  Playwright public smoke"
E2E_MODE=local-smoke \
E2E_BASE_URL=http://localhost:4173 \
CI=true \
pnpm --filter web exec playwright test \
  e2e/smoke.spec.ts \
  e2e/security-public.spec.ts \
  e2e/static-routes.spec.ts \
  --project=chromium

echo "OK: full local CI passed"
