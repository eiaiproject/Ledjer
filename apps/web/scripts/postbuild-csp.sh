#!/usr/bin/env bash
# Post-build: replace __SENTRY_CONNECT_SRC__ placeholder in index.html
# with exact Sentry ingest host from VITE_SENTRY_DSN, or remove if unset.
# When LEDJER_CSP_LOCAL=1, also relax for local E2E (unsafe-inline, localhost).
#
# Also removes .dev.vars from the Worker bundle (dist/ledjer/) to prevent
# secret leakage — @cloudflare/vite-plugin copies .dev.vars into the output.
set -euo pipefail

# Clean up .dev.vars from dist/ledjer/ — it is a dev-only artifact that
# @cloudflare/vite-plugin copies from the project root into the build output.
# Keeping it in the bundle would leak secrets to production deployments.
DEV_VARS="dist/ledjer/.dev.vars"
if [[ -f "$DEV_VARS" ]]; then
  rm -f "$DEV_VARS"
  echo "[clean] removed $DEV_VARS from build output"
fi

HTML="dist/client/index.html"
[[ -f "$HTML" ]] || { echo "[csp] $HTML not found"; exit 0; }

# Cross-platform sed in-place (works on macOS and Linux)
sed_inplace() {
  local tmp
  local pattern="$1"
  tmp=$(mktemp)
  sed "$pattern" "$HTML" > "$tmp" && mv "$tmp" "$HTML"
}

# Resolve Sentry connect-src from DSN
SENTRY_CONNECT_SRC=""
DSN="${VITE_SENTRY_DSN:-}"
if [[ -n "$DSN" ]]; then
  SENTRY_HOST=$(echo "$DSN" | sed -E 's|^https://([^@]*@)?([^/]+).*$|\2|')
  [[ -n "$SENTRY_HOST" ]] && SENTRY_CONNECT_SRC="https://$SENTRY_HOST"
fi

if [[ "${LEDJER_CSP_LOCAL:-}" == "1" ]]; then
  sed_inplace "s|style-src 'self' https://fonts.googleapis.com|style-src 'self' 'unsafe-inline' https://fonts.googleapis.com|"
  SENTRY_PART=""
  [[ -n "$SENTRY_CONNECT_SRC" ]] && SENTRY_PART=" $SENTRY_CONNECT_SRC"
  sed_inplace "s|__SENTRY_CONNECT_SRC__|http://localhost:* http://127.0.0.1:* http://host.docker.internal:*$SENTRY_PART|g"
else
  if [[ -n "$SENTRY_CONNECT_SRC" ]]; then
    sed_inplace "s|__SENTRY_CONNECT_SRC__|$SENTRY_CONNECT_SRC|g"
  else
    sed_inplace "s| __SENTRY_CONNECT_SRC__||g"
  fi
fi

echo "[csp] index.html updated (sentry: ${SENTRY_CONNECT_SRC:-none})"

# ── Remove .dev.vars from Worker bundle (secret leakage prevention) ──
# @cloudflare/vite-plugin copies .dev.vars into dist/ledjer/ during build.
# This file contains real secrets (OAuth keys, session secret, pepper).
# wrangler deploy would upload it as part of the Worker bundle.
DEV_VARS="dist/ledjer/.dev.vars"
if [[ -f "$DEV_VARS" ]]; then
  rm -f "$DEV_VARS"
  echo "[csp] Removed $DEV_VARS (secret leakage prevention)"
fi

# Also check for .env files leaked into dist
ENV_LEAKS=$(find dist -name ".env*" -not -name ".env.example" 2>/dev/null || true)
if [[ -n "$ENV_LEAKS" ]]; then
  echo "[csp] Removing leaked env files: $ENV_LEAKS"
  echo "$ENV_LEAKS" | while IFS= read -r leaked_file; do
    rm -f "$leaked_file"
  done
fi
