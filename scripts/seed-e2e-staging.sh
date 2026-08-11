#!/usr/bin/env bash
# Seed the remote staging D1 database with the E2E fixture user + org.
# Use this after the staging database has been reset (e.g. `wrangler d1
# migrations apply --env=staging --remote` on a fresh DB) so the CI E2E
# workflow (e2e-staging.yml) can log in again.
#
# Idempotent — safe to run any time. Requires wrangler authenticated with
# access to the `ledjer-staging` D1 database.
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
ORG_ID="${E2E_ORG_ID:-046e96ee-6399-4704-ad25-66bc7f917742}"
FULL_NAME='Ledjer E2E'
BOOKS_START_DATE='2026-01-01'

echo "[seed-e2e-staging] target: $BASE_URL"
echo "[seed-e2e-staging] email:  $EMAIL"

# ── 1. Register via the API ──────────────────────────────────────
# The register endpoint hashes the password with the worker's runtime
# PASSWORD_PEPPER (unknown locally), so we create the account through the
# API instead of writing a hash directly. Anti-enumeration means the
# response is the same whether the account existed or was just created.
echo "[seed-e2e-staging] registering $EMAIL (idempotent)..."
curl -sS -X POST "$BASE_URL/api/auth/register" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"fullName\":\"$FULL_NAME\"}" \
  -o /tmp/ledjer-seed-register.json -w '%{http_code}\n' \
  | sed 's/^/[seed-e2e-staging] register status: /'

# ── 2. Build SQL: verify email + upsert org/membership + accounts ─
# The E2E org id is hardcoded in apps/web/e2e/helpers/auth.ts.
SQL_FILE="$(mktemp /tmp/ledjer-seed-staging.XXXXXX.sql)"
node - "$EMAIL" "$ORG_ID" "$BOOKS_START_DATE" > "$SQL_FILE" <<'NODE'
const [, , email, orgId, booksStartDate] = process.argv;
const now = `unixepoch('subsec') * 1000`;

// Mirror of DEFAULT_ACCOUNTS in worker/services/organization.service.ts.
const DEFAULT_ACCOUNTS = [
  { code: "1110", name: "Kas", accountType: "asset", normalBalance: "debit", isLocked: 1, isCashAccount: 1, cashAccountType: "cash", reportGroup: "Kas", accountSubtype: null },
  { code: "1120", name: "Bank", accountType: "asset", normalBalance: "debit", isLocked: 1, isCashAccount: 1, cashAccountType: "bank", reportGroup: "Bank", accountSubtype: null },
  { code: "1200", name: "Piutang Usaha", accountType: "asset", normalBalance: "debit", isLocked: 1, isCashAccount: 0, cashAccountType: null, reportGroup: "Piutang Usaha", accountSubtype: "accounts_receivable" },
  { code: "1300", name: "Persediaan Sederhana", accountType: "asset", normalBalance: "debit", isLocked: 0, isCashAccount: 0, cashAccountType: null, reportGroup: "Persediaan", accountSubtype: null },
  { code: "2100", name: "Utang Usaha", accountType: "liability", normalBalance: "credit", isLocked: 1, isCashAccount: 0, cashAccountType: null, reportGroup: "Utang Usaha", accountSubtype: "accounts_payable" },
  { code: "2200", name: "Beban Masih Harus Dibayar", accountType: "liability", normalBalance: "credit", isLocked: 0, isCashAccount: 0, cashAccountType: null, reportGroup: "Beban Belum Dibayar", accountSubtype: null },
  { code: "3100", name: "Modal Pemilik", accountType: "equity", normalBalance: "credit", isLocked: 1, isCashAccount: 0, cashAccountType: null, reportGroup: "Modal", accountSubtype: null },
  { code: "3200", name: "Saldo Awal", accountType: "equity", normalBalance: "credit", isLocked: 1, isCashAccount: 0, cashAccountType: null, reportGroup: "Saldo Awal", accountSubtype: null },
  { code: "3300", name: "Prive / Pengambilan Pemilik", accountType: "equity", normalBalance: "debit", isLocked: 1, isCashAccount: 0, cashAccountType: null, reportGroup: "Prive", accountSubtype: null },
  { code: "3400", name: "Saldo Laba", accountType: "equity", normalBalance: "credit", isLocked: 0, isCashAccount: 0, cashAccountType: null, reportGroup: "Saldo Laba", accountSubtype: null },
  { code: "3500", name: "Laba Tahun Berjalan", accountType: "equity", normalBalance: "credit", isLocked: 0, isCashAccount: 0, cashAccountType: null, reportGroup: "Laba Berjalan", accountSubtype: null },
  { code: "4100", name: "Pendapatan Penjualan Barang", accountType: "revenue", normalBalance: "credit", isLocked: 0, isCashAccount: 0, cashAccountType: null, reportGroup: "Pendapatan", accountSubtype: null },
  { code: "4200", name: "Pendapatan Jasa", accountType: "revenue", normalBalance: "credit", isLocked: 0, isCashAccount: 0, cashAccountType: null, reportGroup: "Pendapatan", accountSubtype: null },
  { code: "5100", name: "HPP / Beban Langsung", accountType: "cogs", normalBalance: "debit", isLocked: 0, isCashAccount: 0, cashAccountType: null, reportGroup: "Beban Langsung", accountSubtype: null },
  { code: "6110", name: "Beban Gaji", accountType: "expense", normalBalance: "debit", isLocked: 0, isCashAccount: 0, cashAccountType: null, reportGroup: "Beban Usaha", accountSubtype: null },
  { code: "6120", name: "Beban Sewa", accountType: "expense", normalBalance: "debit", isLocked: 0, isCashAccount: 0, cashAccountType: null, reportGroup: "Beban Usaha", accountSubtype: null },
  { code: "6130", name: "Beban Listrik dan Air", accountType: "expense", normalBalance: "debit", isLocked: 0, isCashAccount: 0, cashAccountType: null, reportGroup: "Beban Usaha", accountSubtype: null },
  { code: "6140", name: "Beban Internet dan Telepon", accountType: "expense", normalBalance: "debit", isLocked: 0, isCashAccount: 0, cashAccountType: null, reportGroup: "Beban Usaha", accountSubtype: null },
  { code: "6150", name: "Beban Transportasi", accountType: "expense", normalBalance: "debit", isLocked: 0, isCashAccount: 0, cashAccountType: null, reportGroup: "Beban Usaha", accountSubtype: null },
  { code: "6160", name: "Beban Iklan dan Promosi", accountType: "expense", normalBalance: "debit", isLocked: 0, isCashAccount: 0, cashAccountType: null, reportGroup: "Beban Usaha", accountSubtype: null },
  { code: "6170", name: "Beban Perlengkapan", accountType: "expense", normalBalance: "debit", isLocked: 0, isCashAccount: 0, cashAccountType: null, reportGroup: "Beban Usaha", accountSubtype: null },
  { code: "6180", name: "Beban Software", accountType: "expense", normalBalance: "debit", isLocked: 0, isCashAccount: 0, cashAccountType: null, reportGroup: "Beban Usaha", accountSubtype: null },
  { code: "6190", name: "Beban Lain-lain", accountType: "expense", normalBalance: "debit", isLocked: 0, isCashAccount: 0, cashAccountType: null, reportGroup: "Beban Usaha", accountSubtype: null },
  { code: "7100", name: "Pendapatan Lain-lain", accountType: "other_income", normalBalance: "credit", isLocked: 0, isCashAccount: 0, cashAccountType: null, reportGroup: "Pendapatan Lain", accountSubtype: null },
  { code: "8100", name: "Beban Lain-lain", accountType: "other_expense", normalBalance: "debit", isLocked: 0, isCashAccount: 0, cashAccountType: null, reportGroup: "Beban Lain", accountSubtype: null },
  { code: "8300", name: "Beban Pajak Penghasilan", accountType: "other_expense", normalBalance: "debit", isLocked: 0, isCashAccount: 0, cashAccountType: null, reportGroup: "Pajak", accountSubtype: null },
];

const values = DEFAULT_ACCOUNTS
  .map((a) =>
    `('${a.code}', '${a.name.replace(/'/g, "''")}', '${a.accountType}', '${a.normalBalance}', ${a.isLocked}, ${a.isCashAccount}, ${a.cashAccountType ? `'${a.cashAccountType}'` : "NULL"}, '${a.reportGroup}', ${a.accountSubtype ? `'${a.accountSubtype}'` : "NULL"})`,
  )
  .join(",\n  ");

process.stdout.write(`-- Generated by scripts/seed-e2e-staging.sh (idempotent)
PRAGMA foreign_keys = ON;

-- 1. Mark email as verified (register API already created the user).
UPDATE users
SET email_verified_at = COALESCE(email_verified_at, ${now}),
    updated_at = ${now}
WHERE email = '${email}';

-- 2. Ensure the E2E org exists (id matches helpers/auth.ts).
INSERT OR IGNORE INTO organizations
  (id, name, business_type, base_currency, books_start_date, default_reporting_period, onboarding_status, created_by, created_at, updated_at)
SELECT '${orgId}', 'Ledjer E2E Test', 'simple_trading', 'IDR', '${booksStartDate}', 'monthly', 'completed',
       u.id, ${now}, ${now}
FROM users u
WHERE u.email = '${email}';

-- 3. Ensure owner membership.
INSERT OR IGNORE INTO organization_members
  (id, organization_id, user_id, role, status, joined_at, created_at, updated_at)
SELECT 'seed-owner', '${orgId}', u.id, 'owner', 'active', ${now}, ${now}, ${now}
FROM users u
WHERE u.email = '${email}';

-- 4. Default chart of accounts (only when the org has none yet).
INSERT INTO accounts
  (id, organization_id, code, name, account_type, normal_balance, is_system, is_locked, is_active, is_cash_account, cash_account_type, report_group, account_subtype, created_at, updated_at)
SELECT lower(hex(randomblob(16))), '${orgId}', v.code, v.name, v.account_type, v.normal_balance, 1, v.is_locked, 1, v.is_cash_account, v.cash_account_type, v.report_group, v.account_subtype, ${now}, ${now}
FROM (VALUES
  ${values}
) AS v(code, name, account_type, normal_balance, is_locked, is_cash_account, cash_account_type, report_group, account_subtype)
WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE organization_id = '${orgId}');

-- 5. Sanity counters.
SELECT 'users' AS what, COUNT(*) AS n FROM users WHERE email = '${email}'
UNION ALL SELECT 'orgs', COUNT(*) FROM organizations WHERE id = '${orgId}'
UNION ALL SELECT 'members', COUNT(*) FROM organization_members WHERE organization_id = '${orgId}'
UNION ALL SELECT 'accounts', COUNT(*) FROM accounts WHERE organization_id = '${orgId}';
`);
NODE

echo "[seed-e2e-staging] applying SQL via wrangler d1 execute (--env=staging --remote)..."
cd "$(dirname "$0")/../apps/web"
npx wrangler d1 execute DB --env=staging --remote --file "$SQL_FILE"

rm -f "$SQL_FILE"
echo "[seed-e2e-staging] done. Verify login with:"
echo "  curl -s -X POST $BASE_URL/api/auth/login -H 'Content-Type: application/json' -d '{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}'"
