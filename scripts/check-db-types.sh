#!/usr/bin/env bash
# =============================================================================
# check-db-types.sh
# -----------------------------------------------------------------------------
# Fails CI if the generated Supabase database types drift from the canonical
# workspace package.
#
# Canonical source of truth:
#   packages/database-types/index.ts   (regenerated from supabase/migrations
#                                      by `pnpm db-types:generate`)
#
# Legacy/compat file (must remain a thin re-export shim):
#   apps/web/src/lib/database-types.ts
#
# This script enforces that the legacy file ONLY contains a `@deprecated`
# re-export — nothing else. If somebody pastes a regenerated copy into the
# apps/web/ tree, this guard fails the build.
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SHIM_FILE="$ROOT/apps/web/src/lib/database-types.ts"
CANONICAL_FILE="$ROOT/packages/database-types/index.ts"

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
