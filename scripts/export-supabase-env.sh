#!/usr/bin/env bash
# Export local Supabase API keys from `supabase status --output env`.
set -euo pipefail

ENV_FILE="${SUPABASE_STATUS_ENV_FILE:-/tmp/supabase.env}"
REQUIRE_SERVICE_ROLE="${REQUIRE_SERVICE_ROLE:-1}"

supabase status --workdir . --output env > "$ENV_FILE"

# shellcheck disable=SC1090
source "$ENV_FILE"

supabase_url="${API_URL:-${SUPABASE_URL:-http://localhost:54321}}"
supabase_anon_key="${ANON_KEY:-${SUPABASE_ANON_KEY:-}}"
supabase_service_role_key="${SERVICE_ROLE_KEY:-${SUPABASE_SERVICE_ROLE_KEY:-}}"

if [ -z "$supabase_anon_key" ]; then
  echo '::error::SUPABASE_ANON_KEY is empty after export. Check supabase status output.'
  exit 1
fi

if [ "$REQUIRE_SERVICE_ROLE" = "1" ] && [ -z "$supabase_service_role_key" ]; then
  echo '::error::SUPABASE_SERVICE_ROLE_KEY is empty after export. Check supabase status output.'
  exit 1
fi

if [ -n "${GITHUB_ENV:-}" ]; then
  echo "::add-mask::$supabase_anon_key"
  if [ -n "$supabase_service_role_key" ]; then
    echo "::add-mask::$supabase_service_role_key"
  fi

  {
    echo "SUPABASE_URL=$supabase_url"
    echo "SUPABASE_ANON_KEY=$supabase_anon_key"
    echo "VITE_SUPABASE_URL=$supabase_url"
    echo "VITE_SUPABASE_ANON_KEY=$supabase_anon_key"
    if [ -n "$supabase_service_role_key" ]; then
      echo "SUPABASE_SERVICE_ROLE_KEY=$supabase_service_role_key"
    fi
  } >> "$GITHUB_ENV"
else
  printf 'SUPABASE_URL=%q\n' "$supabase_url"
  printf 'SUPABASE_ANON_KEY=%q\n' "$supabase_anon_key"
  if [ -n "$supabase_service_role_key" ]; then
    printf 'SUPABASE_SERVICE_ROLE_KEY=%q\n' "$supabase_service_role_key"
  fi
fi
