#!/usr/bin/env bash
# =============================================================================
# deploy.sh — Build & deploy Ledjer to Cloudflare Workers
# =============================================================================
# Usage:
#   bash scripts/deploy.sh                  # full build + deploy
#   bash scripts/deploy.sh --deploy-only    # skip build (CI: build already done)
#
# Expects CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN in env (or wrangler
# configured via wrangler.toml / ~/.wrangler).
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/apps/web"

DEPLOY_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --deploy-only) DEPLOY_ONLY=1 ;;
  esac
done

# ── Preflight: wrangler auth check ──────────────────────────────
echo "==> Checking wrangler authentication..."
if ! pnpm exec wrangler whoami &>/dev/null; then
  echo "❌ wrangler whoami failed. Check CLOUDFLARE_API_TOKEN or run 'wrangler login'."
  exit 1
fi
echo "✅ wrangler authenticated"

# ── Build ────────────────────────────────────────────────────────
if [[ "$DEPLOY_ONLY" -eq 0 ]]; then
  echo "==> Building..."
  pnpm build
  echo "✅ Build complete"
else
  echo "==> Skipping build (--deploy-only)"
fi

# ── Deploy ────────────────────────────────────────────────────────
echo "==> Deploying to Cloudflare Workers..."
pnpm exec wrangler deploy
echo "✅ Deploy complete"
