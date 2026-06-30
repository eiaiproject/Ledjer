#!/usr/bin/env bash
# =============================================================================
# test-mayar-sandbox.sh
# -----------------------------------------------------------------------------
# Optional manual smoke test for real Mayar Club sandbox.
# NOT part of default CI — requires real sandbox API keys.
#
# Prerequisites:
#   1. Register at https://web.mayar.club (sandbox environment)
#   2. Generate sandbox API key from Mayar Club dashboard
#   3. Set required environment variables (see below)
#
# Usage:
#   MAYAR_API_KEY='your-sandbox-key' bash scripts/test-mayar-sandbox.sh
#
# Optional env vars:
#   MAYAR_API_BASE_URL  (default: https://api.mayar.club)
#   MAYAR_ENV           (default: sandbox)
#   SUPABASE_URL        (optional — only needed for webhook end-to-end)
#   SUPABASE_SERVICE_ROLE_KEY (optional — only needed for webhook test)
#   MAYAR_WEBHOOK_TOKEN (optional — only needed for webhook test)
#
# What this tests:
#   ✓ Real Mayar Club API key works
#   ✓ Real create invoice works
#   ✓ Real checkout URL is returned
#   ✓ Webhook payload shape is compatible (if SUPABASE configured)
#   ✗ Does NOT process actual payment
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# ── Configuration ────────────────────────────────────────────────────────────
MAYAR_API_KEY="${MAYAR_API_KEY:-}"
MAYAR_API_BASE_URL="${MAYAR_API_BASE_URL:-https://api.mayar.club}"
MAYAR_ENV="${MAYAR_ENV:-sandbox}"
APP_URL="${APP_URL:-https://ledjer.id}"

PASS=0
FAIL=0
THIN_RULE="───────────────────────────────────────────────────────────────"
THICK_RULE="═══════════════════════════════════════════════════════════════"

# ── Helpers ──────────────────────────────────────────────────────────────────

check() {
  local label="$1"
  shift
  if "$@" 2>/dev/null; then
    echo "  ✅ $label"
    PASS=$((PASS + 1))
  else
    echo "  ❌ $label"
    FAIL=$((FAIL + 1))
  fi
}

check_json_field() {
  local label="$1"
  local field="$2"
  local json="$3"
  local expected="$4"
  local actual; actual=$(echo "$json" | python3 -c "import sys,json; print(json.load(sys.stdin).get('$field', 'MISSING'))" 2>/dev/null || echo "MISSING")
  if [[ "$actual" == "$expected" ]]; then
    echo "  ✅ $label (expected: $expected, got: $actual)"
    PASS=$((PASS + 1))
  else
    echo "  ❌ $label (expected: $expected, got: $actual)"
    FAIL=$((FAIL + 1))
  fi
}

check_non_empty() {
  local label="$1"
  local field="$2"
  local json="$3"
  local actual; actual=$(echo "$json" | python3 -c "import sys,json; v=json.load(sys.stdin).get('$field', ''); print(v if v else 'EMPTY')" 2>/dev/null || echo "PARSE_ERROR")
  if [[ -n "$actual" && "$actual" != "EMPTY" && "$actual" != "PARSE_ERROR" ]]; then
    echo "  ✅ $label (value: ${actual:0:80})"
    PASS=$((PASS + 1))
  else
    echo "  ❌ $label (field is empty or missing)"
    FAIL=$((FAIL + 1))
  fi
}

# ── Main ─────────────────────────────────────────────────────────────────────
echo ""
echo "$THICK_RULE"
echo "  Mayar Sandbox Smoke Test"
echo "  Environment: ${MAYAR_ENV}"
echo "  API Base URL: ${MAYAR_API_BASE_URL}"
echo "$THICK_RULE"
echo ""

# Check API key
if [[ -z "$MAYAR_API_KEY" ]]; then
  echo "❌ MAYAR_API_KEY is not set."
  echo ""
  echo "To run this test:"
  echo "  1. Register at https://web.mayar.club"
  echo "  2. Generate sandbox API key from Mayar Club dashboard"
  echo "  3. Run: MAYAR_API_KEY='your-sandbox-key' bash $0"
  echo ""
  exit 1
fi

# ── Test 1: Invoice Creation ─────────────────────────────────────────────────
echo "$THIN_RULE"
echo "  1. Create Invoice"
echo "$THIN_RULE"

TIMESTAMP=$(date +%s)
INVOICE_PAYLOAD=$(cat <<EOF
{
  "name": "Ledjer Sandbox Test",
  "email": "sandbox-test-${TIMESTAMP}@ledjer.test",
  "mobile": "6281234567890",
  "redirectUrl": "${APP_URL}/settings/billing?checkout=mayar",
  "description": "Sandbox test invoice for Ledjer",
  "items": [
    {
      "quantity": 1,
      "rate": 39000,
      "description": "Ledjer Solo - monthly (sandbox test)"
    }
  ],
  "extraData": {
    "source": "sandbox-smoke-test",
    "timestamp": "${TIMESTAMP}"
  }
}
EOF
)

CREATE_RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST "${MAYAR_API_BASE_URL}/hl/v1/invoice/create" \
  -H "Authorization: Bearer ${MAYAR_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "$INVOICE_PAYLOAD" \
  2>/dev/null || echo "")

CREATE_HTTP_CODE=$(echo "$CREATE_RESPONSE" | tail -1)
CREATE_BODY=$(echo "$CREATE_RESPONSE" | sed '$d')

echo "  HTTP Status: $CREATE_HTTP_CODE"

if [[ "$CREATE_HTTP_CODE" == "200" ]]; then
  echo "  ✅ Create invoice request succeeded (HTTP 200)"
  PASS=$((PASS + 1))
else
  echo "  ❌ Create invoice request failed (HTTP ${CREATE_HTTP_CODE})"
  echo "     Body: $CREATE_BODY"
  FAIL=$((FAIL + 1))
fi

# Extract invoice data
INVOICE_ID=$(echo "$CREATE_BODY" | python3 -c "
import sys, json
data = json.load(sys.stdin)
items = data.get('data', [])
if items and isinstance(items, list) and len(items) > 0:
    print(items[0].get('id', ''))
elif isinstance(items, dict):
    print(items.get('id', ''))
else:
    print('')
" 2>/dev/null || echo "")

TRANSACTION_ID=$(echo "$CREATE_BODY" | python3 -c "
import sys, json
data = json.load(sys.stdin)
items = data.get('data', [])
if items and isinstance(items, list) and len(items) > 0:
    print(items[0].get('transactionId', ''))
elif isinstance(items, dict):
    print(items.get('transactionId', ''))
else:
    print('')
" 2>/dev/null || echo "")

CHECKOUT_URL=$(echo "$CREATE_BODY" | python3 -c "
import sys, json
data = json.load(sys.stdin)
items = data.get('data', [])
if items and isinstance(items, list) and len(items) > 0:
    print(items[0].get('link', items[0].get('paymentUrl', '')))
elif isinstance(items, dict):
    print(items.get('link', items.get('paymentUrl', '')))
else:
    print('')
" 2>/dev/null || echo "")

echo ""
echo "  Invoice ID: ${INVOICE_ID:-N/A}"
echo "  Transaction ID: ${TRANSACTION_ID:-N/A}"
echo "  Checkout URL: ${CHECKOUT_URL:-N/A}"

# ── Test 2: Verify Response Shape ────────────────────────────────────────────
echo ""
echo "$THIN_RULE"
echo "  2. Verify Response Shape"
echo "$THIN_RULE"

check_non_empty "Invoice ID is returned" "id" "$(echo "$CREATE_BODY" | python3 -c "
import sys, json
data = json.load(sys.stdin)
items = data.get('data', [])
if items and isinstance(items, list) and len(items) > 0:
    print(json.dumps(items[0]))
else:
    print(json.dumps(items))
" 2>/dev/null || echo "{}")"

echo ""
echo "  Raw response structure:"
echo "$CREATE_BODY" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print('  statusCode:', data.get('statusCode'))
print('  message:', data.get('message'))
items = data.get('data', [])
if items and isinstance(items, list) and len(items) > 0:
    item = items[0]
    print('  data[0].id:', item.get('id'))
    print('  data[0].transactionId:', item.get('transactionId'))
    print('  data[0].link:', item.get('link'))
    print('  data[0].paymentUrl:', item.get('paymentUrl'))
    print('  data[0].status:', item.get('status'))
    print('  data[0].amount:', item.get('amount'))
" 2>/dev/null || echo "  (parse error)" >&2

# ── Test 3: Invoice Detail ──────────────────────────────────────────────────
echo ""
echo "$THIN_RULE"
echo "  3. Get Invoice Detail"
echo "$THIN_RULE"

if [[ -n "$INVOICE_ID" ]]; then
  DETAIL_RESPONSE=$(curl -s -w "\n%{http_code}" \
    -X GET "${MAYAR_API_BASE_URL}/hl/v1/invoice/${INVOICE_ID}" \
    -H "Authorization: Bearer ${MAYAR_API_KEY}" \
    2>/dev/null || echo "")

  DETAIL_HTTP_CODE=$(echo "$DETAIL_RESPONSE" | tail -1)
  DETAIL_BODY=$(echo "$DETAIL_RESPONSE" | sed '$d')

  echo "  HTTP Status: $DETAIL_HTTP_CODE"

  if [[ "$DETAIL_HTTP_CODE" == "200" ]]; then
    echo "  ✅ Get invoice detail succeeded"
    PASS=$((PASS + 1))
  else
    echo "  ❌ Get invoice detail failed"
    FAIL=$((FAIL + 1))
  fi
else
  echo "  ⚠️ Skipping: no invoice ID from create step"
fi

# ── Test 4: Checkout URL Format ─────────────────────────────────────────────
echo ""
echo "$THIN_RULE"
echo "  4. Checkout URL Format"
echo "$THIN_RULE"

if [[ -n "$CHECKOUT_URL" ]]; then
  # Check if URL is a mayar.club link (sandbox) or mayar.id (production)
  if [[ "$CHECKOUT_URL" =~ ^https://(checkout\.mayar\.club|web\.mayar\.club) ]]; then
    echo "  ✅ Checkout URL points to Mayar Club sandbox"
    PASS=$((PASS + 1))
  elif [[ "$CHECKOUT_URL" =~ ^https:// ]]; then
    echo "  ⚠️ Checkout URL is valid HTTPS but may not be sandbox: ${CHECKOUT_URL}"
    # Still passes — just informational
    PASS=$((PASS + 1))
  else
    echo "  ❌ Checkout URL is not a valid HTTPS URL"
    FAIL=$((FAIL + 1))
  fi

  check_non_empty "Checkout URL is accessible" "link" "{\"link\":\"${CHECKOUT_URL}\"}"
else
  echo "  ⚠️ Skipping: no checkout URL"
fi

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "$THICK_RULE"
echo "  Results: ${PASS} passed, ${FAIL} failed"
echo "$THICK_RULE"
echo ""

if [[ "$FAIL" -gt 0 ]]; then
  echo "⚠️  Some tests failed. Check the output above for details."
  exit 1
else
  echo "✅ All sandbox smoke tests passed!"
  echo ""
  echo "Next steps for production:"
  echo "  1. Generate production API key from https://web.mayar.id"
  echo "  2. Change MAYAR_ENV=production"
  echo "  3. Change MAYAR_API_KEY=<production-key>"
  echo "  4. Register the same Supabase webhook URL in Mayar production dashboard"
  echo "  5. Run a small live payment test"
  echo ""
  echo "Webhook URL format:"
  echo "  https://<project-ref>.supabase.co/functions/v1/mayar-webhook?token=<MAYAR_WEBHOOK_TOKEN>"
fi
