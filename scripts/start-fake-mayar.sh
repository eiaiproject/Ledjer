#!/usr/bin/env bash
# =============================================================================
# start-fake-mayar.sh
# -----------------------------------------------------------------------------
# Starts the fake Mayar server for deterministic CI/E2E testing.
# The server runs on 127.0.0.1:4567 by default.
#
# Usage:
#   bash scripts/start-fake-mayar.sh           # Start on default port
#   FAKE_MAYAR_PORT=5678 bash scripts/start-fake-mayar.sh
#   FAKE_MAYAR_STATUS=failed bash scripts/start-fake-mayar.sh   # Custom status
#
# To use with E2E tests:
#   MAYAR_API_BASE_URL=http://127.0.0.1:4567
#   MAYAR_ENV=sandbox
#   MAYAR_API_KEY=test_key
#   MAYAR_WEBHOOK_TOKEN=test_webhook_token
# =============================================================================
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

FAKE_MAYAR_PORT="${FAKE_MAYAR_PORT:-4567}"
FAKE_MAYAR_STATUS="${FAKE_MAYAR_STATUS:-paid}"

echo "Starting fake Mayar server on 127.0.0.1:${FAKE_MAYAR_PORT} (status: ${FAKE_MAYAR_STATUS})"
cd "$ROOT"

FAKE_MAYAR_PORT="$FAKE_MAYAR_PORT" \
FAKE_MAYAR_STATUS="$FAKE_MAYAR_STATUS" \
exec node "$ROOT/scripts/fake-mayar-server.mjs"
