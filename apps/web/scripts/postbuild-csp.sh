#!/usr/bin/env bash
# Post-build: replace __SENTRY_CONNECT_SRC__ placeholder in index.html
# with exact Sentry ingest host from VITE_SENTRY_DSN, or remove if unset.
# When LEDJER_CSP_LOCAL=1, also relax for local E2E (unsafe-inline, localhost).
set -euo pipefail

HTML="dist/client/index.html"
[[ -f "$HTML" ]] || { echo "[csp] $HTML not found"; exit 0; }

# Cross-platform sed in-place (works on macOS and Linux)
sed_inplace() {
  local tmp
  tmp=$(mktemp)
  sed "$1" "$HTML" > "$tmp" && mv "$tmp" "$HTML"
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
