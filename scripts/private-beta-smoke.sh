#!/usr/bin/env bash
# scripts/private-beta-smoke.sh
# Quick smoke test for private beta deployment.
# Checks that the app loads, auth pages work, and CSP headers are present.
#
# Usage:
#   SMOKE_URL=https://app.ledjer.id bash scripts/private-beta-smoke.sh
#
# Requires: curl, jq (optional)
set -euo pipefail

SMOKE_URL="${SMOKE_URL:-https://app.ledjer.id}"
FAILURES=0

check() {
  local desc="$1"
  local url="$2"
  local expected_status="${3:-200}"

  status=$(curl -s -o /dev/null -w "%{http_code}" "$url" --max-time 10 || echo "000")
  if [ "$status" = "$expected_status" ]; then
    echo "✓ $desc (HTTP $status)"
  else
    echo "✗ $desc — expected $expected_status, got $status ($url)"
    FAILURES=$((FAILURES + 1))
  fi
}

check_header() {
  local desc="$1"
  local url="$2"
  local header="$3"

  value=$(curl -s -I "$url" --max-time 10 | grep -i "^$header:" | head -1 | sed "s/^[^:]*: *" || true)
  if [ -n "$value" ]; then
    echo "✓ $desc: $value"
  else
    echo "✗ $desc — header '$header' not found"
    FAILURES=$((FAILURES + 1))
  fi
}

echo "=== Private Beta Smoke Test ==="
echo "Target: $SMOKE_URL"
echo ""

check "Home page loads" "$SMOKE_URL"
check "Login page loads" "$SMOKE_URL/login"
check "Register page loads" "$SMOKE_URL/register"
check "Auth callback page" "$SMOKE_URL/auth/callback" 200

echo ""
echo "--- Security Headers ---"
check_header "CSP" "$SMOKE_URL" "Content-Security-Policy"
check_header "HSTS" "$SMOKE_URL" "Strict-Transport-Security"
check_header "X-Frame-Options" "$SMOKE_URL" "X-Frame-Options"
check_header "X-Content-Type-Options" "$SMOKE_URL" "X-Content-Type-Options"

echo ""
if [ $FAILURES -gt 0 ]; then
  echo "✗ $FAILURES check(s) failed."
  exit 1
else
  echo "✓ All checks passed."
fi
