#!/usr/bin/env bash
# =============================================================================
# check-build-secrets.sh — Scan built dist for leaked secrets
# =============================================================================
# Runs after pnpm --filter web build to verify no secrets ended up in the
# frontend bundle. Fails CI if any matches are found.
#
# Usage:
#   bash scripts/check-build-secrets.sh
#
# Exit code: 0 on clean, 1 on leak found.
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST_DIR="$ROOT/apps/web/dist"

if [[ ! -d "$DIST_DIR" ]]; then
  echo "❌ dist directory not found: $DIST_DIR"
  echo "   Run 'pnpm --filter web build' first."
  exit 1
fi

echo "Scanning $DIST_DIR for leaked secrets..."

FAIL=0

# ── Secret patterns to scan for ─────────────────────────────────────────
# Using indexed arrays for bash 3.2 compatibility (macOS).
# Patterns use ERE syntax (grep -E) — no backslash-escaped braces/parens.
LABELS=(
  "EMAIL_API_KEY"
  "GOOGLE_CLIENT_SECRET"
  "SESSION_SECRET"
  "PASSWORD_PEPPER"
  "SENTRY_DSN"
  "SENTRY_AUTH_TOKEN"
  "AWS_ACCESS_KEY_ID"
  "GitHub token"
  "OpenAI key"
  "Private key marker"
)
PATTERNS=(
  "EMAIL_API_KEY"
  "GOOGLE_CLIENT_SECRET"
  "SESSION_SECRET"
  "PASSWORD_PEPPER"
  "SENTRY_DSN"
  "SENTRY_AUTH_TOKEN"
  "AKIA[0-9A-Z]{16}"
  "gh[pousr]_[A-Za-z0-9_]{36,}"
  "sk-[A-Za-z0-9]{48,}"
  "-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----"
)

for i in "${!LABELS[@]}"; do
  label="${LABELS[$i]}"
  pattern="${PATTERNS[$i]}"
  # Find matching files, then exclude env variable references (c.env.*, process.env.*)
  # which are harmless property access patterns bundled by @cloudflare/vite-plugin.
  matched_files=$(grep -rlE "$pattern" "$DIST_DIR" 2>/dev/null || true)
  if [[ -n "$matched_files" ]]; then
    leaked=0
    for f in $matched_files; do
      if grep -nE "$pattern" "$f" 2>/dev/null | grep -vE 'c\.env\.|process\.env\.|VITE_' | grep -q .; then
        leaked=1
        break
      fi
    done
    if [[ "$leaked" -ne 0 ]]; then
      echo "❌ FOUND: $label"
      echo "$matched_files" | head -3 | while read -r f; do
        echo "   in: $f"
      done
      FAIL=1
    fi
  fi
done

# ── Check for .env files in dist ────────────────────────────────────────
ENV_FILES=$(find "$DIST_DIR" -name ".env" -o -name ".env.local" -o -name ".env.*" 2>/dev/null || true)
if [[ -n "$ENV_FILES" ]]; then
  echo "❌ FOUND .env files in dist:"
  echo "$ENV_FILES"
  FAIL=1
fi

# ── Check for source maps (warning only — may be intentional for Sentry) ──
MAPS=$(find "$DIST_DIR" -name "*.map" 2>/dev/null | head -5 || true)
if [[ -n "$MAPS" ]]; then
  echo "⚠️  Source maps found in dist (review if intentional — Sentry needs them):"
  echo "$MAPS"
fi

if [[ "$FAIL" -ne 0 ]]; then
  echo ""
  echo "❌ SECRET LEAK DETECTED in build output."
  echo "   Do NOT deploy until secrets are removed from the bundle."
  exit 1
fi

echo "✅ No secrets found in dist directory."
