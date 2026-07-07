# Ledjer Cloudflare-Native Rewrite Plan

Status: Phase 0 through Phase 11 complete.

This plan ports Ledjer from Supabase/Postgres to Cloudflare Workers + D1 while preserving the React/Vite frontend routes and current accounting behavior as much as possible. Supabase remains in runtime code until each domain is replaced by Worker APIs and tests.

## Current Stack Inventory

- Package manager: pnpm workspace, root app package `web` in `apps/web`.
- Frontend: React 19, Vite 8, TanStack Query, React Router, Tailwind.
- Current backend: Supabase Auth, PostgREST table access, PL/pgSQL RPCs, Postgres RLS, Postgres triggers.
- Current generated types: `packages/database-types`, consumed by frontend.
- Current CI/E2E: GitHub Actions start Supabase locally and Playwright helpers call Supabase REST/Auth endpoints directly.

## Supabase Runtime Usage

Runtime imports that must be replaced:

- `apps/web/src/lib/supabase.ts`: Supabase client bootstrap and frontend env validation.
- `apps/web/src/contexts/auth.tsx`: `supabase.auth.getSession`, auth state listener, sign in/up/out, resend confirmation.
- `apps/web/src/pages/auth-callback.tsx`: OAuth/recovery OTP callback assumptions.
- Auth pages: `login.tsx`, `register.tsx`, `forgot-password.tsx`, `reset-password.tsx`.
- Domain pages: `onboarding.tsx`, `dashboard.tsx`, `accounts/index.tsx`, `products/index.tsx`, `transactions/*`, reports, team, invitation accept.
- Shared helpers: `src/lib/csv-export.ts`, `src/lib/profiles.ts`, `src/hooks/useOrganization.ts`.

Direct frontend table access currently touches:

- `accounts`
- `journal_entries`
- `organization_members`
- `organizations`
- `parties`
- `products`
- `profiles`
- `transactions`

Frontend RPCs currently used:

- `accept_invitation`
- `create_invitation`
- `create_organization_with_opening_balances`
- `export_accounts_csv`
- `export_balance_sheet_csv`
- `export_general_ledger_csv`
- `export_products_csv`
- `export_profit_loss_csv`
- `export_transactions_csv`
- `export_trial_balance_csv`
- `get_balance_sheet`
- `get_dashboard_summary`
- `get_general_ledger`
- `get_invitations`
- `get_profit_loss`
- `get_trial_balance`
- `is_email_rate_limited`
- `post_transaction`
- `record_login_attempt`
- `record_login_attempt_pre_auth`
- `remove_staff`
- `revoke_invitation`
- `void_transaction`

## Supabase Domain References

Important Postgres functions/triggers to port conceptually:

- Auth/security: `record_login_attempt`, `record_login_attempt_pre_auth`, RLS policies, grants/revokes.
- Organization: `create_organization_with_opening_balances`, `protect_organization_core_fields`.
- Accounts: `create_default_accounts`, `create_cash_bank_account`, `rename_account`, `protect_account_fields`, account code generation fixes.
- Inventory: `recalculate_product_average_cost`, `protect_product_stock_update`, stock movement tests.
- Accounting: `post_opening_balance`, `post_transaction`, `void_transaction`, period lock enforcement.
- Reports: `get_trial_balance`, `get_profit_loss`, `get_balance_sheet`, `get_general_ledger`.
- Team: `create_invitation`, `accept_invitation`, `revoke_invitation`, `get_invitations`, `remove_staff`, `update_staff_permissions`.
- Exports: `csv_escape`, all `export_*_csv` functions, `check_export_permission`.
- Audit: account/product triggers and transaction audit writes become explicit service-layer writes.

SQL regression suites to preserve conceptually:

- `golden_scenario_tests.sql`
- `inventory_golden_tests.sql`
- `accounting_regression_tests.sql`
- `opening_balance_guard_tests.sql`
- `payable_behavior_tests.sql`
- `partial_payment_regression_tests.sql`
- `permission_matrix_tests.sql`
- `privilege_hardening_tests.sql`
- `stage4_production_tests.sql`
- `service_role_dml_tests.sql`
- `post_transaction_security_tests.sql`
- `account_code_generation_tests.sql`

## Target Cloudflare Architecture

- Worker API under `/api/*` in `apps/web/worker`.
- D1 binding `DB` with SQLite-compatible migrations in `apps/web/worker/db/migrations`.
- Static React assets served by Workers Static Assets with SPA fallback.
- Auth sessions stored in D1 and sent as HttpOnly Secure SameSite cookies.
- Supabase RLS replaced by Worker middleware: auth, CSRF/origin checks, organization membership, permission checks.
- PL/pgSQL RPCs replaced by TypeScript services and repositories.
- Postgres triggers replaced by explicit service-layer writes and tests.
- CSV export streams direct responses for small exports; R2/Queues can be added later for large exports.
- Durable Objects are deferred until D1 transaction/constraint behavior proves insufficient for org-level posting serialization.

## API Mapping

| Supabase behavior | Cloudflare replacement |
| --- | --- |
| `supabase.auth.signUp` | `POST /api/auth/register` |
| `supabase.auth.signInWithPassword` | `POST /api/auth/login` |
| `supabase.auth.signOut` | `POST /api/auth/logout` |
| `supabase.auth.getSession` | `GET /api/auth/me` |
| `supabase.auth.resend` | `POST /api/auth/verify-email` resend flow |
| `resetPasswordForEmail` | `POST /api/auth/forgot-password` |
| `updateUser({ password })` | `POST /api/auth/reset-password` |
| `is_email_rate_limited` | auth rate-limit middleware/service |
| `record_login_attempt*` | auth service writes to `login_attempts` |
| `create_organization_with_opening_balances` | `POST /api/onboarding/complete` and organization service |
| direct `organizations`/`organization_members` reads | `GET /api/organizations/current`, `GET /api/organizations` |
| direct `accounts` reads/writes | `/api/accounts` CRUD |
| `create_cash_bank_account` | `POST /api/accounts` or `POST /api/accounts/cash-bank` |
| `rename_account` | `PATCH /api/accounts/:id` |
| direct `products` reads/writes | `/api/products` CRUD |
| `post_transaction` | `POST /api/transactions` with transaction intent |
| direct `transactions` list/detail | `GET /api/transactions`, `GET /api/transactions/:id` |
| direct `journal_entries` detail | nested journal data in `GET /api/transactions/:id` |
| `void_transaction` | `POST /api/transactions/:id/void` |
| `get_dashboard_summary` | `GET /api/dashboard/summary` |
| report RPCs | `/api/reports/*` |
| invitation RPCs | `/api/team/invitations*` |
| `remove_staff`/permission RPC | `/api/team/members/:id` |
| CSV export RPCs | `/api/exports/*.csv` |
| `profiles` lookup | `GET /api/users/profiles?ids=...` or embedded actor metadata |

## Proposed D1 Tables

Initial full schema target:

- `users`
- `sessions`
- `email_verifications`
- `password_reset_tokens`
- `login_attempts`
- `oauth_accounts`
- `organizations`
- `organization_members`
- `organization_invitations`
- `accounts`
- `account_mappings`
- `parties`
- `products`
- `transactions`
- `transaction_lines`
- `journal_entries`
- `journal_lines`
- `stock_movements`
- `period_locks`
- `organization_document_counters`
- `audit_logs`
- `export_jobs` if async exports are needed

Schema rules:

- IDs are Worker-generated `TEXT` UUID/ULID values.
- Timestamps use Unix milliseconds as `INTEGER`.
- Money uses integer minor units only.
- Tenant tables include `organization_id` and indexes scoped by organization.
- Posted financial data is append-only; voiding creates reversal records.

## Phase Order

1. Phase 1: Worker foundation, `/api/health`, secure headers, error handler, Wrangler config, D1 migration foundation.
2. Phase 2: D1 schema foundation and repository helpers.
3. Phase 3: custom auth and frontend auth provider migration.
4. Phase 4: organizations, current org, membership and permissions.
5. Phase 5: accounts and chart of accounts.
6. Phase 6: products and inventory foundation.
7. Phase 7: transaction posting, journal generation, idempotency, void/reversal.
8. Phase 8: reports.
9. Phase 9: team invitations.
10. Phase 10: CSV exports, cleanup cron, optional R2/Queues.
11. Phase 11: remove Supabase dependency/env/runtime code and update CI/deploy.

## Phase 1 Acceptance Checks

- `pnpm build`
- `pnpm --filter web typecheck`
- `pnpm --filter web test`
- `pnpm --filter web exec wrangler d1 migrations apply DB --local`
- `/api/health` returns `{ "ok": true, "service": "ledjer-api", "runtime": "cloudflare-workers" }` under local Worker dev.

## Phase 2 Decisions

- D1 schema is in `apps/web/worker/db/migrations/0002_core_schema.sql`.
- Timestamps use Unix milliseconds in `INTEGER` columns.
- Money uses `*_minor INTEGER` columns.
- Product quantities and stock use `*_milli INTEGER` columns to avoid floating-point persistence.
- Tenant-scoped tables include `organization_id`; service code must derive that value server-side.
- Role values are the target Cloudflare-native roles: `owner`, `admin`, `member`, `viewer`.
- Journal line checks enforce one-sided positive debit/credit values; full journal balance remains a service-layer invariant.
- Posted accounting immutability is not implemented with D1 triggers. Later services must enforce append-only writes and reversal-only voids explicitly.

Phase 2 verification performed:

- `wrangler d1 migrations apply DB --local`
- fresh local apply with `--persist-to /tmp/...`
- `sqlite_master` queries for minimum core tables and indexes
- Worker schema contract tests in `apps/web/worker/db/schema.test.ts`

## Phase 3 Decisions

- Custom auth is implemented in the Worker under `/api/auth/*`.
- Sessions are stored in D1 as hashed opaque tokens and sent to the browser as an HttpOnly Secure SameSite=Lax `ledjer_session` cookie.
- Password hashing uses Worker-compatible Web Crypto PBKDF2-SHA256 with per-password salt and optional `PASSWORD_PEPPER`.
- Login failures are recorded in D1 and rate limited by email/IP before issuing a session.
- Email verification and password reset token storage is implemented with hashed tokens. Email delivery is still stubbed and must be wired to a provider in a later phase.
- Google OAuth is intentionally not configured yet and returns `oauth_not_configured`.
- Frontend auth provider and auth pages now call Worker API helpers instead of Supabase Auth.

Phase 3 verification performed:

- `pnpm --filter web lint`
- `pnpm --filter web test`
- `pnpm typecheck`
- `pnpm --filter web build`
- `pnpm --filter web db:migrations:apply:local`
- `pnpm --filter web db:migrations:list`
- Local HTTP smoke test for register, D1 email verification update, login, `/api/auth/me`, logout, and `/api/auth/me` after logout.

## Phase 4 Decisions

- Organization APIs are implemented under `/api/organizations/*`.
- `sessions.current_organization_id` tracks the selected organization for the current session.
- `GET /api/organizations/current` returns the selected active membership or falls back to the oldest active membership.
- `POST /api/organizations/current` validates active membership before switching current organization.
- Organization permissions are derived server-side from role values: `owner`, `admin`, `member`, `viewer`.
- Middleware exists for `requireAuth`, `loadCurrentOrganization`, and `requirePermission(...)` so later domain routes can replace Supabase RLS explicitly.
- Onboarding creates an organization, owner membership, sets current organization, and seeds 26 default chart-of-account rows.
- Positive opening balances are rejected with `opening_balances_not_supported` until accounting posting is ported. This avoids silently dropping user-entered balances.
- Frontend `useOrganization` and onboarding creation no longer call Supabase.

Phase 4 verification performed:

- `pnpm --filter web exec vitest run worker/organization.test.ts worker/index.test.ts worker/db/schema.test.ts`
- `pnpm --filter web lint`
- `pnpm --filter web test`
- `pnpm typecheck`
- `pnpm --filter web build`
- `pnpm --filter web db:migrations:apply:local`
- `pnpm --filter web db:migrations:list`
- Fresh D1 apply with `--persist-to /tmp/...`
- Local HTTP smoke test with two users:
  - user A created org A
  - user B created org B
  - user A could read current org A
  - user A received 403 for org B read and current-org switch
  - org A had 26 default account rows
  - positive opening balance create returned `opening_balances_not_supported`

## Phase 5 Decisions

- Account APIs are implemented under `/api/accounts/*`.
- Account routes require an authenticated session, current organization membership, and explicit permissions:
  - reads require `accounts:read`
  - writes require `accounts:write`
- Account queries always scope by the server-side current organization.
- `/accounts` page now uses Worker API helpers instead of Supabase table/RPC calls.
- Cash/bank account code generation is deterministic and server-side:
  - cash starts at `1111` to preserve default `1110`
  - bank starts at `1121` to preserve default `1120`
  - QRIS/e-wallet use `1130-1139`
  - the first unused gap is selected
- System or locked accounts cannot be deleted or deactivated.
- Locked accounts cannot be renamed.
- Custom non-system, non-locked accounts can be renamed and deleted.
- Account mutations write `audit_logs` records.
- Accounts CSV export is intentionally not ported yet; the accounts page now shows a “not available yet” toast until Phase 10.

Phase 5 verification performed:

- `pnpm --filter web exec vitest run worker/services/accounts.service.test.ts worker/organization.test.ts`
- `pnpm --filter web lint`
- `pnpm --filter web test`
- `pnpm --filter web typecheck`
- `pnpm typecheck`
- `pnpm --filter web build`
- `pnpm --filter web db:migrations:apply:local`
- `pnpm --filter web db:migrations:list`
- Fresh D1 apply with `--persist-to /tmp/...`
- Local HTTP smoke test:
  - new verified user created an organization
  - `GET /api/accounts` returned 26 default accounts
  - default `1110` and `1120` existed
  - `POST /api/accounts/generate-code` for cash returned `1111`
  - `POST /api/accounts/cash-bank` created `1111`
  - next generated cash code returned `1112`
  - custom account rename succeeded
  - locked default account rename returned `account_locked`
  - default account delete returned `account_protected`
  - custom account delete returned 204

## Phase 6 Decisions

- Product APIs are implemented under `/api/products/*`.
- Inventory movement reads are implemented under `/api/inventory/movements`.
- Product routes require an authenticated session, current organization membership, and explicit permissions:
  - reads require `products:read`
  - writes require `products:write`
- Product queries always scope by the server-side current organization.
- `/products` page now uses Worker API helpers instead of Supabase table/RPC calls.
- Product money values are persisted as integer minor units.
- Product stock and minimum stock are persisted as milli-unit integers and converted at the API boundary.
- Initial stock after organization onboarding is completed is rejected with `initial_stock_not_supported`.
- Initial stock is allowed only while onboarding is not completed; it writes an `opening` stock movement.
- Stock movements update product stock through the product service and reject negative stock with `insufficient_stock`.
- Average cost is updated only for positive `opening` and `purchase` movements with a unit cost.
- Product mutations write `audit_logs` records.
- Product CSV export is intentionally not ported yet; the products page now shows a "not available yet" toast until Phase 10.

Phase 6 verification performed:

- `pnpm --filter web exec vitest run worker/services/products.service.test.ts worker/services/accounts.service.test.ts worker/organization.test.ts`
- `pnpm --filter web lint`
- `pnpm --filter web test`
- `pnpm --filter web typecheck`
- `pnpm typecheck`
- `pnpm --filter web build`
- `pnpm --filter web db:migrations:apply:local`
- `pnpm --filter web db:migrations:list`
- Fresh D1 apply with `--persist-to /tmp/...`
- Local HTTP smoke test:
  - new verified user A created org A
  - `GET /api/products` returned 200
  - `POST /api/products` created a zero-stock product
  - `PATCH /api/products/:id` updated name, selling price, and minimum stock
  - duplicate product code returned `product_code_duplicate`
  - positive initial stock after onboarding returned `initial_stock_not_supported`
  - setting org A to `in_progress` allowed creating an opening-stock product
  - `GET /api/inventory/movements?productId=...` returned the opening movement
  - new verified user B created org B and product B
  - user A received 404 `product_not_found` when reading product B
  - `DELETE /api/products/:id` deactivated product A

## Phase 7 Decisions

- Transaction APIs are implemented under `/api/transactions/*`.
- Party lookup for transaction forms is implemented under `/api/parties`.
- Transaction routes require an authenticated session, current organization membership, and explicit permissions:
  - list/detail require `transactions:read`
  - create requires `transactions:create`
  - void requires `transactions:void`
  - journal detail requires `reports:read`
- Transaction pages now use Worker API helpers instead of Supabase table/RPC calls.
- Frontend submits transaction intent only; Worker derives transaction rows, transaction lines, journal entries, journal lines, stock movements, document numbers, and audit logs.
- Idempotency key is required for transaction creation and voiding.
- Document numbers use D1 `organization_document_counters`:
  - transactions: `TRX-YYYYMM-000001`
  - journal entries: `JE-000001`
- Posted journals are validated in service code before insert.
- Voiding creates a reversal transaction and reversal journal; it does not delete original records.
- Product purchase/sale transactions update stock movements and product stock.
- Product sale journal includes revenue plus COGS/inventory lines.
- Period locks are checked by service before posting/voiding, but there is no management UI/API for locks yet.
- Durable Objects are still deferred. D1 unique constraints and counter writes are enough for the current MVP path, but org-level posting serialization should be revisited before high-concurrency production use.
- Transaction CSV export is intentionally not ported yet; the transactions page now shows a "not available yet" toast until Phase 10.

Phase 7 verification performed:

- `pnpm --filter web exec vitest run worker/services/transactions.service.test.ts worker/services/products.service.test.ts worker/services/accounts.service.test.ts worker/organization.test.ts`
- `pnpm --filter web typecheck`
- `pnpm --filter web lint`
- `pnpm --filter web test`
- `pnpm typecheck`
- `pnpm --filter web build`
- `pnpm --filter web db:migrations:apply:local`
- `pnpm --filter web db:migrations:list`
- Fresh D1 apply with `--persist-to /tmp/...`
- Local HTTP smoke test:
  - new verified user A created org A
  - owner capital transaction posted and wrote balanced journal
  - duplicate create with the same idempotency key returned the same transaction
  - transaction audit log was present in D1
  - product cash purchase increased stock and average cost
  - product cash sale created balanced revenue plus COGS journal and reduced stock
  - voiding the product sale created a reversal transaction and restored stock
  - stock movement sum matched product stock after purchase, sale, and void
  - new verified user B created org B and posted a transaction
  - user A received 404 `transaction_not_found` when reading user B's transaction

## Phase 8 Decisions

- Report APIs are implemented under `/api/reports/*`.
- Report routes require an authenticated session, current organization membership, and `reports:read`.
- Report pages now use Worker API helpers instead of Supabase report RPCs.
- Trial balance is calculated from posted D1 journal lines up to the selected date.
- Profit/loss is calculated from posted D1 journal lines within the selected date range.
- Balance sheet is calculated from posted D1 journal lines up to the selected date and includes current-period net income as `3500` / `Laba Tahun Berjalan`.
- General ledger is calculated from posted D1 journal lines and preserves running balance from activity before the visible `fromDate`.
- Reports reuse the Phase 7 accounting model: `journal_entries`, `journal_lines`, `accounts`, `transactions`, and `parties`.
- Report CSV exports are intentionally not ported yet; report pages now show "not available yet" toasts until Phase 10.

Phase 8 verification performed:

- `pnpm --filter web exec vitest run worker/services/reports.service.test.ts worker/services/transactions.service.test.ts worker/services/products.service.test.ts worker/services/accounts.service.test.ts worker/organization.test.ts`
- `pnpm --filter web typecheck`
- `pnpm --filter web lint`
- `pnpm --filter web test`
- `pnpm typecheck`
- `pnpm --filter web build`
- `pnpm --filter web db:migrations:apply:local`
- `pnpm --filter web db:migrations:list`
- Fresh D1 apply with `--persist-to /tmp/...`
- Local HTTP smoke test:
  - new verified user A created org A
  - posted owner capital, cash sale, and expense payment
  - trial balance was balanced at debit/credit total `1300000`
  - profit/loss returned revenue `300000` and expense `50000`
  - balance sheet returned assets `1250000` and liabilities plus equity `1250000`
  - cash general ledger returned three rows and ending running balance `1250000`
  - new verified user B created org B
  - org B trial balance returned no rows while org A report totals stayed unchanged

## Phase 9 Decisions

- Team APIs are implemented under `/api/team/*`.
- Team routes require an authenticated session and explicit permissions:
  - member/invitation list require `team:read`
  - invitation create/revoke, role update, and member removal require `team:manage`
  - invitation accept requires auth but does not require current organization membership
- Implemented endpoints:
  - `GET /api/team/members`
  - `GET /api/team/invitations`
  - `POST /api/team/invitations`
  - `POST /api/team/invitations/accept`
  - `DELETE /api/team/invitations/:id`
  - `PATCH /api/team/members/:id/role`
  - `DELETE /api/team/members/:id`
- Invitation tokens are generated by the Worker, hashed with SHA-256, and only `token_hash` is stored in D1.
- Raw invitation tokens are returned only on create/resend so the UI can show a copyable link. Pending invitation lists do not expose raw tokens; users can refresh a pending invitation to get a new link.
- Invitation accept rejects unknown, expired, revoked, accepted, reused, and email-mismatched tokens.
- Accepting an invitation creates or reactivates an active membership, marks the invitation accepted, and sets `sessions.current_organization_id` to the accepted organization.
- Role values are Cloudflare-native: `owner`, `admin`, `member`, `viewer`.
- The team UI now uses role updates instead of the old Supabase granular `update_staff_permissions` RPC. Effective permission flags are still shown, derived from role.
- Owner/admin can manage team invitations. Member/viewer cannot access team management APIs.
- Team mutations write `audit_logs` records.
- Email sending interface exists with a dev stub; production email delivery is still not connected.

Phase 9 verification performed:

- `pnpm --filter web exec vitest run worker/services/team.service.test.ts`
- `pnpm --filter web typecheck`
- `pnpm --filter web lint`
- `pnpm --filter web test`
- `pnpm typecheck`
- `pnpm --filter web build`
- `pnpm --filter web db:migrations:apply:local`
- `pnpm --filter web db:migrations:list`
- Fresh D1 apply with `--persist-to /tmp/...`
- Local HTTP smoke test on `http://127.0.0.1:5174`:
  - owner registered, verified locally, logged in, and created org
  - owner listed team and saw only owner member
  - owner created member invitation
  - D1 invitation row stored a 64-character `token_hash`
  - invited user accepted invitation and current org switched to invited org
  - reused accepted token returned `invitation_not_pending`
  - member role could not read team API
  - owner promoted member to admin
  - admin created a viewer invitation
  - owner removed promoted member and removed user lost org access
  - owner revoked another invitation and revoked token returned `invitation_not_pending`

## Phase 10 Decisions

- CSV export APIs are implemented under `/api/exports/*`.
- Implemented direct-response export endpoints:
  - `GET /api/exports/accounts.csv`
  - `GET /api/exports/products.csv`
  - `GET /api/exports/transactions.csv`
  - `GET /api/exports/reports/trial-balance.csv`
  - `GET /api/exports/reports/profit-loss.csv`
  - `GET /api/exports/reports/balance-sheet.csv`
  - `GET /api/exports/reports/general-ledger.csv`
- Export routes require authenticated session, active current organization membership, and `exports:create`.
- Export data is scoped only from `organizationContext.organization.id`; frontend-provided organization IDs are ignored.
- CSV formula injection is neutralized by prefixing dangerous leading cells with `'` and quoting the value.
- CSV newlines and carriage returns are normalized to spaces to keep rows intact.
- CSV responses set safe headers:
  - `Content-Type: text/csv; charset=utf-8`
  - `Content-Disposition: attachment; filename="..."`
  - `Cache-Control: no-store`
  - `X-Content-Type-Options: nosniff`
- Frontend export actions now use Worker API downloads instead of Supabase RPCs.
- Small exports stream as direct responses. R2/Queues remain deferred because no binding is configured yet.
- A scheduled cleanup handler runs daily from Wrangler cron and deletes expired sessions, email verification tokens, password reset tokens, and expired export jobs.
- There are no export-file cleanup writes yet because async R2 export files are not implemented.

Phase 10 verification performed:

- `pnpm --filter web exec vitest run worker/services/exports.service.test.ts worker/index.test.ts worker/organization.test.ts`
- `pnpm --filter web typecheck`
- `pnpm --filter web lint`
- `pnpm --filter web test`
- `pnpm typecheck`
- `pnpm --filter web build`
- `pnpm --filter web db:migrations:apply:local`
- `pnpm --filter web db:migrations:list`
- Fresh D1 apply with `--persist-to /tmp/...`
- Local HTTP smoke test on `http://127.0.0.1:5174`:
  - owner registered, verified locally, logged in, and created org
  - created account name `=SUM(A1)`, product code `+SKU`, product name `+CMD`, and transaction description `=HACK`
  - accounts/products/transactions/general-ledger CSV exported those cells with safe formula escaping
  - product multiline description exported as one normalized CSV row
  - trial balance, profit/loss, and balance sheet CSV endpoints returned expected headers
  - export response headers included safe content type, disposition, no-store, and nosniff
  - second org export did not include first org's account/product/transaction data

## Phase 11 Decisions

- Dashboard summary is now served by Worker API:
  - `GET /api/dashboard/summary`
  - route requires authenticated session, active current organization membership, and `reports:read`
  - frontend dashboard no longer imports or calls Supabase
- Dashboard aggregation uses D1 journal data:
  - cash/bank balance from posted cash account lines through `period_to`
  - current-period revenue/expense excludes opening balance entries
  - net profit is derived as revenue minus expense
  - AR/AP use default account codes `1200` and `2100`
- Removed runtime Supabase code:
  - `apps/web/src/lib/supabase.ts`
  - `apps/web/src/lib/profiles.ts`
  - `@supabase/supabase-js`
  - `@ledjer/database-types`
  - `packages/database-types`
  - legacy RPC arg contract test
- Removed frontend Supabase env and CSP allowances:
  - no `VITE_SUPABASE_URL`
  - no `VITE_SUPABASE_ANON_KEY`
  - CSP no longer allows Supabase domains
- Updated local/CI flow to Cloudflare-native gates:
  - typecheck, lint, Vitest, build
  - D1 migration naming guard
  - fresh D1 migration apply
  - public Playwright smoke
  - public visual regression
- Archived Supabase-era assets under `archive/supabase-reference/`:
  - Postgres migrations and SQL tests
  - Supabase REST/RPC Playwright fixtures and full-local specs
  - old private-beta/production docs
- Active Playwright suite is now public smoke only. Authenticated E2E should be rebuilt against Worker/D1 seed helpers in a later phase.

Phase 11 verification performed:

- `pnpm --filter web exec vitest run worker/services/dashboard.service.test.ts worker/index.test.ts`
- `pnpm --filter web typecheck`
- `pnpm --filter web lint`
- `pnpm --filter web test`
- `pnpm --filter web build`
- `pnpm typecheck`
- `bash scripts/check-build-secrets.sh`
- `bash scripts/check-migration-naming.sh`
- Fresh D1 apply with `--persist-to /tmp/...`
- `pnpm test:e2e:local`
- Active runtime scan:
  - no Supabase/database-types references in `apps/web/src`, `apps/web/worker`, active E2E, package manifests, lockfile, workflows, or scripts

## Final Checklist Hardening Pass

- Added explicit tests for session cookie security flags.
- Added explicit test for CSRF/origin rejection on cookie-authenticated mutating requests.
- Added direct period-lock guard tests.
- Added team owner/self-removal safeguard tests.
- Verification performed:
  - `pnpm --filter web exec vitest run worker/auth/cookies.test.ts worker/index.test.ts worker/services/transactions.service.test.ts worker/services/team.service.test.ts`
  - `pnpm --filter web typecheck`
  - `pnpm --filter web lint`
  - `pnpm --filter web test`
  - `pnpm --filter web build`
  - `pnpm typecheck`
  - `bash scripts/check-migration-naming.sh`
  - `bash scripts/check-build-secrets.sh`
  - `pnpm --filter web db:migrations:list`
  - `pnpm test:e2e:local`

## Known Risks

- D1 does not provide Postgres RLS; tenant isolation must be enforced in every Worker service and covered by tests.
- D1/SQLite semantics differ from PL/pgSQL and Postgres numeric/date behavior; report calculations need golden scenario tests.
- Worker password hashing must use Web Crypto-compatible code, not native Node packages.
- Auth email delivery is not connected yet; verification/reset links cannot be delivered to real users until an email provider is added.
- Async large CSV exports via R2/Queues are deferred until export volume requires them and bindings are configured.
- Team invitation email delivery is a dev stub until an email provider is wired.
- Partial paid credit transaction voiding is blocked until a fuller settlement/refund model is ported.
- Authenticated Playwright coverage is temporarily reduced to public smoke after archiving the Supabase-era full-local suite; rebuild D1-native seeded E2E before production launch.
