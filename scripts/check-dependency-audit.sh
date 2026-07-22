#!/usr/bin/env bash
# Dependency audit script for Ledjer CI.
#
# Enforces:
#   - Critical vulnerabilities: BLOCK CI (exit 1)
#   - High vulnerabilities: BLOCK CI unless an active exception exists
#   - Medium vulnerabilities: WARN only
#
# Exception file format (docs/compliance/dependency-exceptions.json):
# [
#   {
#     "package": "package-name",
#     "advisoryId": "GHSA-xxxx-xxxx-xxxx",
#     "severity": "high",
#     "justification": "Describe why this is acceptable",
#     "compensatingControl": "Describe compensating control",
#     "owner": "@username",
#     "createdAt": "2026-01-01",
#     "expiresAt": "2026-07-01"
#   }
# ]
#
set -euo pipefail

EXCEPTIONS_FILE="docs/compliance/dependency-exceptions.json"

# Run pnpm audit and capture output
echo "=== Running pnpm audit ==="
AUDIT_OUTPUT=$(pnpm audit --audit-level=low --json 2>/dev/null || true)

if [[ -z "$AUDIT_OUTPUT" ]]; then
  echo "[audit] No vulnerabilities found or audit JSON empty"
  exit 0
fi

# Parse vulnerabilities
CRITICAL=$(echo "$AUDIT_OUTPUT" | jq 'select(.type == "auditSummary") | .data.vulnerabilities.critical // 0' 2>/dev/null || echo "0")
HIGH=$(echo "$AUDIT_OUTPUT" | jq 'select(.type == "auditSummary") | .data.vulnerabilities.high // 0' 2>/dev/null || echo "0")
MEDIUM=$(echo "$AUDIT_OUTPUT" | jq 'select(.type == "auditSummary") | .data.vulnerabilities.medium // 0' 2>/dev/null || echo "0")

echo "[audit] Vulnerabilities: critical=$CRITICAL high=$HIGH medium=$MEDIUM"

# Load exceptions
declare -A EXCEPTION_MAP
if [[ -f "$EXCEPTIONS_FILE" ]]; then
  EXCEPTION_COUNT=$(jq length "$EXCEPTIONS_FILE" 2>/dev/null || echo "0")
  echo "[audit] Found $EXCEPTION_COUNT dependency exception(s) in $EXCEPTIONS_FILE"
  for i in $(seq 0 $((EXCEPTION_COUNT - 1))); do
    PACKAGE=$(jq -r ".[$i].package" "$EXCEPTIONS_FILE" 2>/dev/null || echo "")
    ADVISORY=$(jq -r ".[$i].advisoryId" "$EXCEPTIONS_FILE" 2>/dev/null || echo "")
    EXPIRES=$(jq -r ".[$i].expiresAt" "$EXCEPTIONS_FILE" 2>/dev/null || echo "")
    if [[ -n "$PACKAGE" && -n "$ADVISORY" && -n "$EXPIRES" ]]; then
      TODAY=$(date +%Y%m%d)
      EXPIRY_DATE=$(echo "$EXPIRES" | tr -d '-' | head -c 8)
      if [[ "$EXPIRY_DATE" -ge "$TODAY" ]]; then
        KEY="${PACKAGE}:${ADVISORY}"
        EXCEPTION_MAP[$KEY]="active"
      else
        echo "[audit] ⚠️  Expired exception for $PACKAGE/$ADVISORY (expired $EXPIRES)"
        exit 1
      fi
    fi
  done
else
  echo "[audit] No exceptions file found at $EXCEPTIONS_FILE (all findings are blocking)"
fi

# Check critical findings
if [[ "$CRITICAL" -gt 0 ]]; then
  echo ""
  echo "❌ CRITICAL vulnerabilities found: $CRITICAL"
  echo "   Critical vulnerabilities always block CI."
  echo "   Fix them or add an exception (not recommended for critical)."
  exit 1
fi

# Check high findings
if [[ "$HIGH" -gt 0 ]]; then
  echo ""
  echo "=== Checking high-severity findings against exceptions ==="
  # Extract high severity advisories
  echo "$AUDIT_OUTPUT" | jq -c 'select(.type == "advisory") | select(.data.severity == "high") | {package: .data.module_name, id: .data.advisory.id}' 2>/dev/null | while read -r ADV; do
    PACKAGE=$(echo "$ADV" | jq -r '.package')
    ADVISORY_ID=$(echo "$ADV" | jq -r '.id')
    KEY="${PACKAGE}:${ADVISORY_ID}"
    if [[ -z "${EXCEPTION_MAP[$KEY]:-}" ]]; then
      echo "   ⚠️  $PACKAGE ($ADVISORY_ID): No active exception found"
      HAS_UNEXCEPTED_HIGH=1
    else
      echo "   ✓ $PACKAGE ($ADVISORY_ID): Covered by active exception"
    fi
  done

  if [[ "${HAS_UNEXCEPTED_HIGH:-0}" -eq 1 ]]; then
    echo ""
    echo "❌ High-severity vulnerabilities found without active exceptions."
    echo "   Either fix them or add an exception to $EXCEPTIONS_FILE."
    exit 1
  fi
fi

# Warn about medium
if [[ "$MEDIUM" -gt 0 ]]; then
  echo ""
  echo "⚠️  Medium-severity vulnerabilities: $MEDIUM"
  echo "   Review and triage."
fi

echo ""
echo "✅ Dependency audit passed"
exit 0
