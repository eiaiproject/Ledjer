# Ledjer - Accounting Rules Reference (MVP Cash-Only)

This document describes the accounting model actually implemented in the MVP:
5 cash-based transaction types posted as balanced double-entry journals against a
default chart of accounts. It is the single source of truth for the current
schema (`apps/web/worker/db/migrations`).

> Scope note: receivables/payables at the party level, product/inventory with
> moving-average cost, opening balances, manual journals, and invoice-level
> settlement are **not** part of the MVP. Proposals for those live in
> [docs/api/p1-*](docs/api) and in the pre-MVP git history; do not assume any of
> them exist in the codebase.

## Transaction Types

| Type | Meaning | Debit | Credit |
|------|---------|-------|--------|
| `cash_in` | Uang masuk (sale/revenue received) | Cash/Bank | Income account |
| `cash_out` | Uang keluar (expense paid) | Expense account | Cash/Bank |
| `transfer` | Pindah antar kas/bank | Destination Cash/Bank | Source Cash/Bank |
| `owner_deposit` | Setoran modal pemilik | Cash/Bank | Equity account |
| `owner_withdrawal` | Pengambilan pemilik | Equity account | Cash/Bank |

Validation rules enforced by `transactions.service.ts` (`validateTransaction`):

- The **cash side** must always be an active cash/bank account (`account_subtype`
  is `cash` or `bank`, `is_active = 1`).
- The **counter account** must be active and its class must match the type:
  - `cash_in` → `income`
  - `cash_out` → `expense`
  - `transfer` → a different active cash/bank account (source ≠ destination)
  - `owner_deposit` / `owner_withdrawal` → `equity`
- Every transaction produces exactly one journal entry with two journal lines
  (one debit, one credit). Balance is enforced by `assertJournalBalanced()`
  (total debit must equal total credit) and again by the DB `CHECK` on
  `journal_lines`.

## Chart of Accounts

14 default accounts are created automatically on registration
(`DEFAULT_ACCOUNTS` in `organization.service.ts`):

| Code | Name | Class | Subtype |
|------|------|-------|---------|
| 1110 | Kas | asset | cash |
| 1120 | Bank | asset | bank |
| 3110 | Modal Pemilik | equity | - |
| 3120 | Pengambilan Pemilik | equity | - |
| 4110 | Pendapatan Usaha | income | - |
| 4120 | Pendapatan Lain | income | - |
| 6110 | Beban Gaji & Upah | expense | - |
| 6120 | Beban Sewa | expense | - |
| 6130 | Beban Pemasaran | expense | - |
| 6140 | Beban Transportasi | expense | - |
| 6150 | Beban Komunikasi & Internet | expense | - |
| 6160 | Beban Perlengkapan | expense | - |
| 6170 | Beban Administrasi | expense | - |
| 6180 | Beban Lain-lain | expense | - |

Account management rules (`accounts.service.ts`):

- Users may only **create additional cash/bank accounts** (subtype `cash` or
  `bank`); codes are auto-generated as `max(cash/bank code) + 10`.
- Accounts can be renamed or activated/deactivated. **System accounts**
  (`is_system = 1`, the 14 defaults) cannot be deactivated, and an account that
  is referenced by a posted transaction cannot be deactivated either.
- Normal balance by class: `asset`/`expense` = debit; `liability`/`equity`/
  `income` = credit. There is no `normal_balance` column; it is derived from
  `account_class`.

## Validation & Safety

- Amounts are integer IDR, > 0, capped at Rp 999.999.999.999.
- Transaction dates use `YYYY-MM-DD`; future dates (relative to Asia/Jakarta)
  are rejected (`future_date_not_allowed`).
- **Idempotency**: every create request carries an idempotency key bound to a
  SHA-256 hash of the payload. Re-submitting the same key returns the original
  transaction (response header `Idempotent-Replay: true`); reusing a key with a
  *different* payload is rejected with 409 `idempotency_key_reused`.
- Rate limits: register (5/15 min per IP), login (10/15 min per IP+email),
  transaction create (60/min), void (20/min).

## Transaction Numbering

Format: `TRX-YYYYMMDD-XXXX` (e.g. `TRX-20260610-CD34`) - unique per date with a
4-character random suffix from an unambiguous alphabet; **not** sequential.
Uniqueness is enforced by a UNIQUE index plus a retry-on-collision loop.

## Void Behavior

A posted transaction can be voided (`POST /api/transactions/:id/void`, reason
optional, max 500 chars):

1. Transaction `status` flips `posted` → `voided`, recording `voided_at` and
   `void_reason`.
2. An audit log entry (`transaction_voided`) is written with the reason.

There is **no reversal journal entry**: reports and balances only read journal
lines whose transaction is `posted`, so voiding effectively reverses the impact
everywhere (dashboard, accounts, P&L, balance sheet, GL) without touching the
original journal. Voided transactions remain visible in the transaction list
with their journal intact for audit.

## Reports

All reports read journal lines of `posted` transactions only, scoped to the
current organization:

- **Laba Rugi (P&L)** - `income` accounts (credit − debit) and `expense`
  accounts (debit − credit) within a date range; `netIncome = income − expense`.
- **Neraca (balance sheet)** - as of a date: assets (debit − credit),
  liabilities (credit − debit), equity (credit − debit), plus `Laba Berjalan`
  (`NET`) = income − expense. A mismatch is logged to error monitoring.
- **Buku Besar (general ledger)** - every journal line in a date range, grouped
  per account and ordered chronologically, with a running balance expressed in
  the account's normal-balance direction. The running-balance window covers all
  lines up to the `toDate`, so the first visible line of each account already
  carries its opening balance. Bounded at 5,000 rows per request.

## Exports

CSV export of transactions (`GET /api/exports/transactions.csv`):

- UTF-8 with BOM so Indonesian spreadsheet apps render it correctly.
- Formula-injection protection: values beginning with `=`, `+`, `-`, `@`, or
  tab are prefixed with `'`; cells containing `,`/`"`/`'` are quoted.
- Hard cap of 50,000 rows (`export_too_large` otherwise) to protect Worker
  memory; count is checked before materializing rows.

## Organization / Multi-tenancy

Every account, transaction, journal entry, journal line, membership, and audit
log row carries `organization_id` and every query filters by it. The active
organization is resolved from the session; access requires an `owner`
membership (the only role in the MVP). See
[docs/architecture/tenant-isolation.md](architecture/tenant-isolation.md).

## Audit Log

User actions are recorded in `audit_logs`: registration/login/logout (auth
events), organization updates, account create/update, and transaction
create/void. Rows are retained 7 years by the daily cleanup cron (see
`maintenance.service.ts`).
