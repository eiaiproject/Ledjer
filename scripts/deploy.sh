#!/usr/bin/env bash
# Cloudflare Workers deploy helper.
# Used by Cloudflare Pages CI/CD (deploy step).
#
# Usage:
#   bash scripts/deploy.sh --deploy-only     # upload + activate (default)
#   bash scripts/deploy.sh --upload-only     # upload new version, do not activate
#
# ponytail: this script assumes the build step has already produced
# apps/web/dist/{ledjer,client} (Vite + @cloudflare/vite-plugin). Add
# `--upload-only` once you have manual approval workflow for prod.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

mode="deploy"
case "${1:-}" in
  --deploy-only|"") mode="deploy" ;;
  --upload-only)    mode="upload" ;;
  -h|--help)
    sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'
    exit 0
    ;;
  *)
    echo "Unknown arg: $1" >&2
    exit 2
    ;;
esac

# Sanity: build output must exist.
webDir="${root}/apps/web"
if [[ ! -f "${webDir}/dist/ledjer/index.js" ]]; then
  echo "ERROR: apps/web/dist/ledjer/index.js missing. Run 'pnpm --filter web build' first." >&2
  exit 1
fi

# Prefer CI-provided token; fall back to wrangler's stored OAuth credentials.
if [[ -n "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  export CLOUDFLARE_API_TOKEN
fi
if [[ -n "${CLOUDFLARE_ACCOUNT_ID:-}" ]]; then
  export CLOUDFLARE_ACCOUNT_ID
fi

if [[ "$mode" == "upload" ]]; then
  cd "${webDir}" && exec npx wrangler versions upload --config wrangler.jsonc
fi

# Default: deploy (upload + activate 100% traffic).
# ponytail: --config wrangler.jsonc is REQUIRED — the vite build writes
# .wrangler/deploy/config.json redirecting to dist/ledjer/wrangler.json,
# which has no env blocks (--env would silently target the default worker)
# and can carry local-only vars when built with LEDJER_E2E_LOCAL=1.
cd "${webDir}" && exec npx wrangler deploy --config wrangler.jsonc
