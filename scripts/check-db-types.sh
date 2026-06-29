#!/usr/bin/env bash
# =============================================================================
# check-db-types.sh
# -----------------------------------------------------------------------------
# Fails CI if the canonical Supabase database types drift from what the
# migrations would generate.
#
# Usage:
#   ./scripts/check-db-types.sh          # size sanity check (fast, no DB)
#   ./scripts/check-db-types.sh --live   # real generation diff (needs Supabase local stack)
#
# Canonical source of truth:
#   packages/database-types/index.ts   (regenerated from supabase/migrations
#                                      by `supabase gen types typescript`)
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CANONICAL_FILE="$ROOT/packages/database-types/index.ts"

MODE="${1:-}"

if [[ ! -f "$CANONICAL_FILE" ]]; then
  echo "❌ Missing canonical database types: $CANONICAL_FILE" >&2
  exit 1
fi

# Canonical file must be non-trivial (>500 lines: regenerated content has
# many tables and ~30 functions).
LINES=$(wc -l < "$CANONICAL_FILE")
if (( LINES < 500 )); then
  echo "❌ Canonical file $CANONICAL_FILE has only $LINES lines; expected regenerated content." >&2
  exit 1
fi

echo "✅ Database types: canonical package looks healthy ($LINES lines)."

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