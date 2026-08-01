#!/usr/bin/env bash
# Seed the local (miniflare) D1 database with the E2E fixture user + org.
# Idempotent — safe to run after every fresh `wrangler d1 migrations apply --local`.
# The E2E suite (playwright local-full mode) logs in as ledjer@yopmail.com
# and asserts on the org 046e96ee-6399-4704-ad25-66bc7f917742.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_DIR="$ROOT/apps/web/.wrangler/state/v3/d1/miniflare-D1DatabaseObject"
DB="$(find "$DB_DIR" -maxdepth 1 -name '*.sqlite' ! -name 'metadata.sqlite' 2>/dev/null | head -1)"

if [[ -z "$DB" ]]; then
  echo "[seed-e2e-local] WARN: no local D1 database found (run db:migrations:apply:local first)" >&2
  exit 0
fi

EMAIL='ledjer@yopmail.com'
PASSWORD='Ledjer26#'
USER_ID='91175ffd-dea8-4e5e-9c83-7e2f5b6a4c21'
ORG_ID='046e96ee-6399-4704-ad25-66bc7f917742'
NOW="$(node -e 'process.stdout.write(String(Date.now()))')"

# PBKDF2-SHA256, 100k iterations, no pepper (local preview has no PASSWORD_PEPPER).
HASH="$(node -e '
const { pbkdf2Sync, randomBytes } = require("node:crypto");
const password = process.argv[1];
const salt = randomBytes(16);
const material = Buffer.from(`${password}\u0000`, "utf8");
const key = pbkdf2Sync(material, salt, 100_000, 32, "sha256");
process.stdout.write(`pbkdf2-sha256\$100000\$${salt.toString("base64")}\$${key.toString("base64")}`);
' "$PASSWORD")"

sqlite3 "$DB" <<SQL
INSERT OR IGNORE INTO users (id, email, password_hash, full_name, status, email_verified_at, created_at, updated_at)
VALUES ('$USER_ID', '$EMAIL', '$HASH', 'Ledjer E2E', 'active', $NOW, $NOW, $NOW);
INSERT OR IGNORE INTO organizations (id, name, business_type, base_currency, books_start_date, default_reporting_period, onboarding_status, created_by, created_at, updated_at)
VALUES ('$ORG_ID', 'Ledjer E2E Test', 'simple_trading', 'IDR', '2026-01-01', 'monthly', 'completed', '$USER_ID', $NOW, $NOW);
INSERT OR IGNORE INTO organization_members (id, organization_id, user_id, role, status, joined_at, created_at, updated_at)
VALUES ('seed-owner', '$ORG_ID', '$USER_ID', 'owner', 'active', $NOW, $NOW, $NOW);
SQL

echo "[seed-e2e-local] seeded $EMAIL -> $ORG_ID"
