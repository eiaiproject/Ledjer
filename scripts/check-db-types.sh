#!/usr/bin/env bash
# =============================================================================
# check-db-types.sh
# -----------------------------------------------------------------------------
# Verifies that the canonical Supabase database types file is healthy.
#
# Two modes:
#   (default)              Canonical-file SANITY check (fast, no Supabase).
#                          Verifies the committed file exists and looks like
#                          regenerated content (size heuristic).
#   --live                 Real drift check: regenerates types from the local
#                          Supabase stack and diffs against the canonical
#                          file. Wrapped in retry+backoff because the upstream
#                          postgres-meta Docker pull can hit transient ECR
#                          rate limits (`toomanyrequests: Rate exceeded`).
#
# Canonical source of truth:
#   packages/database-types/index.ts (regenerated from supabase/migrations
#                                     by `supabase gen types typescript`)
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CANONICAL_FILE="$ROOT/packages/database-types/index.ts"

MODE="${1:-}"
if [[ "$MODE" != "" && "$MODE" != "--live" ]]; then
  echo "❌ Unknown argument: $MODE" >&2
  echo "Usage: $0 [(--live)]" >&2
  exit 2
fi

if [[ ! -f "$CANONICAL_FILE" ]]; then
  echo "❌ Missing canonical database types: $CANONICAL_FILE" >&2
  exit 1
fi

LINES=$(wc -l < "$CANONICAL_FILE")
if (( LINES < 500 )); then
  echo "❌ Canonical file $CANONICAL_FILE has only $LINES lines; expected regenerated content." >&2
  exit 1
fi

echo "✅ Database types: canonical package looks healthy ($LINES lines)."

if [[ "$MODE" != "--live" ]]; then
  echo "ℹ️  Sanity check only. Run '$0 --live' for real drift detection."
  exit 0
fi

# ─── Live drift check (requires Supabase local stack) ──────────────────────
if ! command -v supabase >/dev/null 2>&1; then
  echo "❌ --live mode requires supabase CLI. Install from https://supabase.com/docs/guides/cli" >&2
  exit 1
fi

# Ensure local Supabase stack is running. If not, start it (idempotent enough
# for local/CI use; failure here is a real error, not infrastructure noise).
if ! supabase status --workdir "$ROOT" >/dev/null 2>&1; then
  echo "🔄 Starting local Supabase stack (needed for gen types)..."
  supabase start --workdir "$ROOT" >/dev/null
fi

GENERATED_FILE=$(mktemp /tmp/database-types.generated.XXXXXX.ts)
EXPECTED_FILE=$(mktemp /tmp/database-types.expected.XXXXXX.ts)
trap 'rm -f "$GENERATED_FILE" "$EXPECTED_FILE"' EXIT

# Retry loop for transient infrastructure failures (e.g. ECR rate limits on
# postgres-meta pull). Real drift errors bubble through diff below.
MAX_ATTEMPTS=4
ATTEMPT=0
GEN_RC=0
GEN_STDERR=""
while (( ATTEMPT < MAX_ATTEMPTS )); do
  ATTEMPT=$((ATTEMPT + 1))
  echo "🔄 Regenerating database types (attempt $ATTEMPT/$MAX_ATTEMPTS)..."
  # Stream stderr to a separate file so we can show it on failure without
  # polluting the generated TypeScript output (which we read as the body).
  if GEN_STDERR=$(
        supabase gen types typescript --local --schema public \
          > "$GENERATED_FILE" 2> /tmp/gen-types.stderr.$$ ; echo $?
      ); then
    GEN_RC=0
    GEN_STDERR=""
  else
    GEN_RC=$?
    GEN_STDERR="$(cat /tmp/gen-types.stderr.$$ 2>/dev/null || true)"
  fi
  rm -f /tmp/gen-types.stderr.$$

  if (( GEN_RC == 0 )); then
    break
  fi

  # Classify: only retry on transient infra failures. Everything else fails fast.
  case "$GEN_STDERR" in
    *toomanyrequests*|*Rate*exceeded*|*i/o*timeout*|*connection*reset*|*TLS*handshake*timeout*)
      echo "⚠️  Infrastructure failure (attempt $ATTEMPT/$MAX_ATTEMPTS): $(echo "$GEN_STDERR" | tail -1)"
      sleep_s=$((2 ** (ATTEMPT - 1) * 5))   # 5, 10, 20, 40 seconds
      echo "   Backing off ${sleep_s}s before next pull..."
      sleep "$sleep_s"
      continue
      ;;
    *)
      echo "❌ supabase gen types failed (non-transient):" >&2
      echo "$GEN_STDERR" >&2
      exit 1
      ;;
  esac
done

if (( GEN_RC != 0 )); then
  echo "❌ supabase gen types failed after $MAX_ATTEMPTS attempts." >&2
  echo "   Last stderr:" >&2
  echo "$GEN_STDERR" >&2
  exit 1
fi

cp "$CANONICAL_FILE" "$EXPECTED_FILE"
perl -0pi -e 's/\n+\z/\n/' "$EXPECTED_FILE" "$GENERATED_FILE"

if ! diff -u "$EXPECTED_FILE" "$GENERATED_FILE" >/tmp/db-types-diff.$$ 2>&1; then
  echo "" >&2
  echo "❌ Database types DRIFTED from canonical file." >&2
  echo "   To fix: run 'supabase gen types typescript --local --schema public > packages/database-types/index.ts'" >&2
  cat /tmp/db-types-diff.$$ >&2 || true
  rm -f /tmp/db-types-diff.$$
  exit 1
fi
rm -f /tmp/db-types-diff.$$

echo "✅ Generated types match canonical file (no drift)."
