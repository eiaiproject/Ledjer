#!/usr/bin/env bash
# Post-build: clean up leaked secret files from build output.
# CSP is managed through Cloudflare _headers (single source of truth).
set -euo pipefail

# Clean up .dev.vars from dist/ledjer/ — @cloudflare/vite-plugin copies it
# from the project root into the build output. Keeping it would leak secrets.
DEV_VARS="dist/ledjer/.dev.vars"
if [[ -f "$DEV_VARS" ]]; then
  rm -f "$DEV_VARS"
  echo "[clean] removed $DEV_VARS from build output"
fi

# Also check for .env files leaked into dist
ENV_LEAKS=$(find dist -name ".env*" -not -name ".env.example" 2>/dev/null || true)
if [[ -n "$ENV_LEAKS" ]]; then
  echo "[clean] Removing leaked env files: $ENV_LEAKS"
  echo "$ENV_LEAKS" | while IFS= read -r leaked_file; do
    rm -f "$leaked_file"
  done
fi
