#!/usr/bin/env bash
# =============================================================================
# ci-local-fast.sh — Fast local CI (no Docker, no E2E)
# -----------------------------------------------------------------------------
# Runs all same-machine gates: install, typecheck, lint, unit tests, build,
# database types sanity check, migration naming, package clean, test-assert
# guard in migrations.
#
# Usage:
#   bash scripts/ci-local-fast.sh
#
# Exit code: 0 on success, 1+ on failure. Fails fast on first error.
# =============================================================================
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PASS=0
FAIL=0

pass()  { PASS=$((PASS + 1)); }
fail()  { FAIL=$((FAIL + 1)); }

section() {
  echo ""
  echo "═══════════════════════════════════════════════════════════════"
  echo "  $1"
  echo "═══════════════════════════════════════════════════════════════"
}

# ── 1. Corepack / pnpm install ──────────────────────────────────────────────
section "1/7  pnpm install --frozen-lockfile"
corepack enable 2>/dev/null || true
pnpm install --frozen-lockfile 2>&1 | tail -5
echo "✅  pnpm install OK"
pass

# ── 2. TypeScript typecheck ────────────────────────────────────────────────
section "2/7  TypeScript typecheck"
pnpm --filter web typecheck 2>&1 | tail -10
echo "✅  TypeScript OK"
pass

# ── 3. ESLint ──────────────────────────────────────────────────────────────
section "3/7  ESLint"
pnpm --filter web lint 2>&1 | tail -10
echo "✅  ESLint OK"
pass

# ── 4. Vitest unit tests ───────────────────────────────────────────────────
section "4/7  Vitest unit tests"
pnpm --filter web test 2>&1 | tail -15
echo "✅  Unit tests OK"
pass

# ── 5. Production build ────────────────────────────────────────────────────
section "5/7  Production build"
pnpm --filter web build 2>&1 | tail -10
echo "✅  Build OK"
pass

# ── 6. Database types & migration guards ───────────────────────────────────
section "6/7  Database types sanity check"
pnpm db-types:check 2>&1 | tail -5
echo "✅  DB types sanity OK"
pass

section "6b/7  Migration naming guard"
bash scripts/check-migration-naming.sh
echo "✅  Migration naming OK"
pass

# ── 7. No test_assert in migrations ────────────────────────────────────────
section "7/7  Guard: no test code in migrations"
tmp=$(mktemp)
hits=$(mktemp)
trap 'rm -f "$tmp" "$hits"' EXIT
: > "$tmp"

for f in supabase/migrations/*.sql; do
  [ -f "$f" ] || continue
  perl -0777 -pe 's{/\*.*?\*/}{}gs; s/(?m)^[ \t]*--.*$//g' "$f" \
    | awk -v file="$f" '{ print file ":" NR ":" $0 }'
done > "$tmp"

if grep -n '_test_assert' "$tmp" > "$hits"; then
  echo "❌  ERROR: _test_assert referenced in executable migration code:" >&2
  cat "$hits" >&2
  fail
else
  echo "✅  No _test_assert in migration code"
  pass
fi

# ── Summary ─────────────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "  RESULTS: $PASS passed, $FAIL failed"
echo "═══════════════════════════════════════════════════════════════"
if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
