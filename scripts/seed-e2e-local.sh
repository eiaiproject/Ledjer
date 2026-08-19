#!/usr/bin/env bash
# Seed the local (miniflare) D1 database with the E2E fixture user + org.
# Idempotent — safe to run after every fresh `wrangler d1 migrations apply --local`.
# The E2E suite (playwright local-full mode) logs in as ledjer@yopmail.com
# and asserts on the org 046e96ee-6399-4704-ad25-66bc7f917742.
#
# This script seeds:
#   1. User + org + owner membership
#   2. Default chart of accounts (mirror of DEFAULT_ACCOUNTS in organization.service.ts)
#   3. A test customer party (needed by documents-crud + credit-sale tests)
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

# Generate SQL via node (accounts, party, hash) — keeps bash simple.
SQL_FILE="$(mktemp /tmp/seed-e2e-local.XXXXXX)"
node - "$EMAIL" "$PASSWORD" "$USER_ID" "$ORG_ID" > "$SQL_FILE" <<'NODE'
const crypto = require("node:crypto");
const [,, email, password, userId, orgId] = process.argv;
const now = Date.now();

// ── Password hash ───────────────────────────────────────────────
const salt = crypto.randomBytes(16);
const material = Buffer.from(`${password}\u0000`, "utf8");
const key = crypto.pbkdf2Sync(material, salt, 100_000, 32, "sha256");
const hash = `pbkdf2-sha256$100000$${salt.toString("base64")}$${key.toString("base64")}`;

// ── Party UUID ──────────────────────────────────────────────────
const partyId = crypto.randomUUID();

// ── Account UUIDs (25 default accounts) ─────────────────────────
// Mirror of DEFAULT_ACCOUNTS in worker/services/organization.service.ts.
const accounts = [
  { code: "1110", name: "Kas",                  type: "asset",         bal: "debit",  locked: 1, cash: 1, cashType: "cash",  group: "Kas",            sub: null },
  { code: "1120", name: "Bank",                 type: "asset",         bal: "debit",  locked: 1, cash: 1, cashType: "bank",  group: "Bank",           sub: null },
  { code: "1200", name: "Piutang Usaha",        type: "asset",         bal: "debit",  locked: 1, cash: 0, cashType: null,   group: "Piutang Usaha",  sub: "accounts_receivable" },
  { code: "1300", name: "Persediaan Sederhana", type: "asset",         bal: "debit",  locked: 0, cash: 0, cashType: null,   group: "Persediaan",     sub: null },
  { code: "2100", name: "Utang Usaha",          type: "liability",     bal: "credit", locked: 1, cash: 0, cashType: null,   group: "Utang Usaha",    sub: "accounts_payable" },
  { code: "2200", name: "Beban Masih Harus Dibayar", type: "liability",bal: "credit", locked: 0, cash: 0, cashType: null,  group: "Beban Belum Dibayar", sub: null },
  { code: "3100", name: "Modal Pemilik",        type: "equity",        bal: "credit", locked: 1, cash: 0, cashType: null,   group: "Modal",          sub: null },
  { code: "3200", name: "Saldo Awal",           type: "equity",        bal: "credit", locked: 1, cash: 0, cashType: null,   group: "Saldo Awal",     sub: null },
  { code: "3300", name: "Prive / Pengambilan Pemilik", type: "equity", bal: "debit",  locked: 1, cash: 0, cashType: null,  group: "Prive",          sub: null },
  { code: "3400", name: "Saldo Laba",           type: "equity",        bal: "credit", locked: 0, cash: 0, cashType: null,   group: "Saldo Laba",     sub: null },
  { code: "3500", name: "Laba Tahun Berjalan",  type: "equity",        bal: "credit", locked: 0, cash: 0, cashType: null,   group: "Laba Berjalan",  sub: null },
  { code: "4100", name: "Pendapatan Penjualan Barang", type: "revenue",bal: "credit", locked: 0, cash: 0, cashType: null,  group: "Pendapatan",     sub: null },
  { code: "4200", name: "Pendapatan Jasa",      type: "revenue",       bal: "credit", locked: 0, cash: 0, cashType: null,   group: "Pendapatan",     sub: null },
  { code: "5100", name: "HPP / Beban Langsung", type: "cogs",          bal: "debit",  locked: 0, cash: 0, cashType: null,   group: "Beban Langsung", sub: null },
  { code: "6110", name: "Beban Gaji",           type: "expense",       bal: "debit",  locked: 0, cash: 0, cashType: null,   group: "Beban Usaha",    sub: null },
  { code: "6120", name: "Beban Sewa",           type: "expense",       bal: "debit",  locked: 0, cash: 0, cashType: null,   group: "Beban Usaha",    sub: null },
  { code: "6130", name: "Beban Listrik dan Air",type: "expense",       bal: "debit",  locked: 0, cash: 0, cashType: null,   group: "Beban Usaha",    sub: null },
  { code: "6140", name: "Beban Internet dan Telepon", type: "expense", bal: "debit",  locked: 0, cash: 0, cashType: null,  group: "Beban Usaha",    sub: null },
  { code: "6150", name: "Beban Transportasi",   type: "expense",       bal: "debit",  locked: 0, cash: 0, cashType: null,   group: "Beban Usaha",    sub: null },
  { code: "6160", name: "Beban Iklan dan Promosi", type: "expense",    bal: "debit",  locked: 0, cash: 0, cashType: null,   group: "Beban Usaha",    sub: null },
  { code: "6170", name: "Beban Perlengkapan",   type: "expense",       bal: "debit",  locked: 0, cash: 0, cashType: null,   group: "Beban Usaha",    sub: null },
  { code: "6180", name: "Beban Software",       type: "expense",       bal: "debit",  locked: 0, cash: 0, cashType: null,   group: "Beban Usaha",    sub: null },
  { code: "6190", name: "Beban Lain-lain",      type: "expense",       bal: "debit",  locked: 0, cash: 0, cashType: null,   group: "Beban Usaha",    sub: null },
  { code: "7100", name: "Pendapatan Lain-lain", type: "other_income",  bal: "credit", locked: 0, cash: 0, cashType: null,   group: "Pendapatan Lain", sub: null },
  { code: "8100", name: "Beban Lain-lain",      type: "other_expense", bal: "debit",  locked: 0, cash: 0, cashType: null,   group: "Beban Lain",     sub: null },
  { code: "8300", name: "Beban Pajak Penghasilan", type: "other_expense",bal:"debit",  locked: 0, cash: 0, cashType: null,   group: "Pajak",          sub: null },
];

const accountLines = accounts.map(a => {
  const id = crypto.randomUUID();
  const ct = a.cashType ? `'${a.cashType}'` : "NULL";
  const sub = a.sub ? `'${a.sub}'` : "NULL";
  return `INSERT OR IGNORE INTO accounts
  (id, organization_id, code, name, account_type, normal_balance, is_system, is_locked, is_active, is_cash_account, cash_account_type, report_group, account_subtype, created_at, updated_at)
VALUES ('${id}', '${orgId}', '${a.code}', '${a.name}', '${a.type}', '${a.bal}', 1, ${a.locked}, 1, ${a.cash}, ${ct}, '${a.group}', ${sub}, ${now}, ${now});`;
}).join("\n");

process.stdout.write(`-- Generated by scripts/seed-e2e-local.sh
-- PBKDF2-SHA256 hash for password: ${password}

-- 1. User
INSERT OR IGNORE INTO users (id, email, password_hash, full_name, status, email_verified_at, created_at, updated_at)
VALUES ('${userId}', '${email}', '${hash}', 'Ledjer E2E', 'active', ${now}, ${now}, ${now});

-- 2. Organization
INSERT OR IGNORE INTO organizations (id, name, business_type, base_currency, books_start_date, default_reporting_period, onboarding_status, created_by, created_at, updated_at)
VALUES ('${orgId}', 'Ledjer E2E Test', 'simple_trading', 'IDR', '2026-01-01', 'monthly', 'completed', '${userId}', ${now}, ${now});

-- 3. Owner membership
INSERT OR IGNORE INTO organization_members (id, organization_id, user_id, role, status, joined_at, created_at, updated_at)
VALUES ('seed-owner', '${orgId}', '${userId}', 'owner', 'active', ${now}, ${now}, ${now});

-- 4. Default chart of accounts (required for transaction E2E tests)
${accountLines}

-- 5. Test customer party (required by documents-crud and credit-sale tests)
INSERT OR IGNORE INTO parties
  (id, organization_id, name, party_type, is_active, created_at, updated_at)
VALUES ('${partyId}', '${orgId}', 'Pelanggan E2E', 'customer', 1, ${now}, ${now});
`);
NODE

# Apply via sqlite3
sqlite3 "$DB" < "$SQL_FILE"
rm -f "$SQL_FILE"

echo "[seed-e2e-local] seeded $EMAIL -> $ORG_ID (accounts + party included)"
