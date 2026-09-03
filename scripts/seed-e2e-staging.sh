#!/usr/bin/env bash
# Seed the remote staging D1 database with the E2E fixture user + org.
# Use this after the staging database has been reset (e.g. `wrangler d1
# migrations apply --env=staging --remote` on a fresh DB) so the CI E2E
# workflow (e2e-staging.yml) can log in again.
#
# The MVP register endpoint creates the user, their organization, and the
# default chart of accounts in one call — so seeding is just an idempotent
# registration via the public API. No direct SQL needed.
#
# Usage:
#   bash scripts/seed-e2e-staging.sh
#
# Overrides (must match the values used by e2e-staging.yml):
#   E2E_EMAIL / E2E_PASSWORD / E2E_BASE_URL
set -euo pipefail

BASE_URL="${E2E_BASE_URL:-https://ledjer-staging.eiai.workers.dev}"
EMAIL="${E2E_EMAIL:-staging@yopmail.com}"
PASSWORD="${E2E_PASSWORD:-Staging1234}"
FULL_NAME='Ledjer E2E'
ORG_NAME='Ledjer E2E Test'

echo "[seed-e2e-staging] target: $BASE_URL"
echo "[seed-e2e-staging] email:  $EMAIL"

# ── Register via the API (idempotent) ──────────────────────────
# The register endpoint hashes the password with the worker's runtime
# PASSWORD_PEPPER (unknown locally), so we create the account through the
# API. A repeated run hits email_taken (409/400) — that is a success here.
echo "[seed-e2e-staging] registering $EMAIL..."
STATUS="$(curl -sS -X POST "$BASE_URL/api/auth/register" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"fullName\":\"$FULL_NAME\",\"organizationName\":\"$ORG_NAME\"}" \
  -o /tmp/ledjer-seed-register.json -w '%{http_code}')"
echo "[seed-e2e-staging] register status: $STATUS"

if [[ "$STATUS" != "200" && "$STATUS" != "201" && "$STATUS" != "409" && "$STATUS" != "400" ]]; then
  echo "[seed-e2e-staging] ERROR: register failed with status $STATUS" >&2
  cat /tmp/ledjer-seed-register.json >&2 || true
  exit 1
fi

echo "[seed-e2e-staging] done. Verify login with:"
echo "  curl -s -X POST $BASE_URL/api/auth/login -H 'Content-Type: application/json' -d '{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}'"