# Master Prompt — Rewrite Ledjer Backend ke Cloudflare-Native

> **Cara pakai:** salin seluruh isi file ini ke AI coding agent apa pun, misalnya Cursor, Windsurf, Claude Code, Codex, Gemini CLI, OpenAI/Copilot agent, atau agent internal lain. Prompt ini dibuat model-agnostic dan tool-agnostic. Jika agent punya akses shell, git, dan editor file, agent harus langsung mengeksekusi. Jika tidak punya akses edit file, agent harus menghasilkan patch/diff dan daftar file yang perlu dibuat/diubah.

---

## 0. Identitas Tugas

Kamu adalah **senior full-stack cloud engineer + security engineer + accounting-domain engineer** yang ditugaskan untuk melakukan **rewrite backend Ledjer dari Supabase/Postgres ke Cloudflare-native stack**.

Project ini masih kosong secara bisnis:

- belum ada user nyata,
- belum ada transaksi nyata,
- belum ada data production yang perlu dimigrasikan,
- frontend sudah deploy ke Cloudflare Pages dengan custom domain,
- backend saat ini masih Supabase dan boleh dihapus/diganti total.

Tujuan utama bukan migrasi data, melainkan **port/rebuild domain model dan business logic** ke backend Cloudflare-native yang aman, testable, dan production-ready.

---

## 1. Target Akhir

Bangun Ledjer menjadi aplikasi full-stack Cloudflare-native:

```text
Browser
  ↓
Cloudflare Pages / Workers Static Assets
  ↓
Cloudflare Worker API
  ↓
Cloudflare D1
  ↓
R2 / KV / Queues / Cron / Durable Objects bila diperlukan
```

Target teknis:

- Frontend React/Vite tetap dipertahankan sejauh mungkin.
- Semua dependency runtime ke Supabase dihapus.
- Auth pindah ke Worker API + D1.
- Database pindah ke D1 dengan schema baru yang SQLite-compatible.
- RLS Supabase diganti authorization middleware di Worker.
- RPC PL/pgSQL diganti TypeScript service layer.
- Trigger Postgres diganti explicit service-layer writes.
- Storage/export file diarahkan ke R2 bila diperlukan.
- Async job diarahkan ke Queues bila diperlukan.
- Scheduled cleanup/maintenance diarahkan ke Cron Triggers bila diperlukan.
- Durable Object boleh digunakan sebagai coordinator per organization untuk operasi yang butuh serialization kuat.

---

## 2. Referensi Project Saat Ini

Repo Ledjer saat ini tampak seperti monorepo pnpm dengan struktur utama:

```text
apps/web/                  React + Vite frontend
apps/web/src/lib/supabase.ts
apps/web/src/pages/*       UI pages yang saat ini banyak bicara langsung ke Supabase
apps/web/e2e/*             Playwright E2E tests
packages/database-types/   Generated Supabase database types
supabase/migrations/*      Postgres schema, RLS, RPC, triggers
supabase/tests/*           SQL regression/security/accounting tests
.github/workflows/*        CI/deploy workflows
```

Frontend routes yang harus tetap hidup:

```text
/
/login
/register
/auth/callback
/forgot-password
/reset-password
/onboarding
/dashboard
/accounts
/products
/transactions
/transactions/new
/transactions/:id
/reports/trial-balance
/reports/profit-loss
/reports/balance-sheet
/reports/general-ledger
/settings/team
/invitations/accept
/legal/*
```

Fitur/domain penting yang harus dipertahankan:

```text
- Auth register/login/logout/reset password
- Email verification
- Organization onboarding
- Team invitation
- Role/permission matrix
- Chart of accounts
- Account code generation
- Products/inventory
- Parties/customers/vendors bila ada
- Transactions
- Journal entries
- Journal lines
- Opening balance
- Void transaction
- Idempotency transaction
- Trial balance
- Profit/loss
- Balance sheet
- General ledger
- CSV export/import security
- Audit logs
- Period lock / posting guard bila ada
```

Supabase files lama boleh dipakai sebagai **referensi domain**, bukan sebagai source of truth final.

---

## 3. Cloudflare Docs Basis

Gunakan docs resmi Cloudflare sebagai rujukan implementasi:

- React + Vite full-stack Workers: `https://developers.cloudflare.com/workers/framework-guides/web-apps/react/`
- Cloudflare Vite plugin: `https://developers.cloudflare.com/workers/vite-plugin/`
- Workers Static Assets: `https://developers.cloudflare.com/workers/static-assets/`
- D1 overview: `https://developers.cloudflare.com/d1/`
- D1 Worker API: `https://developers.cloudflare.com/d1/worker-api/d1-database/`
- D1 limits: `https://developers.cloudflare.com/d1/platform/limits/`
- D1 local development: `https://developers.cloudflare.com/d1/best-practices/local-development/`
- Wrangler commands: `https://developers.cloudflare.com/workers/wrangler/commands/`
- Durable Objects: `https://developers.cloudflare.com/durable-objects/`
- R2: `https://developers.cloudflare.com/r2/`
- Queues: `https://developers.cloudflare.com/queues/`
- Cron Triggers: `https://developers.cloudflare.com/workers/configuration/cron-triggers/`

Jika docs lokal/online berbeda dari prompt ini, prioritaskan docs resmi terbaru dan catat perbedaannya di laporan akhir.

---

## 4. Prinsip Eksekusi Agent

Ikuti aturan ini secara ketat:

1. **Jangan tanya hal yang bisa ditemukan dari repo.** Baca file dulu.
2. **Jangan menghapus fitur tanpa pengganti.** Jika belum bisa port penuh, tandai TODO eksplisit dan buat test yang gagal/skip dengan alasan.
3. **Jangan menggunakan secret palsu atau hardcoded secret.** Semua secret harus via environment/binding.
4. **Jangan simpan token auth di localStorage.** Gunakan HttpOnly Secure SameSite cookie untuk session.
5. **Jangan pakai floating number untuk uang.** Gunakan integer minor unit atau decimal string yang tervalidasi.
6. **Jangan membuat query D1 tanpa tenant scoping.** Semua data organisasi harus dibatasi `organization_id`.
7. **Jangan membiarkan frontend menulis journal langsung.** Semua posting accounting harus lewat Worker service.
8. **Jangan port Postgres SQL mentah ke D1.** D1 memakai SQLite semantics.
9. **Jangan bergantung pada RLS.** RLS Supabase harus diganti authorization middleware + service-layer checks.
10. **Jangan mengklaim selesai sebelum test relevan berjalan.** Jika test tidak bisa dijalankan, jelaskan penyebabnya.
11. **Gunakan perubahan kecil bertahap.** Setelah tiap fase, jalankan lint/typecheck/test yang relevan.
12. **Pertahankan UI/UX sebisa mungkin.** Fokus rewrite backend dan adapter client terlebih dahulu.
13. **Buat kode yang mudah diaudit.** Hindari magic logic tersembunyi.
14. **Buat laporan akhir berisi file yang diubah, test yang dijalankan, dan risiko tersisa.**

---

## 5. Definition of Done Global

Rewrite dianggap selesai bila semua kondisi ini terpenuhi:

- App bisa berjalan lokal dengan Cloudflare Worker runtime.
- Frontend tidak lagi import atau memanggil Supabase client.
- `@supabase/supabase-js` tidak lagi menjadi dependency runtime.
- Tidak ada `VITE_SUPABASE_URL` atau `VITE_SUPABASE_ANON_KEY` di env frontend.
- D1 migrations tersedia dan bisa dijalankan dari kosong.
- Auth register/login/logout/me/reset password berjalan via Worker API.
- Session memakai HttpOnly Secure cookie.
- Organization onboarding berjalan via Worker API.
- Accounts/products/transactions/reports/team invitation berjalan via Worker API.
- Accounting invariants dijaga oleh service layer.
- Test unit/integration/E2E yang relevan diperbarui dan lolos.
- CI diperbarui untuk Cloudflare/D1/Worker flow.
- Deploy Cloudflare production/staging terdokumentasi.

---

## 6. Target Struktur Repo

Pilih salah satu dari dua struktur ini. Prioritaskan opsi A jika ingin minimal perubahan monorepo.

### Opsi A — Worker di dalam `apps/web`

```text
apps/web/
  src/                         React frontend
  worker/
    index.ts                   Worker entrypoint
    env.ts                     Env/binding types
    routes/
      auth.routes.ts
      organizations.routes.ts
      accounts.routes.ts
      products.routes.ts
      transactions.routes.ts
      reports.routes.ts
      team.routes.ts
      exports.routes.ts
      health.routes.ts
    middleware/
      auth.middleware.ts
      csrf.middleware.ts
      permissions.middleware.ts
      rate-limit.middleware.ts
      error.middleware.ts
    services/
      auth.service.ts
      session.service.ts
      organization.service.ts
      accounting.service.ts
      accounts.service.ts
      products.service.ts
      transactions.service.ts
      reports.service.ts
      team.service.ts
      audit.service.ts
    db/
      client.ts
      migrations/
      schema.ts                optional typed query helpers
      repositories/
    auth/
      password.ts
      cookies.ts
      tokens.ts
      oauth.ts
    accounting/
      journal.ts
      posting.ts
      reports.ts
      money.ts
    tests/
      unit/
      integration/
```

### Opsi B — Separate app `apps/api`

```text
apps/web/                      React frontend only
apps/api/                      Cloudflare Worker API
packages/shared/               shared schemas/types/permissions
```

Pilih opsi B hanya jika repo tooling lebih cocok dipisah. Jangan memecah repo tanpa alasan jelas.

---

## 7. Dependencies yang Direkomendasikan

Gunakan dependency minimal dan auditable.

Recommended:

```text
wrangler
@cloudflare/vite-plugin
hono
zod
@hono/zod-validator atau validator custom
vitest
@cloudflare/vitest-pool-workers bila cocok
```

Untuk password hashing di Workers runtime, gunakan pendekatan yang kompatibel dengan Web Crypto/runtime Workers. Jangan menambahkan native Node package yang tidak kompatibel dengan Workers.

Hindari:

```text
bcrypt native
Node-only packages tanpa compatibility
ORM berat jika memperlambat porting
library auth opaque yang sulit diaudit
```

Jika memakai ORM/query builder, pastikan kompatibel dengan D1/SQLite dan Cloudflare Workers.

---

## 8. Environment dan Bindings

Frontend public env harus minimal:

```text
VITE_APP_ENV
VITE_SENTRY_DSN optional
VITE_API_BASE_URL optional, jika API beda origin
```

Worker env/bindings:

```text
DB                         D1Database binding
ASSETS                     optional static assets binding
R2_BUCKET                  optional R2 bucket binding
SESSION_SECRET             secret
PASSWORD_PEPPER            secret optional
EMAIL_API_KEY              secret, jika memakai email provider
GOOGLE_CLIENT_ID           secret/env, jika OAuth Google
GOOGLE_CLIENT_SECRET       secret, jika OAuth Google
SENTRY_DSN                 secret/env optional
APP_ORIGIN                 https://domain-production
COOKIE_DOMAIN              optional
```

Contoh `wrangler.jsonc` awal:

```jsonc
{
  "name": "ledjer",
  "main": "apps/web/worker/index.ts",
  "compatibility_date": "2026-07-07",
  "assets": {
    "directory": "apps/web/dist",
    "not_found_handling": "single-page-application"
  },
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "ledjer-production",
      "database_id": "REPLACE_WITH_CLOUDFLARE_D1_DATABASE_ID",
      "migrations_dir": "apps/web/worker/db/migrations"
    }
  ],
  "vars": {
    "APP_ORIGIN": "https://REPLACE_WITH_DOMAIN"
  }
}
```

Jangan commit `database_id` dummy untuk production final tanpa dokumentasi. Untuk template, boleh memakai placeholder.

---

## 9. API Contract Target

Implement API dengan prefix `/api`.

### Health

```text
GET /api/health
```

Return:

```json
{ "ok": true, "service": "ledjer-api", "runtime": "cloudflare-workers" }
```

### Auth

```text
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me
POST /api/auth/verify-email
POST /api/auth/forgot-password
POST /api/auth/reset-password
POST /api/auth/change-password
GET  /api/auth/google/start       optional
GET  /api/auth/google/callback    optional
```

Rules:

- Set session via HttpOnly Secure SameSite cookie.
- Rotate session on login.
- Delete/invalidate session on logout.
- Rate limit login and password reset.
- Never reveal whether email exists in forgot-password response.

### Organizations

```text
GET  /api/organizations
POST /api/organizations
GET  /api/organizations/current
POST /api/organizations/current
POST /api/onboarding/complete
```

### Accounts

```text
GET    /api/accounts
POST   /api/accounts
GET    /api/accounts/:id
PATCH  /api/accounts/:id
DELETE /api/accounts/:id
POST   /api/accounts/generate-code
GET    /api/accounts/cash-bank
```

### Products / Inventory

```text
GET    /api/products
POST   /api/products
GET    /api/products/:id
PATCH  /api/products/:id
DELETE /api/products/:id
GET    /api/inventory/movements
```

### Transactions

```text
GET  /api/transactions
POST /api/transactions
GET  /api/transactions/:id
POST /api/transactions/:id/void
```

### Reports

```text
GET /api/reports/trial-balance
GET /api/reports/profit-loss
GET /api/reports/balance-sheet
GET /api/reports/general-ledger
```

### Team

```text
GET    /api/team/members
POST   /api/team/invitations
POST   /api/team/invitations/accept
DELETE /api/team/invitations/:id
PATCH  /api/team/members/:id/role
DELETE /api/team/members/:id
```

### Exports

```text
GET /api/exports/accounts.csv
GET /api/exports/products.csv
GET /api/exports/transactions.csv
GET /api/exports/reports/general-ledger.csv
```

CSV security:

- Escape formula injection: values starting with `=`, `+`, `-`, `@`, tab, CR, LF must be prefixed/escaped safely.
- Set safe content headers.
- Never include another organization’s data.

---

## 10. D1 Schema Design Rules

Design D1 schema from first principles. Do not blindly convert Postgres.

General rules:

- Use `TEXT` UUID/ULID IDs generated in Worker.
- Use `INTEGER` timestamps as Unix milliseconds or ISO `TEXT`; choose one and use consistently.
- Use `INTEGER` for money minor unit.
- Use `TEXT CHECK (...)` for enum-like fields.
- Add `organization_id` to all tenant-scoped tables.
- Index all frequent filters by `organization_id` and date/status.
- Use foreign keys where D1/SQLite supports them, but do not rely only on FK for authorization.
- Every mutable table should have `created_at`, `updated_at`.
- Financial/audit tables should avoid hard delete.

Suggested core tables:

```text
users
sessions
email_verifications
password_reset_tokens
login_attempts
oauth_accounts
organizations
organization_members
organization_invitations
roles
permissions optional if dynamic
accounts
account_mappings
parties
products
transactions
transaction_lines
journal_entries
journal_lines
stock_movements
period_locks
organization_document_counters
audit_logs
export_jobs optional
```

Minimum indexes:

```sql
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_token_hash ON sessions(token_hash);
CREATE INDEX idx_members_user_org ON organization_members(user_id, organization_id);
CREATE INDEX idx_accounts_org ON accounts(organization_id);
CREATE INDEX idx_products_org ON products(organization_id);
CREATE INDEX idx_transactions_org_date ON transactions(organization_id, transaction_date);
CREATE INDEX idx_journal_entries_org_date ON journal_entries(organization_id, entry_date);
CREATE INDEX idx_journal_lines_org_account ON journal_lines(organization_id, account_id);
CREATE INDEX idx_audit_logs_org_created ON audit_logs(organization_id, created_at);
```

---

## 11. Money and Accounting Rules

Accounting invariants are non-negotiable.

### Money

Use integer minor unit:

```text
amount_minor INTEGER NOT NULL
```

For IDR-only MVP, `amount_minor` can mean rupiah. Never use JS float for persisted accounting amounts.

### Journal Invariants

Every posted journal entry must satisfy:

```text
sum(debit_minor) = sum(credit_minor)
sum(debit_minor) > 0
sum(credit_minor) > 0
```

Rules:

- `journal_entries` are append-only after posting.
- `journal_lines` are append-only after posting.
- Voiding a transaction creates reversing entries; it does not delete original entries.
- Posted transactions cannot be edited directly.
- Period lock blocks posting/voiding before or within locked dates, depending product rule.
- Every posting path must write `audit_logs`.
- Idempotency key is required for transaction creation to avoid duplicate posting.

### Service Boundary

Frontend may submit transaction intent, not raw journal lines.

Allowed frontend request shape:

```json
{
  "type": "sale",
  "transactionDate": "2026-07-07",
  "partyId": "...",
  "items": [
    { "productId": "...", "quantity": 1, "unitPriceMinor": 100000 }
  ],
  "payment": {
    "method": "cash",
    "accountId": "...",
    "paidAmountMinor": 100000
  },
  "idempotencyKey": "client-generated-key"
}
```

Worker service must derive:

```text
transactions
transaction_lines
journal_entries
journal_lines
stock_movements
audit_logs
document_number
```

### Durable Object Optional Rule

If race conditions can affect document numbering, stock, average cost, or idempotency, implement a Durable Object coordinator per organization:

```text
OrganizationPostingDO:<organization_id>
```

Do not add Durable Object prematurely if D1 transaction/batch + constraints are enough for MVP, but explicitly evaluate it.

---

## 12. Authorization Model

Replace Supabase RLS with explicit Worker authorization.

Middleware chain example:

```text
parseRequestId()
secureHeaders()
csrfProtectionIfCookieMutatingRequest()
requireAuth()
loadCurrentOrganization()
requireOrganizationMember()
requirePermission("transactions:create")
validateBody(schema)
handler()
```

Roles minimum:

```text
owner
admin
member
viewer
```

Permission examples:

```text
organization:read
organization:update
accounts:read
accounts:write
products:read
products:write
transactions:read
transactions:create
transactions:void
reports:read
team:read
team:manage
exports:create
```

Rules:

- `owner` cannot accidentally remove themselves if they are the last owner.
- Invitation acceptance must validate token hash, expiry, organization, email, and status.
- Users cannot access org data without active membership.
- All queries must include `organization_id` derived from server-side context, not trusted from request body.

---

## 13. Auth Implementation Requirements

Session design:

- Generate high-entropy random session token.
- Store only `token_hash` in D1.
- Set cookie with `HttpOnly`, `Secure`, `SameSite=Lax` or `Strict` depending flow.
- Include expiry and last-used timestamp.
- Rotate token on login and optionally periodically.
- Invalidate all sessions on password change.

Password rules:

- Use Workers-compatible password hashing.
- Add rate limiting per IP/email for login and reset.
- Do not leak account existence.
- Store password hash, never plaintext.

Email verification/reset:

- Store token hash, not token.
- Expire tokens.
- Single-use tokens.
- Do not log raw tokens.

CSRF:

- For cookie-auth mutating requests, enforce CSRF token or same-origin strategy.
- Validate Origin/Referer for state-changing requests.

---

## 14. Frontend Migration Rules

Remove direct Supabase usage.

Replace:

```text
supabase.auth.*
supabase.from(...)
supabase.rpc(...)
```

with typed API client:

```text
src/lib/api/client.ts
src/lib/api/auth.ts
src/lib/api/organizations.ts
src/lib/api/accounts.ts
src/lib/api/products.ts
src/lib/api/transactions.ts
src/lib/api/reports.ts
src/lib/api/team.ts
```

Client rules:

- Use `fetch` with `credentials: "include"`.
- Centralize error parsing.
- Centralize 401 handling.
- Preserve React Query keys but update query functions.
- Do not expose server secrets.
- Keep UI behavior as close as possible.

Remove/replace:

```text
apps/web/src/lib/supabase.ts
packages/database-types
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
Supabase auth callback assumptions
```

Update pages incrementally:

1. auth pages,
2. onboarding,
3. dashboard,
4. accounts,
5. products,
6. transactions,
7. reports,
8. team/invitations.

---

## 15. Testing Strategy

Port existing tests conceptually. Do not delete coverage just because backend changed.

### Unit Tests

Cover:

```text
money parsing/formatting
CSV escaping
permission matrix
session token hashing
password reset token hashing
journal balancing
posting builder
void/reversal logic
report calculations
```

### D1 Integration Tests

Run against local D1 where possible.

Cover:

```text
fresh migration from empty database
register/login/logout/me
organization onboarding
account creation/code generation
product creation
transaction posting
transaction idempotency
void transaction
trial balance
profit/loss
balance sheet
general ledger
team invitation
cross-organization access denial
```

### Golden Scenario Tests

Create accounting scenarios equivalent to old Supabase SQL tests:

```text
opening balance
cash sale
credit sale
partial payment
purchase inventory
payable behavior
void transaction
inventory average cost
period/date boundary report
```

Expected invariant after every scenario:

```text
total debit = total credit
trial balance balanced
reports match expected amounts
no data leaks across organizations
```

### E2E Tests

Update Playwright tests to use Cloudflare/Worker API instead of Supabase helpers.

Keep or replace tests named around:

```text
auth
onboarding
accounts
products-inventory
transactions
transaction-idempotency
void
reports
permissions
team-invite-security
csv-security
security-public
responsive
visual
```

---

## 16. CI/CD Requirements

Update GitHub Actions for Cloudflare-native stack.

CI should run:

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Add Worker/D1 checks:

```bash
pnpm wrangler d1 migrations list DB --local
pnpm wrangler d1 migrations apply DB --local
```

If using Vitest Workers pool, run Worker integration tests in CI.

Deploy workflow:

- Use least privilege GitHub permissions.
- Use Cloudflare API token via secret.
- Do not require Supabase secrets.
- Deploy frontend + Worker together if using Workers Static Assets.
- Or keep Cloudflare Pages but wire Pages Functions/Worker consistently.

Recommended GitHub permissions:

```yaml
permissions:
  contents: read
```

---

## 17. Migration / Rewrite Plan

Execute in phases. After each phase, run relevant tests and report status.

### Phase 0 — Discovery and Safety Baseline

Tasks:

- Inspect package manager and workspace.
- Inspect current Supabase usage with grep/search.
- Inspect migrations and SQL tests to identify domain logic.
- List frontend pages and current data access calls.
- Create implementation plan in `docs/cloudflare-rewrite-plan.md`.

Commands to try:

```bash
find . -maxdepth 4 -type f | sort
rg "supabase|rpc\(|from\(|auth\." apps packages supabase
rg "post_transaction|void_transaction|journal|trial_balance|profit_loss|balance_sheet" supabase apps packages
```

Deliverables:

- `docs/cloudflare-rewrite-plan.md`
- Inventory of Supabase dependencies.
- Mapping Supabase RPC → Worker service.

### Phase 1 — Cloudflare Worker Foundation

Tasks:

- Add Wrangler and Cloudflare Vite plugin if absent.
- Add Worker entrypoint.
- Add `/api/health` route.
- Add typed `Env` bindings.
- Add global error handler.
- Add secure headers for API responses.
- Configure local D1 binding.
- Add first D1 migration.

Acceptance:

```text
pnpm build passes
/api/health returns ok locally
D1 local migration applies from empty DB
```

### Phase 2 — D1 Schema Foundation

Tasks:

- Create D1 migrations for auth/org/accounting foundation.
- Add repositories/query helpers.
- Add seed/dev helpers only for local tests.
- Add migration test.

Acceptance:

```text
Fresh D1 database can apply all migrations.
Core indexes exist.
No Postgres-only syntax remains in D1 migrations.
```

### Phase 3 — Custom Auth

Tasks:

- Implement register/login/logout/me.
- Implement session cookie.
- Implement password hashing compatible with Workers.
- Implement email verification token storage, even if email send is stubbed in dev.
- Implement forgot/reset password backend flow.
- Update frontend auth provider/pages.
- Remove Supabase auth usage.

Acceptance:

```text
User can register, login, refresh page, remain authenticated, logout.
No token in localStorage.
Auth tests pass.
```

### Phase 4 — Organizations and Permissions

Tasks:

- Implement organization creation/onboarding.
- Implement membership and roles.
- Implement permission middleware.
- Implement current org selection.
- Update onboarding/dashboard guards.

Acceptance:

```text
Authenticated user can create org.
Org membership is required for org data.
Cross-org access tests fail closed.
```

### Phase 5 — Accounts and Chart of Accounts

Tasks:

- Port account schema.
- Implement default chart of accounts creation.
- Implement account code generation.
- Implement account CRUD with safety rules.
- Update frontend accounts page.

Acceptance:

```text
Accounts page works without Supabase.
Account code generation deterministic and tested.
System accounts protected from unsafe delete/edit.
```

### Phase 6 — Products and Inventory Foundation

Tasks:

- Port products schema.
- Implement product CRUD.
- Implement stock movement table.
- Implement inventory guards.
- Update products page.

Acceptance:

```text
Products page works without Supabase.
Inventory tests pass.
No unsafe cross-org access.
```

### Phase 7 — Accounting Transaction Posting

Tasks:

- Implement transaction intent schema validation.
- Implement `AccountingService.postTransaction`.
- Implement journal generation.
- Implement idempotency.
- Implement audit log write.
- Implement void/reversal.
- Update transaction pages.

Acceptance:

```text
Creating transaction creates transaction, journal entry, journal lines, audit log.
Journal always balances.
Duplicate idempotency key does not duplicate posting.
Void creates reversal, not deletion.
Transaction E2E passes.
```

### Phase 8 — Reports

Tasks:

- Implement trial balance.
- Implement profit/loss.
- Implement balance sheet.
- Implement general ledger.
- Implement date boundary rules.
- Update report pages.

Acceptance:

```text
Reports match golden scenarios.
Trial balance balances.
Date filters are inclusive/exclusive as product requires and tested.
```

### Phase 9 — Team Invitations

Tasks:

- Implement invitation create/list/revoke/accept.
- Implement email sending interface with dev stub.
- Update team settings and invitation accept page.

Acceptance:

```text
Owner/admin can invite.
Token is hashed in DB.
Expired/revoked/used invitations are rejected.
Cross-org invitation abuse is blocked.
```

### Phase 10 — Exports, R2, Queues, Cron

Tasks:

- Implement CSV exports with injection protection.
- For small exports, stream direct response.
- For large exports, create async job via Queue and store output in R2.
- Add Cron cleanup for expired sessions/tokens/export files.

Acceptance:

```text
CSV exports are safe.
Expired tokens cleanup works.
No export leaks cross-org data.
```

### Phase 11 — Remove Supabase Completely

Tasks:

- Remove Supabase dependency.
- Remove Supabase env vars.
- Remove or archive Supabase migrations/tests under `archive/supabase-reference/` if desired.
- Remove `packages/database-types` if only Supabase-generated.
- Update README and docs.
- Update CI/deploy workflows.

Acceptance:

```text
rg "supabase" returns only archived docs/reference notes, not runtime code.
App builds and tests without Supabase env.
Cloudflare deploy path documented.
```

---

## 18. Security Checklist

Before finalizing, verify:

- [ ] No secret committed.
- [ ] Cookies are HttpOnly, Secure, SameSite.
- [ ] Authenticated mutating requests have CSRF/origin protection.
- [ ] Login/reset have rate limiting.
- [ ] Tokens are stored hashed.
- [ ] Passwords are hashed with Workers-compatible secure hashing.
- [ ] No cross-org data leak.
- [ ] All tenant queries include server-derived `organization_id`.
- [ ] All input is validated with schema.
- [ ] All output errors are sanitized.
- [ ] Audit log exists for sensitive operations.
- [ ] CSV export formula injection is mitigated.
- [ ] Session invalidation works.
- [ ] Last owner cannot remove themselves accidentally.
- [ ] Invitation tokens expire and are single-use.
- [ ] Posted accounting data is immutable.

---

## 19. Accounting Checklist

Before finalizing, verify:

- [ ] All money stored as integer minor unit.
- [ ] No JS float used for persisted accounting calculations.
- [ ] Every posted journal is balanced.
- [ ] Void creates reversing entry.
- [ ] Posted transaction cannot be edited directly.
- [ ] Trial balance balances after every golden scenario.
- [ ] Profit/loss and balance sheet match expected scenario outputs.
- [ ] Inventory movement matches transaction lifecycle.
- [ ] Average cost logic, if implemented, is deterministic and tested.
- [ ] Opening balance can be posted once or according to explicit product rule.
- [ ] Period lock prevents unsafe posting/voiding.
- [ ] Idempotency prevents duplicate transaction posting.

---

## 20. Compatibility Checklist

Before finalizing, verify:

- [ ] Code runs in Cloudflare Workers runtime, not only Node.
- [ ] No Node-only API is used in Worker code unless compatibility is explicitly configured and tested.
- [ ] D1 migrations use SQLite-compatible syntax.
- [ ] Build output deploys to Cloudflare.
- [ ] Local development documented.
- [ ] Production deploy documented.
- [ ] Environment variables documented.
- [ ] Existing frontend routes still work.

---

## 21. Commands to Prefer

Use the project’s existing scripts where possible. If missing, add scripts rather than requiring long manual commands.

Suggested scripts:

```json
{
  "scripts": {
    "dev": "pnpm --filter @ledjer/web dev",
    "build": "pnpm --filter @ledjer/web build",
    "lint": "pnpm --filter @ledjer/web lint",
    "typecheck": "pnpm --filter @ledjer/web typecheck",
    "test": "pnpm --filter @ledjer/web test",
    "cf:dev": "wrangler dev",
    "cf:deploy": "wrangler deploy",
    "db:migrations:list": "wrangler d1 migrations list DB",
    "db:migrations:apply": "wrangler d1 migrations apply DB",
    "db:migrations:apply:local": "wrangler d1 migrations apply DB --local"
  }
}
```

Adjust names to match actual package names.

---

## 22. Required Final Report Format

At the end of each agent run, output:

```markdown
## Summary
- What changed
- What remains

## Files Changed
- path: purpose

## Tests Run
- command: result

## Not Run
- command: reason

## Security Notes
- any risk or decision

## Accounting Notes
- any invariant or edge case

## Next Steps
- ordered list
```

Do not claim “production ready” unless all relevant tests have run and passed.

---

## 23. Initial Prompt for the Agent to Execute

Use the following as the immediate task:

```text
You are working in the Ledjer repository. Rewrite the backend from Supabase to Cloudflare-native using Cloudflare Workers + D1, preserving the existing React/Vite frontend where possible.

Start by performing discovery. Read package files, frontend Supabase usage, Supabase migrations, SQL tests, and E2E tests. Then create docs/cloudflare-rewrite-plan.md with a concrete mapping from current Supabase features to Cloudflare-native replacements. After that, implement Phase 1: Worker foundation, /api/health, wrangler config, D1 local migration foundation, typed Env bindings, and basic test/build integration.

Do not remove Supabase runtime code yet unless Phase 1 can still build and tests are adjusted. Keep changes incremental. After implementation, run lint/typecheck/test/build commands that are available. Report files changed, tests run, failures, and next recommended phase.
```

---

## 24. Notes for Future Agents

If you continue from another agent’s work:

1. Read `docs/cloudflare-rewrite-plan.md` first.
2. Read the latest git diff/status.
3. Run the smallest relevant test before changing code.
4. Continue from the next incomplete phase.
5. Do not redo completed work unless tests prove it is broken.
6. Preserve accounting/security invariants over speed.

---

## 25. Non-Goals

Do not do these unless explicitly requested later:

- Do not redesign the entire UI.
- Do not add billing/payment provider yet.
- Do not add multi-currency unless already present and required.
- Do not add AI features.
- Do not create mobile app.
- Do not optimize for massive enterprise scale before core correctness.
- Do not migrate real data; there is no production data to migrate.

---

## 26. Product Bias

When tradeoffs arise, choose in this order:

1. accounting correctness,
2. tenant isolation/security,
3. testability,
4. maintainability,
5. deploy simplicity,
6. performance,
7. developer convenience.

For Ledjer, a slower but correct ledger is better than a fast ledger that can post unbalanced or unauthorized transactions.

