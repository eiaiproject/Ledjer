#!/usr/bin/env bash
# scripts/verify-env.sh
# Verifies that required environment variables are set for local development or deployment.
# Usage: bash scripts/verify-env.sh
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

ERRORS=0

check_var() {
  local var_name="$1"
  local required="${2:-false}"
  local value="${!var_name:-}"

  if [[ -z "$value" ]]; then
    if [[ $required == "true" ]]; then
      echo -e "${RED}✗ MISSING (required):${NC} $var_name"
      ERRORS=$((ERRORS + 1))
    else
      echo -e "${YELLOW}○ Not set (optional):${NC} $var_name"
    fi
    return
  fi

  # Check for obvious placeholder values
  case "$value" in
    *your-*|*example*|placeholder*)
      if [[ $required == "true" ]]; then
        echo -e "${RED}✗ PLACEHOLDER (required):${NC} $var_name = $value"
        ERRORS=$((ERRORS + 1))
      else
        echo -e "${YELLOW}○ Placeholder (optional):${NC} $var_name"
      fi
      ;;
    *)
      echo -e "${GREEN}✓ Set:${NC} $var_name"
      ;;
  esac
}

echo "=== Environment Variable Check ==="
echo ""

# Frontend vars (Vite) — loaded from .env.local if present
if [[ -f apps/web/.env.local ]]; then
  echo "Loading apps/web/.env.local"
  set -a
  # shellcheck disable=SC1091
  source apps/web/.env.local
  set +a
else
  echo -e "${YELLOW}apps/web/.env.local not found${NC}"
fi

echo ""
echo "--- Frontend (optional for Vite build) ---"
check_var "VITE_API_BASE_URL" false
check_var "VITE_SENTRY_DSN" false

echo ""
echo "--- Worker / Server (optional locally, configure for deploy) ---"
check_var "APP_ORIGIN" false
check_var "EMAIL_API_KEY" false
check_var "GOOGLE_CLIENT_ID" false
check_var "GOOGLE_CLIENT_SECRET" false
check_var "SENTRY_DSN" false

echo ""
if [[ $ERRORS -gt 0 ]]; then
  echo -e "${RED}Failed: $ERRORS required variable(s) missing or placeholder.${NC}"
  echo "Copy apps/web/.env.example → apps/web/.env.local and fill in real values."
  exit 1
else
  echo -e "${GREEN}All required variables OK.${NC}"
fi
