#!/usr/bin/env bash
# =============================================================================
# check-db-types.sh
# -----------------------------------------------------------------------------
# Fails CI if the generated Supabase database types drift from the canonical
# workspace package.
#
# Usage:
#   ./scripts/check-db-types.sh          # shim + size check (fast, no DB)
#   ./scripts/check-db-types.sh --live   # real generation diff (needs Supabase local stack)
#
# Canonical source of truth:
#   packages/database-types/index.ts   (regenerated from supabase/migrations
#                                      by `supabase gen types typescript`)
#
# Legacy/compat file (must remain a thin re-export shim):
#   apps/web/src/lib/database-types.ts
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SHIM_FILE="$ROOT/apps/web/src/lib/database-types.ts"
CANONICAL_FILE="$ROOT/packages/database-types/index.ts"

MODE="${1:-}"

# ─── Shim validation (always runs) ──────────────────────────────────────────
if [[ ! -f "$SHIM_FILE" ]]; then
  echo "❌ Missing legacy shim: $SHIM_FILE" >&2
  exit 1
fi

if [[ ! -f "$CANONICAL_FILE" ]]; then
  echo "❌ Missing canonical database types: $CANONICAL_FILE" >&2
  exit 1
fi

# Heuristic: the shim file MUST start with a JSDoc block referencing
# @ledjer/database-types and MUST contain a re-export of the canonical types.
if ! head -3 "$SHIM_FILE" | grep -q "@deprecated"; then
  echo "❌ $SHIM_FILE must begin with a @deprecated JSDoc block." >&2
  exit 1
fi

if ! grep -q "from \"@ledjer/database-types\"" "$SHIM_FILE"; then
  echo "❌ $SHIM_FILE must re-export types from @ledjer/database-types." >&2
  exit 1
fi

# Disallow direct Table/Functions definitions in the shim. Re-exports are fine.
if grep -E "^(export type Database|export type Json|public: \{|Tables: \{|Functions: \{)" "$SHIM_FILE" >/dev/null; then
  echo "❌ $SHIM_FILE contains inline type definitions. Regenerate instead by updating packages/database-types/index.ts." >&2
  exit 1
fi

# Canonical file must be non-trivial (>500 lines: regenerated content has
# many tables and ~30 functions).
LINES=$(wc -l < "$CANONICAL_FILE")
if (( LINES < 500 )); then
  echo "❌ Canonical file $CANONICAL_FILE has only $LINES lines; expected regenerated content." >&2
  exit 1
fi

echo "✅ Database types: shim and canonical package look consistent (canonical = $LINES lines)."

# ─── Live generation check (optional, requires Supabase local stack) ────────
if [[ "$MODE" == "--live" ]]; then
  if ! command -v supabase >/dev/null 2>&1; then
    echo "❌ --live mode requires supabase CLI. Install from https://supabase.com/docs/guides/cli" >&2
    exit 1
  fi

  echo "🔄 Regenerating database types from local Supabase stack..."
  GENERATED_FILE=$(mktemp /tmp/database-types.generated.XXXXXX.ts)
  EXPECTED_FILE=$(mktemp /tmp/database-types.expected.XXXXXX.ts)
  trap 'rm -f "$GENERATED_FILE" "$EXPECTED_FILE"' EXIT

  supabase gen types typescript --local --schema public > "$GENERATED_FILE" 2>/dev/null
  cp "$CANONICAL_FILE" "$EXPECTED_FILE"
  perl -0pi -e 's/\n+\z/\n/' "$EXPECTED_FILE" "$GENERATED_FILE"

  if ! diff -u "$EXPECTED_FILE" "$GENERATED_FILE" >/dev/null 2>&1; then
    echo "" >&2
    echo "❌ Database types have DRIFTED from the canonical file." >&2
    echo "   To fix: run 'supabase gen types typescript --local --schema public > packages/database-types/index.ts'" >&2
    diff -u "$EXPECTED_FILE" "$GENERATED_FILE" >&2 || true
    exit 1
  fi

  echo "✅ Generated types match canonical file (no drift)."
fi
