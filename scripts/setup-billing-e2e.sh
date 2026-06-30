#!/usr/bin/env bash
# =============================================================================
# setup-billing-e2e.sh
# -----------------------------------------------------------------------------
# Sets up and runs the Mayar billing E2E tests locally.
#
# This script:
# 1. Starts the fake Mayar server (background)
# 2. Serves the Mayar Edge Functions with fake credentials (background)
# 3. Runs the billing E2E tests
# 4. Cleans up all background processes
#
# Prerequisites:
#   - Docker must be running (for Supabase local stack)
#   - `supabase start` must have been run (or will be started automatically)
#   - `pnpm install` must have been run
#
# Usage:
#   bash scripts/setup-billing-e2e.sh
#
# Env overrides:
#   FAKE_MAYAR_PORT  (default: 4567)
#   SUPABASE_PORT    (default: 54321)
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

FAKE_MAYAR_PORT="${FAKE_MAYAR_PORT:-4567}"
SUPABASE_PORT="${SUPABASE_PORT:-54321}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; }

# ── Check prerequisites ──────────────────────────────────────────────────────
# Node.js is the project runtime — no additional runtime check needed

if ! command -v supabase &>/dev/null; then
  error "supabase CLI is required. Install from https://supabase.com/docs/guides/cli"
  exit 1
fi

# ── Cleanup handler ──────────────────────────────────────────────────────────
cleanup() {
  local exit_code=$?
  info "Cleaning up background processes..."
  if [ -n "${FAKE_MAYAR_PID:-}" ]; then
    kill "$FAKE_MAYAR_PID" 2>/dev/null || true
    info "Fake Mayar server stopped"
  fi
  if [ -n "${FUNCTIONS_PID:-}" ]; then
    kill "$FUNCTIONS_PID" 2>/dev/null || true
    info "Edge Functions serving stopped"
  fi
  # Wait for processes to exit
  wait 2>/dev/null || true
  info "Cleanup complete"
  exit "$exit_code"
}
trap cleanup EXIT INT TERM

# ── Step 1: Ensure Supabase stack is running ─────────────────────────────────
info "Checking Supabase local stack..."
if ! supabase status --workdir . &>/dev/null; then
  info "Starting Supabase local stack..."
  supabase start --workdir .
fi

# Apply migrations if needed
supabase db reset --workdir . --no-seed 2>/dev/null || true

info "Supabase stack is running at http://127.0.0.1:${SUPABASE_PORT}"

# ── Step 2: Start fake Mayar server ──────────────────────────────────────────
info "Starting fake Mayar server on 127.0.0.1:${FAKE_MAYAR_PORT}..."
FAKE_MAYAR_PORT="$FAKE_MAYAR_PORT" \
FAKE_MAYAR_STATUS="paid" \
node "$ROOT/scripts/fake-mayar-server.mjs" &
FAKE_MAYAR_PID=$!

# Wait for the fake Mayar server to be ready
for i in {1..10}; do
  if curl -s "http://127.0.0.1:${FAKE_MAYAR_PORT}/health" &>/dev/null; then
    info "Fake Mayar server is ready"
    break
  fi
  if [ "$i" -eq 10 ]; then
    error "Fake Mayar server failed to start"
    exit 1
  fi
  sleep 0.5
done

# ── Step 3: Serve Mayar-webhook Edge Function with fake credentials ──────────
# Note: mayar-create-checkout requires JWT verification (verify_jwt=true in config.toml).
# We only serve mayar-webhook because:
#   1. It has verify_jwt=false (external webhook)
#   2. The checkout flow needs JWT auth to work correctly
# For checkout E2E tests, the deployed function (from supabase start) handles
# JWT verification; for webhook tests, the separately served function uses
# the env file for fake Mayar credentials.
info "Serving Mayar-webhook Edge Function with fake credentials..."
supabase functions serve mayar-webhook \
  --workdir . \
  --env-file "$ROOT/apps/web/.env.e2e" \
  --no-verify-jwt &
FUNCTIONS_PID=$!

# Wait for Edge Functions to be ready
for i in {1..15}; do
  if curl -s "http://127.0.0.1:${SUPABASE_PORT}/functions/v1/mayar-webhook" \
       -X POST -H "Content-Type: application/json" \
       -d '{"event":"test"}' &>/dev/null; then
    info "Edge Functions are ready"
    break
  fi
  if [ "$i" -eq 15 ]; then
    warn "Edge Functions may not be ready yet — continuing anyway..."
  fi
  sleep 1
done

# ── Step 4: Build frontend with local CSP ────────────────────────────────────
info "Building frontend for E2E tests..."
VITE_SUPABASE_URL="http://127.0.0.1:${SUPABASE_PORT}" \
VITE_SUPABASE_ANON_KEY="$(
  supabase status --workdir . --output env 2>/dev/null | grep ANON_KEY | cut -d= -f2-
)" \
LEDJER_CSP_LOCAL="1" \
pnpm --filter web build

# ── Step 5: Run billing E2E tests ────────────────────────────────────────────
info "Running billing E2E tests..."
MAYAR_API_BASE_URL="http://127.0.0.1:${FAKE_MAYAR_PORT}" \
MAYAR_ENV="sandbox" \
MAYAR_API_KEY="test_key" \
MAYAR_WEBHOOK_TOKEN="test_webhook_token" \
E2E_MODE="full-local" \
E2E_BASE_URL="http://localhost:4173" \
E2E_SUPABASE_URL="http://127.0.0.1:${SUPABASE_PORT}" \
E2E_SUPABASE_ANON_KEY="$(
  supabase status --workdir . --output env 2>/dev/null | grep ANON_KEY | cut -d= -f2-
)" \
E2E_SUPABASE_SERVICE_ROLE_KEY="$(
  supabase status --workdir . --output env 2>/dev/null | grep SERVICE_ROLE_KEY | cut -d= -f2-
)" \
CI="true" \
pnpm --filter web exec playwright test \
  e2e/billing-checkout.spec.ts e2e/billing-webhook.spec.ts \
  --project=chromium

info "All billing E2E tests passed!"
