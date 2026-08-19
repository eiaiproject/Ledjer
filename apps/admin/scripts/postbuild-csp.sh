#!/usr/bin/env bash
# Post-build: clean up leaked secret files from build output, and fix the
# Wrangler deploy-config redirector so `wrangler deploy --env staging` (and
# production) resolves to the source wrangler.jsonc instead of the dist
# artifact (which lacks env blocks).
# CSP is managed through Cloudflare _headers (single source of truth).
set -euo pipefail

# Clean up .dev.vars from dist/ledjer-admin/ — @cloudflare/vite-plugin copies it
# from the project root into the build output. Keeping it would leak secrets.
DEV_VARS="dist/ledjer-admin/.dev.vars"
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

# Rewrite the deploy-config redirector emitted by @cloudflare/vite-plugin so
# wrangler deploy resolves the source wrangler.jsonc (which has the env.staging
# block) instead of dist/<name>/wrangler.json (which only has top-level vars).
# Without this, `wrangler deploy --env staging` silently deploys with default
# bindings (preview DB, dev vars).
DEPLOY_CONFIG=".wrangler/deploy/config.json"
if [[ -f "$DEPLOY_CONFIG" ]]; then
  ABS_CONFIG="$(cd "$(dirname "$0")/.." && pwd)/wrangler.jsonc"
  printf '{"configPath":"%s","auxiliaryWorkers":[]}\n' "$ABS_CONFIG" > "$DEPLOY_CONFIG"
  echo "[wrangler] rewrote $DEPLOY_CONFIG → $ABS_CONFIG"
fi
