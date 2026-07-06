#!/usr/bin/env bash
# =============================================================================
# ci-local-full.sh — Full local CI with Docker, Supabase, Playwright E2E
# -----------------------------------------------------------------------------
# Runs all CI gates locally, including Supabase migrations, SQL tests, DB type
# drift check, and Chromium full-local E2E. Visual regression is a separate gate.
#
# Prerequisites:
#   - Docker running locally
#   - supabase CLI installed (https://supabase.com/docs/guides/cli)
#   - Node.js 24 + pnpm
#   - Playwright browsers for Chromium
#
# Usage:
#   bash scripts/ci-local-full.sh
#
# Exit code: 0 on success, 1+ on failure. Fails fast on first error.
# =============================================================================
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

readonly SEPARATOR='═══════════════════════════════════════════════════════════════'

PASS=0
FAIL=0
TMPFILES=()

pass()  { PASS=$((PASS + 1)); }
fail()  { FAIL=$((FAIL + 1)); }

cleanup() {
  local ec=$?
  echo ""
  echo "── Cleanup ──────────────────────────────────────────────"
  if command -v supabase >/dev/null 2>&1; then
    supabase stop --workdir "$ROOT" --no-backup 2>/dev/null || true
  fi
  for f in ${TMPFILES[@]+"${TMPFILES[@]}"}; do
    rm -f "$f" 2>/dev/null || true
  done
  echo "── Cleanup done ─────────────────────────────────────────"
  [[ $ec -ne 0 ]] && echo "⚠️  Script exited with code $ec"
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

# ── 0. Preflight: Docker + supabase CLI ─────────────────────────────────────
section "0/8  Preflight checks"
if ! command -v docker >/dev/null 2>&1; then
  echo "❌  Docker is required. Install from https://docs.docker.com/get-docker/"
  exit 1
fi
if ! command -v supabase >/dev/null 2>&1; then
  echo "❌  supabase CLI is required. Install from https://supabase.com/docs/guides/cli"
  exit 1
fi
echo "✅  Docker and supabase CLI available"
pass

# ── 1. pnpm install ─────────────────────────────────────────────────────────
section "1/8  pnpm install --frozen-lockfile"
if ! command -v pnpm >/dev/null 2>&1; then
  corepack enable >/dev/null 2>&1 || true
fi
pnpm install --frozen-lockfile 2>&1 | tail -5
echo "✅  pnpm install OK"
pass

# ── 2. Fast CI gates (typecheck, lint, unit tests) ─────────────────────────
section "2a/8  TypeScript typecheck"
pnpm --filter web typecheck 2>&1 | tail -10
echo "✅  TypeScript OK"
pass

section "2b/8  ESLint"
pnpm --filter web lint 2>&1 | tail -10
echo "✅  ESLint OK"
pass

section "2c/8  Vitest unit tests"
pnpm --filter web test 2>&1 | tail -15
echo "✅  Unit tests OK"
pass

# ── 3. Start local Supabase stack ───────────────────────────────────────────
section "3/8  Start local Supabase"
supabase start --workdir "$ROOT" -x edge-runtime 2>&1 | tail -5
echo "✅  Supabase started"
pass

# ── 4. Apply migrations from empty DB ───────────────────────────────────────
section "4/8  Apply migrations"
supabase db reset --workdir "$ROOT" --no-seed 2>&1 | tail -5
echo "✅  Migrations applied"
pass

# ── 5. SQL tests ────────────────────────────────────────────────────────────
section "5/8  SQL tests"
bash scripts/run-sql-tests.sh 2>&1 | tail -20
echo "✅  SQL tests passed"
pass

# ── 6. DB type drift check ─────────────────────────────────────────────────
section "6/8  Database types drift check"
bash scripts/check-db-types.sh --live 2>&1 | tail -10
echo "✅  DB types match"
pass

# ── 7. Chromium full-local E2E ──────────────────────────────────────────────
section "7/8  Full-local Chromium E2E"

# Export Supabase env vars
eval "$(bash scripts/export-supabase-env.sh)"

if [[ -z "$SUPABASE_ANON_KEY" ]]; then
  echo "❌  Failed to extract Supabase anon key"
  fail
else
  # ── Build app with valid local Supabase config ─────────────────────────
  VITE_SUPABASE_URL="$SUPABASE_URL" \
  VITE_SUPABASE_ANON_KEY="$SUPABASE_ANON_KEY" \
  LEDJER_CSP_LOCAL=1 \
  pnpm --filter web build 2>&1 | tail -5

  # ── Run Chromium E2E ──────────────────────────────────────────────────
  echo "  Running Chromium full-local E2E..."
  E2E_MODE=full-local \
  E2E_BASE_URL=http://localhost:4173 \
  E2E_SUPABASE_URL="$SUPABASE_URL" \
  E2E_SUPABASE_ANON_KEY="$SUPABASE_ANON_KEY" \
  E2E_SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
  CI=true \
  pnpm --filter web exec playwright test --project=chromium 2>&1 | tail -30

  echo "✅  Chromium E2E passed"
  pass
fi

# ── 7b. Build secrets scan ───────────────────────────────────────────────
section "7b/8  Build secrets scan"
bash scripts/check-build-secrets.sh 2>&1 | tail -5
echo "✅  Build secrets scan OK"
pass

# ── 8. Migration guards ─────────────────────────────────────────────────────
section "8/8  Migration guards"

bash scripts/check-migration-naming.sh
echo "✅  Migration naming OK"
pass

# Guard: no test_assert in migrations
TMP_GUARD=$(mktemp)
TMP_HITS=$(mktemp)
TMPFILES+=("$TMP_GUARD" "$TMP_HITS")
: > "$TMP_GUARD"
for f in supabase/migrations/*.sql; do
  [[ -f "$f" ]] || continue
  perl -0777 -pe 's{/\*.*?\*/}{}gs; s/(?m)^[ \t]*--.*$//g' "$f" \
    | awk -v file="$f" '{ print file ":" NR ":" $0 }'
done > "$TMP_GUARD"
if grep -n '_test_assert' "$TMP_GUARD" > "$TMP_HITS"; then
  echo "❌  ERROR: _test_assert in migration code:" >&2
  cat "$TMP_HITS" >&2
  fail
else
  echo "✅  No _test_assert in migration code"
  pass
fi

# ── Summary ─────────────────────────────────────────────────────────────────
echo ""
echo "$SEPARATOR"
echo "  RESULTS: $PASS passed, $FAIL failed"
echo "$SEPARATOR"
if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi
