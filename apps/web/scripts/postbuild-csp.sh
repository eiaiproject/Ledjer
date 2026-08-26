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

# Strip HTML comments from the built index.html. The source file documents the
# build pipeline (SENTRY placeholder, _headers, LEDJER_CSP_LOCAL) for devs, but
# those comments ship to production and leak build details (security review F-04).
INDEX="dist/client/index.html"
if [[ -f "$INDEX" ]]; then
  BEFORE=$(wc -c < "$INDEX" | tr -d ' ')
  # perl slurps the file so multi-line comments are removed in one pass.
  perl -0pi -e 's/<!--.*?-->//gs; s/\n{3,}/\n\n/g' "$INDEX"
  AFTER=$(wc -c < "$INDEX" | tr -d ' ')
  echo "[clean] stripped HTML comments from $INDEX ($BEFORE -> $AFTER bytes)"
fi

# NOTE: do NOT rewrite .wrangler/deploy/config.json here — the vite plugin
# emits it pointing at dist/<name>/wrangler.json (main: index.js, the bundled
# worker) and vite preview needs that resolved config to boot workerd. The
# source wrangler.jsonc's main (worker/index.ts) is unbundled raw TS that
# workerd cannot load. To deploy with the source config (env.staging block),
# pass it explicitly: wrangler deploy --config wrangler.jsonc --env staging
