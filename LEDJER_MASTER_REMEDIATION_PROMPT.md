# LEDJER — MASTER REMEDIATION PROMPT (v1.0)

> **Document type:** Master prompt for AI coding agents.
> **Target executor:** Any capable coding-agent LLM (Claude, GPT, Gemini, Qwen, GLM, Cursor, Devin, Codex, etc.).
> **Source of truth:** This file is self-contained. The agent does not need to read prior conversation history. All required context is embedded.
> **Generated:** 2026-07-15, based on a 4-axis deep review (backend, frontend, accounting logic, production readiness).
> **Language:** English (technical) with Indonesian business terms preserved (UMKM, IDR, etc.).

---

## 0. HOW TO USE THIS PROMPT (Read First)

You are an autonomous coding agent. Your job is to remediate the Ledjer codebase using this prompt as your single source of truth.

**Execution contract:**
1. Read this entire file before writing any code.
2. Treat the section "§2 Hard Constraints" as non-negotiable invariants. Never violate them, even temporarily.
3. Work through the backlog in §4 strictly in priority order: **P0 → P1 → P2 → P3**. Do not start P1 until all P0 items are committed.
4. For each backlog item, follow the per-item workflow defined in §5.2.
5. Commit at the granularity specified in §5.4. Each item = at least one commit.
6. Run the quality gate in §6 after every commit. Do not push if the gate is red.
7. Update `/home/z/my-project/worklog.md` after each item using the template in §5.6.
8. If you discover a finding NOT listed here, log it in §8 "Discovered During Remediation" before fixing it.
9. If a finding turns out to be invalid (false positive), mark it `[INVALIDATED]` in §8 with proof — do not silently skip.
10. Never delete or weaken an existing test to make CI pass. If a test is wrong, fix the test; if the test is right, fix the code.

**You may NOT:**
- Introduce new runtime dependencies without explicit approval.
- Refactor code outside the scope of the item you are fixing.
- "Clean up" or "improve" code that is not on the backlog.
- Disable, skip, or weaken TypeScript strictness, ESLint rules, or test assertions.
- Add `// @ts-ignore`, `// eslint-disable-next-line`, or `any` casts to silence type errors.
- Use floating-point arithmetic for monetary values.
- Store secrets, tokens, or PII in `localStorage`, `sessionStorage`, or frontend code.
- Deploy or push to production. Local commits and local CI only.

---

## 1. PROJECT IDENTITY

| Field | Value |
|---|---|
| Project name | Ledjer |
| Domain | Double-entry bookkeeping for Indonesian UMKM (small/medium businesses) |
| Repo root | `/home/z/my-project/review/Ledjer-main` |
| License | Proprietary — all rights reserved |
| Package manager | pnpm 10 (workspace) |
| Node version | 24+ |
| Frontend | React 19, Vite 8, Tailwind CSS 4, TanStack Query 5, React Hook Form 7, Zod 4, Sentry React 10 |
| Backend | Hono 4 on Cloudflare Workers |
| Database | Cloudflare D1 (SQLite-compatible) |
| Auth | Cookie-based sessions (`ledjer_session`), SHA-256 hashed tokens, PBKDF2 password hashing with pepper, optional Google OAuth |
| Tests | Vitest (unit/integration), Playwright (E2E), axe-core (a11y) |
| Deploy | Wrangler 4 → Cloudflare Workers + D1 |

### 1.1 Repository Layout

```
Ledjer-main/
├── apps/web/                     # Single workspace package
│   ├── src/                      # React frontend
│   │   ├── pages/                # Route-level pages
│   │   ├── components/ui/        # shadcn-style primitives
│   │   ├── lib/api/              # Typed API clients
│   │   ├── contexts/             # Auth context
│   │   └── hooks/                # Custom hooks
│   ├── worker/                   # Cloudflare Worker backend
│   │   ├── routes/               # Hono route definitions (13 files)
│   │   ├── services/             # Domain logic (14 files)
│   │   ├── middleware/           # auth, organization, error
│   │   ├── auth/                 # password, tokens, encoding
│   │   ├── http/                 # errors, json, audit, date
│   │   └── db/                   # client, schema, migrations (5)
│   ├── e2e/                      # Playwright specs
│   └── wrangler.jsonc
├── docs/                         # Accounting rules, testing, production
├── scripts/                      # CI helpers
└── package.json                  # Root workspace
```

### 1.2 Key Domain Concepts

- **Organization** = tenant. Every row in every business table carries `organization_id`.
- **Account** = chart-of-accounts entry. Type ∈ {asset, liability, equity, revenue, cogs, expense, other_income, other_expense}. Normal balance ∈ {debit, credit}.
- **Journal Entry** = a balanced set of journal lines (debit + credit per line, sum(debit) == sum(credit)).
- **Transaction** = business event (cash_sale, credit_sale, receive_receivable, cash_purchase, credit_purchase, pay_payable, expense_payment, owner_capital, owner_draw, cash_transfer). Each produces ≥1 journal entry.
- **Period Lock** = a date through which an organization has locked its books. Posting/voiding with date ≤ `locked_through_date` is rejected.
- **Stock Movement** = inventory delta (opening, purchase, sale, adjustment, void). Movements use `quantity_milli` (3-decimal precision) and `unit_cost_minor` (IDR minor units).
- **WAC** = weighted average cost. Recomputed on purchases. Preserved on sales. **Must** be recalculated on voids (per `docs/accounting-rules.md` §13).
- **Idempotency Key** = client-supplied string (8–160 chars) on transaction post/void/settle. Unique per `(organization_id, idempotency_key)`. Retries with the same key return the original result.

---

## 2. HARD CONSTRAINTS (Non-Negotiable)

These invariants must hold after every commit. Violating any of them is a regression, even if a test passes.

### 2.1 Accounting Integrity
- **C-ACC-1:** Every `journal_entries` row persisted to D1 MUST satisfy `sum(debit_minor) == sum(credit_minor)` across its `journal_lines`. The DB CHECK constraint on `journal_lines` (one-sided debit/credit) and the app-level `assertJournalBalanced` MUST both remain in force.
- **C-ACC-2:** Every monetary column in the schema MUST remain `INTEGER` (no `FLOAT`, `REAL`, `DOUBLE`). All arithmetic in app code MUST use integer minor units. `Math.round` is permitted only on already-integer values or for display formatting.
- **C-ACC-3:** A posted transaction's `journal_entries.status` MUST be updated to `'voided'` when the transaction is voided. The reversal `journal_entries.status` MUST be `'posted'`.
- **C-ACC-4:** `Σ(stock_movements.quantity_milli × unit_cost_minor) / 1000` for a product MUST equal the Inventory account's GL balance for that product's `inventory_account_id`. Any code path that mutates one without the other is a violation.
- **C-ACC-5:** Voiding a sale/purchase MUST recalculate `products.average_cost_minor` per the WAC formula in `docs/accounting-rules.md` §13. The previous behavior (preserving the pre-void average) is a bug, not a feature.
- **C-ACC-6:** Opening balances for liability/equity accounts MUST be posted with the correct normal-balance direction (credit for liabilities/equity/revenue, debit for assets/expenses/cogs). The current "always Dr Account / Cr Saldo Awal" pattern is a bug.
- **C-ACC-7:** Settlement of a partial credit sale/purchase MUST compute `remainingMinor = originalAmount − partialAmountAlreadyPaid` based on the **actual** partial cash line in the original journal, not a generic lookup.
- **C-ACC-8:** `assertPeriodOpen(date)` MUST be called on every code path that posts, voids, settles, or adjusts a journal entry — including opening-balance posting and void-date validation.

### 2.2 Security
- **C-SEC-1:** Every tenant-scoped SQL query MUST include `organization_id = ?` in its WHERE clause. No exceptions.
- **C-SEC-2:** Session tokens MUST be SHA-256 hashed before storage and lookup. Plaintext tokens MUST NEVER be persisted.
- **C-SEC-3:** Passwords MUST be hashed with PBKDF2-SHA256, 210,000 iterations, 16-byte salt, 256-bit key, plus server-side pepper. The pepper MUST come from `env.PASSWORD_PEPPER` and MUST NEVER be committed.
- **C-SEC-4:** Cookies MUST be set with `HttpOnly`, `Secure`, `SameSite=Lax` (or `Strict`), and `Path=/`. The `Domain` attribute SHOULD be omitted (host-only) unless cross-subdomain auth is explicitly required.
- **C-SEC-5:** CSRF protection MUST fail-closed in production: if `APP_ORIGIN` is unset and a state-changing request has a session cookie, the request MUST be rejected with 403.
- **C-SEC-6:** Google OAuth account linking MUST NOT auto-link to an existing local user by email match. Linking requires the user to be logged in and explicitly consent, OR the email must be verified by Google AND the local account must have `email_verified_at` set.
- **C-SEC-7:** No secrets, tokens, or PII in `VITE_*` env vars, frontend code, or `localStorage`/`sessionStorage`.
- **C-SEC-8:** All request bodies logged MUST be redacted for `password`, `currentPassword`, `newPassword`, `token`, `idempotencyKey` fields. Never log raw request bodies in production.

### 2.3 Operational
- **C-OPS-1:** The health endpoint MUST return 503 when the D1 database is unreachable. Returning 200 with `{status: "degraded"}` is a violation.
- **C-OPS-2:** The `X-Request-Id` response header MUST be set on every response, value matching `c.get("requestId")`.
- **C-OPS-3:** `wrangler.jsonc` `preview_database_id` MUST point to a separate D1 instance, never the production database ID.
- **C-OPS-4:** No `console.log` of request bodies or PII in production code paths. Structured logging via a helper that redacts sensitive fields is required.
- **C-OPS-5:** CI MUST NOT reference spec files that do not exist. Every `playwright test <path>` invocation in a workflow MUST resolve to a real file.

### 2.4 Code Quality
- **C-QUAL-1:** `pnpm typecheck` MUST exit 0.
- **C-QUAL-2:** `pnpm lint` MUST exit 0.
- **C-QUAL-3:** `pnpm test` MUST exit 0 with no skipped tests.
- **C-QUAL-4:** `pnpm --filter web build` MUST exit 0.
- **C-QUAL-5:** No new `any` types, no `@ts-ignore`, no `eslint-disable` without a justification comment.

---

## 3. PROJECT ARCHITECTURE SUMMARY (For Agent Context)

### 3.1 Request Lifecycle

```
Browser
  │  credentials: "include" (cookie sent automatically)
  ▼
Cloudflare Worker (apps/web/worker/index.ts)
  │
  ├─ onRequest → app.fetch()
  │   ├─ requestId = crypto.randomUUID()      # stored in c.var
  │   ├─ secureHeaders()                       # HSTS, X-Content-Type-Options, etc.
  │   ├─ CSRF check (/api/* mutations only)
  │   │   - origin = Origin || Referer
  │   │   - allowed = env.APP_ORIGIN?.split(",")
  │   │   - if !origin && hasSessionCookie → 403
  │   │   - if !allowed → next() (← BUG: should fail-closed)
  │   │   - if origin ∉ allowed → 403
  │   ├─ Route handler (e.g., POST /api/transactions)
  │   │   ├─ requireAuth() middleware
  │   │   │   - getCookie("ledjer_session")
  │   │   │   - hashToken(token) → SHA-256 hex
  │   │   │   - SELECT session JOIN users WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > now
  │   │   │   - UPDATE sessions SET last_used_at = now
  │   │   ├─ loadCurrentOrganization() middleware
  │   │   │   - SELECT org, member FROM sessions.current_organization_id
  │   │   │   - if no org → 403 organization_required
  │   │   ├─ requirePermission("transactions:create") middleware
  │   │   │   - check member.role against permission matrix
  │   │   ├─ Zod parse body
  │   │   ├─ Service call (e.g., postTransaction)
  │   │   │   - assertBooksOpen, assertPeriodOpen
  │   │   │   - resolveParty, validateCashAccount, validateProductIntent
  │   │   │   - buildJournalLines (balanced)
  │   │   │   - assertJournalBalanced
  │   │   │   - executeBatch: INSERT transaction, INSERT journal_entry, INSERT journal_lines, UPDATE products, INSERT stock_movements, UPDATE counters
  │   │   │   - writeAuditStatement
  │   │   └─ Return JSON { data: {...} }
  │   └─ errorHandler (on throw)
  │       - HttpError → { error: { code, message, requestId } }, status
  │       - HTTPException → { error: { code: "request_rejected", ... } }
  │       - Otherwise → { error: { code: "internal_error", message: "Internal server error", requestId } }, 500
  │
  └─ app.notFound()
      - /api/* → 404 JSON
      - else → ASSETS.fetch (SPA fallback)
```

### 3.2 Permission Matrix

| Permission | owner | admin | member | viewer |
|---|:---:|:---:|:---:|:---:|
| organizations:read | ✓ | ✓ | ✓ | ✓ |
| organizations:write | ✓ | ✓ | ✗ | ✗ |
| accounts:read | ✓ | ✓ | ✓ | ✓ |
| accounts:write | ✓ | ✓ | ✓ | ✗ |
| transactions:read | ✓ | ✓ | ✓ | ✓ |
| transactions:create | ✓ | ✓ | ✓ | ✗ |
| transactions:void | ✓ | ✓ | ✓ | ✗ |
| products:read | ✓ | ✓ | ✓ | ✓ |
| products:write | ✓ | ✓ | ✓ | ✗ |
| reports:read | ✓ | ✓ | ✓ | ✓ |
| exports:create | ✓ | ✓ | ✓ | ✗ |
| team:read | ✓ | ✓ | ✓ | ✓ |
| team:manage | ✓ | ✓ | ✗ | ✗ |

### 3.3 Standard Journal Postings (per `docs/accounting-rules.md`)

| Transaction Type | Debit | Credit |
|---|---|---|
| cash_sale | Cash (full) | Revenue (full) |
| cash_sale (product) | + COGS (cost) | + Inventory (cost) |
| credit_sale | AR (full) | Revenue (full) |
| credit_sale (product) | + COGS | + Inventory |
| credit_sale (partial) | Cash (partial) + AR (remaining) | Revenue (full) |
| receive_receivable | Cash | AR |
| cash_purchase | Inventory or Expense | Cash |
| credit_purchase | Inventory or Expense | AP |
| credit_purchase (partial) | Inventory or Expense | Cash (partial) + AP (remaining) |
| pay_payable | AP | Cash |
| expense_payment | Expense | Cash |
| owner_capital | Cash | Owner's Equity (3100) |
| owner_draw | Owner's Equity (3100) | Cash |
| cash_transfer | Cash (destination) | Cash (source) |

**Reversal (void):** Swap debit ↔ credit on every original journal line. Set `entry_type = 'reversal'` on the new JE. Set `status = 'voided'` on the original JE.

---

## 4. REMEDIATION BACKLOG

Each item below is a self-contained task. The agent should execute them in order. Every item has a stable ID (e.g., `P0-1`) for cross-reference in commits, tests, and the worklog.

### 4.1 P0 — BLOCKERS (Do These First, Sequentially)

---

#### **P0-1 — Fix `calculateSettlementRemaining` broken `find` predicate**

- **Location:** `apps/web/worker/services/transactions.service.ts` lines 641–659 (function `calculateSettlementRemaining`).
- **Symptom:** Settling a partial credit sale or credit purchase with a cash account that differs from the original partial-payment cash account produces incorrect `remainingMinor`, driving AR/AP negative or throwing a false `already_fully_paid`.
- **Root cause:** The `find` predicate is:
  ```ts
  originalLines.find(
    (l) => l.account_id === cashAccountId || originalCashAccountId === cashAccountId,
  );
  ```
  The second clause `originalCashAccountId === cashAccountId` does not reference `l`, so when the user settles with the same cash account as the original, `find` returns the **first line in the array regardless of which account it is**, which is usually the Inventory or Revenue line, not the Cash line.
- **Required fix:**
  1. The settlement amount already paid is the sum of cash-account debit lines (for credit_sale) or cash-account credit lines (for credit_purchase) in the original JE. Replace the broken `find` with a filter that sums all journal lines whose `account_id === cashAccountId` (the user's chosen settle cash account) AND whose direction matches the partial cash leg.
  2. Concretely:
     ```ts
     const partialCashLines = originalLines.filter(
       (l) => l.account_id === cashAccountId && (
         (isSale && l.debit_minor > 0) ||
         (!isSale && l.credit_minor > 0)
       )
     );
     const partialAmountMinor = partialCashLines.reduce(
       (sum, l) => sum + (isSale ? l.debit_minor : l.credit_minor),
       0,
     );
     const remainingMinor = originalAmountMinor - partialAmountMinor;
     if (remainingMinor < 0) throw conflict("over_settlement", "Settlement exceeds remaining amount");
     if (remainingMinor === 0) throw conflict("already_fully_paid", "Transaction is already fully paid");
     ```
  3. `originalCashAccountId` becomes informational only (used for the UI to default the settle form). Do not use it in the calculation.
- **Tests to add:** `apps/web/worker/services/transactions.service.test.ts` — add 4 cases:
  - `credit_sale` partial 30k of 100k, settle with same cash → remaining = 70k
  - `credit_sale` partial 30k of 100k, settle with different cash → remaining = 70k
  - `credit_purchase` partial 30k of 100k, settle with same cash → remaining = 70k
  - `credit_purchase` partial 30k of 100k, settle with different cash → remaining = 70k
  - Edge: settle when already fully paid → throws `already_fully_paid`
  - Edge: settle amount > remaining → throws `over_settlement`
- **Acceptance criteria:**
  - All 4 new tests pass.
  - The settlement JE for each scenario correctly zeroes AR/AP.
  - `pnpm test` is green.
- **Constraint ref:** C-ACC-7.

---

#### **P0-2 — Fix broken E2E spec files that throw `ReferenceError` at runtime**

- **Location:**
  - `apps/web/e2e/balance-sheet.spec.ts`
  - `apps/web/e2e/trial-balance.spec.ts`
  - `apps/web/e2e/profit-loss.spec.ts`
  - `apps/web/e2e/general-ledger.spec.ts`
  - `apps/web/e2e/products.spec.ts`
- **Symptom:** These specs reference undeclared variables at module-evaluation time (e.g., `applyBtn`, `exportBtn`, `checkbox`, `captions`, `scopedHeaders`). Playwright fails to even load the test files, throwing `ReferenceError: <var> is not defined`.
- **Root cause:** Test scaffolding was written with helper destructures or imports that were never added. The references appear at the top of `test.describe` blocks but the declarations are missing.
- **Required fix:**
  1. Open each affected spec and identify every undeclared reference.
  2. For each reference, either: (a) declare it as a `const` at the top of the `test.describe` block using a real locator, or (b) replace the bare identifier with a proper inline locator like `page.getByRole('button', { name: /apply/i })`.
  3. Do NOT delete test cases. If a test case cannot be made runnable in <30 min, mark it with `test.fixme(...)` and a comment explaining why, and log it in §8.
  4. Run `pnpm --filter web exec playwright test --list` to confirm every spec loads without `ReferenceError`.
- **Tests to add:** None new — just make existing specs loadable and runnable.
- **Acceptance criteria:**
  - `pnpm --filter web exec playwright test --list` exits 0 with all spec files listed.
  - `pnpm --filter web exec playwright test e2e/balance-sheet.spec.ts` runs (pass or fail per case, but no load-time errors).
  - Constraint ref: C-QUAL-3.

---

#### **P0-3 — Remove or fix CI workflow references to non-existent spec files**

- **Location:** CI workflow files (note: the `.github/workflows/*.yml` files are not in this snapshot, but the existing AUDIT-AND-REMEDIATION.md confirms their presence in the live repo). Referenced paths that do not exist as files:
  - `e2e/static-routes.spec.ts`
  - `e2e/visual.spec.ts`
  - `e2e/performance.spec.ts`
- **Symptom:** CI is currently red because Playwright is invoked on paths that don't exist. The `ci.yml`, `production-smoke.yml`, and `visual-baselines.yml` workflows all reference at least one of these missing paths.
- **Root cause:** Specs were planned/mentioned in the audit doc but never created, or were deleted without updating workflows.
- **Required fix:**
  1. If the `.github/workflows/` directory exists in your checkout, open each `*.yml` and locate every `playwright test <path>` invocation.
  2. For each path that does not resolve to a real file:
     - If the test was intended to exist, create a minimal spec at that path that runs a single `test('placeholder', ...)` so CI is green. Log a P1 follow-up in §8 to implement the real test.
     - If the test was redundant, remove the line from the workflow.
  3. If `.github/workflows/` is absent from your checkout, document this in §8 and skip — the fix must be applied where the workflows live.
- **Acceptance criteria:**
  - Every `playwright test <path>` in any workflow file resolves to an existing file.
  - `bash scripts/ci-local.sh` exits 0.
  - Constraint ref: C-OPS-5.

---

#### **P0-4 — Fix Google OAuth account-takeover via email-match auto-linking**

- **Location:** `apps/web/worker/services/google-auth.service.ts` lines ~232–245 (the `linkOrCreateUser` / `findUserByEmail` branch that auto-links).
- **Symptom:** An attacker who controls a Google account whose email matches a Ledjer local user's email can sign in via Google OAuth and gain access to the local user's account, even if the local user never enabled Google sign-in.
- **Root cause:** The OAuth callback looks up `users.email == google_email` and, if found, creates an `oauth_accounts` row linking the Google identity to that user — without verifying the user explicitly opted in to Google sign-in.
- **Required fix:**
  1. On Google OAuth callback, only auto-link to an existing user if **all** of the following are true:
     - The Google-returned `email_verified` claim is `true`.
     - The existing local user has `email_verified_at` set (i.e., they verified the same email with Ledjer).
     - The existing local user has at least one prior `oauth_accounts` row OR has explicitly enabled "Sign in with Google" in settings.
  2. If the conditions are not met, return a 409 `oauth_email_conflict` with a message instructing the user to sign in with their password first and then link their Google account from settings.
  3. If no existing user exists, create a new user with `email_verified_at = now` (Google verified the email) and a random high-entropy password hash (so password login is impossible without a reset). Then link the `oauth_accounts` row.
  4. Audit-log the OAuth-linking decision with `action = 'oauth_link'`, `entity_type = 'auth'`, `entity_id = user_id`, `reason` describing which branch was taken.
- **Tests to add:** `apps/web/worker/services/auth.service.test.ts` — extend with OAuth-linking tests:
  - Existing verified user, no prior OAuth, attacker tries Google login → 409 `oauth_email_conflict`.
  - Existing verified user with prior OAuth → success, new session created.
  - No existing user → new user created, email_verified_at set, password hash is random.
- **Acceptance criteria:**
  - The three test cases pass.
  - Manual trace: with two Google accounts A and B where A matches a Ledjer user's email, only A can ever link (and only after the user explicitly enables it).
  - Constraint ref: C-SEC-6.

---

#### **P0-5 — Fix CSRF middleware fail-open when `APP_ORIGIN` is unset**

- **Location:** `apps/web/worker/index.ts` lines 28–57 (the `/api/*` CSRF middleware).
- **Symptom:** The inline comment claims "fail-closed" behavior when `APP_ORIGIN` is unset, but line 51 `if (!allowed) return next();` silently allows all origins. In production with a misconfigured environment, an attacker can submit state-changing requests from any origin.
- **Root cause:** The dev-mode escape hatch (`!allowed → next`) was kept for local development, but it also applies in production if the secret is missing.
- **Required fix:**
  1. At Worker boot (top of `index.ts`, before route registration), if `env.NODE_ENV === 'production'` (or use `c.env.APP_ENV`), assert that `APP_ORIGIN` is set and non-empty. If not, throw — the Worker will fail to start, which is the desired fail-closed behavior.
  2. Replace line 51 with:
     ```ts
     if (!allowed) {
       // Dev-only escape hatch. In production, boot-time assertion guarantees `allowed` is set.
       if (c.env.APP_ENV === 'production') {
         return c.json({ error: { code: 'csrf_misconfigured', message: 'Server misconfigured' } }, 500);
       }
       return next();
     }
     ```
  3. Add `APP_ENV` to the `Env` interface in `apps/web/worker/env.ts` (optional string; `'production'` or `'development'`).
  4. Update `apps/web/.env.example` and the root `.env.example` to document `APP_ENV`.
- **Tests to add:** `apps/web/worker/index.test.ts` — add:
  - Mutation request with session cookie, no Origin header, `APP_ORIGIN` set → 403.
  - Mutation request with session cookie, no Origin header, `APP_ORIGIN` unset, `APP_ENV='production'` → 500.
  - Mutation request, no session cookie, no Origin → next() (public endpoint OK).
- **Acceptance criteria:**
  - All three tests pass.
  - Constraint ref: C-SEC-5.

---

### 4.2 P1 — HIGH PRIORITY (After all P0 items are committed)

---

#### **P1-1 — Detect optimistic-stock-lock failures via `meta.changes`**

- **Location:** `apps/web/worker/services/transactions.service.ts` lines 434–444 (`reserveStockForTransaction`) and lines ~840 (`restoreStockForVoid`).
- **Symptom:** When two concurrent sales race, the `UPDATE products SET current_stock_milli = ? WHERE id = ? AND current_stock_milli = ?` may match 0 rows. `executeBatch` does not surface this; the batch "succeeds" with a stale stock level, so `products.current_stock_milli` drifts from `Σ(stock_movements.quantity_milli)`.
- **Required fix:**
  1. After every `executeBatch` that includes an optimistic-lock UPDATE, inspect `results[i].meta.changes` for that statement. If `changes === 0`, throw `conflict("stock_concurrent_modify", "Stock was modified by another request, please retry")`.
  2. Wrap `postTransaction` in a retry loop (max 3 attempts) that re-reads the product's `current_stock_milli` and re-attempts the batch on `stock_concurrent_modify`. Use exponential backoff (e.g., 5ms, 15ms, 50ms).
  3. On the 4th failure, return 409 to the client with a clear message.
- **Tests to add:** `apps/web/worker/services/transactions.service.test.ts` — simulate `meta.changes = 0` via the fake D1 and assert the error. Then simulate it 3× and assert 409 is thrown.
- **Acceptance criteria:**
  - Constraint ref: C-ACC-4.
  - Tests pass; manual race-condition simulation shows retry succeeds or 409 is returned cleanly.

---

#### **P1-2 — Recalculate WAC on void (sale and purchase)**

- **Location:** `apps/web/worker/services/transactions.service.ts` lines 825–851 (`restoreStockForVoid`).
- **Symptom:** Voiding a sale preserves the pre-void `average_cost_minor` instead of recomputing. After `Buy 10@100 → Sell 5 → Buy 5@200 (avg=150) → Void Sell 5`, the GL Inventory balance drifts from `current_stock_milli × average_cost_minor`.
- **Required fix:**
  1. Implement a `recalculateProductAverageCost(db, organizationId, productId)` helper that:
     - Reads all `stock_movements` for the product ordered by `(movement_date, created_at)`.
     - Replays them using the WAC formula: on `opening` or `purchase`, `newAvg = round((stock × avg + qty × unit_cost) / new_stock)`; on `sale` or `void`, `avg` is unchanged; on `adjustment`, `avg` is unchanged (quantity-only).
     - Updates `products.average_cost_minor` to the final computed value.
  2. Call this helper inside `restoreStockForVoid` after inserting the `void` movement.
  3. Note: the doc references a `recalculate_product_average_cost` function that does not exist — implement it now.
- **Tests to add:** `apps/web/worker/services/products.service.test.ts` —
  - Buy 10@100, sell 5, buy 5@200, void the sell → `average_cost_minor` must equal 150 (the pre-void avg is unchanged because void of a sale doesn't change avg). Wait — re-check the doc. Per `docs/accounting-rules.md` §13: "Voiding a sale records a reverse stock movement with the original sale movement's `unit_cost` and recalculates moving average cost." The recalc on void-of-sale should yield the same avg (since the void movement uses the same unit_cost as the original sale). The bug is that the current code doesn't even call recalc. After implementing, the avg should be unchanged but the GL invariant should hold.
  - Buy 10@100, buy 5@200 (avg=150), void the second buy → avg must return to 100.
  - Buy 10@100, sell 5 (avg still 100), buy 5@200 (avg=150), void the buy → avg must return to 100.
- **Acceptance criteria:**
  - Constraint ref: C-ACC-4, C-ACC-5.
  - Tests pass.

---

#### **P1-3 — Fix opening-balance posting direction for liability/equity/revenue accounts**

- **Location:** `apps/web/worker/services/organization.service.ts` lines ~336–348 (`postOpeningBalances`).
- **Symptom:** Opening balances for liability (AP/2100), equity (Modal/3100), and revenue accounts are posted as `Dr Account / Cr Saldo Awal` — wrong direction. Should be `Cr Account / Dr Saldo Awal` for credit-normal accounts.
- **Required fix:**
  1. In `postOpeningBalances`, for each account, look up `normal_balance`. If `normal_balance === 'credit'`, post `credit_minor = amount, debit_minor = 0` on the account line and `debit_minor = amount, credit_minor = 0` on the offsetting `Saldo Awal` (3900) line. If `normal_balance === 'debit'`, keep the current behavior.
  2. The `Saldo Awal` account (3900) is equity-normal (credit), so it should be credited when the offsetting account is debit-normal (assets, expenses) and debited when the offsetting account is credit-normal (liabilities, equity, revenue).
- **Tests to add:** `apps/web/worker/services/organization.service.test.ts` (new file if not exists) —
  - Create org with mixed opening balances (cash 1M, AP 500k, modal 500k). Verify the journal balances, and verify each account line's direction matches its normal balance.
- **Acceptance criteria:**
  - Constraint ref: C-ACC-6.
  - Trial balance after opening balances: total debit == total credit.

---

#### **P1-4 — Mark original `journal_entries.status = 'voided'` on void**

- **Location:** `apps/web/worker/services/transactions.service.ts` lines 977–1023 (`voidTransaction`).
- **Symptom:** The original JE stays `status = 'posted'`. Reports filter `status = 'posted'`, so both original and reversal appear and net to zero — accounting is correct, but the `journal_entries.status` enum value `'voided'` is dead, and the `docs/accounting-rules.md` §Void/Reversal step 4 spec is violated.
- **Required fix:**
  1. Inside the `executeBatch` for `voidTransaction`, add a statement:
     ```sql
     UPDATE journal_entries
       SET status = 'voided'
       WHERE id = ? AND organization_id = ?
     ```
     Pass `originalJEId` and `organizationId`.
  2. Update reports queries in `reports.service.ts` to **exclude** `status = 'voided'` rows (they currently include `status = 'posted'` rows only, which already excludes voided originals — but the reversal JE is also `status = 'posted'`, so the net is still zero; with the fix, the original is excluded and the reversal stands alone, also netting to the same effect). Verify all four reports still produce identical totals after the change.
- **Tests to add:** Extend `transactions.service.test.ts` with an end-to-end void test that asserts `journal_entries.status = 'voided'` for the original JE after void.
- **Acceptance criteria:**
  - Constraint ref: C-ACC-3.
  - All existing tests still pass.
  - Golden scenarios (trial balance, P&L, balance sheet, GL) produce unchanged totals on a voided transaction.

---

#### **P1-5 — Fix `settleAndVoidTransaction` not actually voiding**

- **Location:** `apps/web/worker/services/transactions.service.ts` lines 661–807.
- **Symptom:** Despite the name and JSDoc, the function only updates `payment_status = 'paid'` on the original; it does not create a reversal. If the user then voids the now-paid original, the reversal swaps every original line (including the partial cash + AR legs) — but AR was already zeroed by the settle JE — producing negative AR/AP. And the settle JE itself cannot be voided (line 870–872 blocks voiding transactions with `original_transaction_id` set).
- **Required fix:**
  1. Clarify the function's role via rename: `settlePartialTransaction` (it settles; it does not void). Update the JSDoc.
  2. After settlement, if the user later wants to void the original, the void must reverse the original JE **and** the settle JE together. Implement `voidSettledTransaction` that takes both JE IDs and reverses both in a single batch.
  3. Update `validateVoidableTransaction` to detect when a transaction has a linked settle JE and route to `voidSettledTransaction` instead of `voidTransaction`.
  4. Alternatively (simpler): block voiding of any transaction that has a linked settle JE; require the user to "unsettle" first via a new `unsettleTransaction` that reverses the settle JE only. Choose whichever is simpler; document the choice in §8.
- **Tests to add:**
  - Settle 70k of a 100k partial credit sale → AR is 0. Void the original → AR stays 0 (not −70k).
  - Settle then void → original JE is `voided`, settle JE is `voided`, reversal JEs are `posted`.
- **Acceptance criteria:**
  - Constraint ref: C-ACC-3, C-ACC-7.
  - Tests pass.

---

#### **P1-6 — Add global 401 handler in the API client**

- **Location:** `apps/web/src/lib/api/client.ts`.
- **Symptom:** Expired sessions cause every API call to fail with 401, producing repeated error toasts and no redirect to `/login`. The user is stuck on a broken page.
- **Required fix:**
  1. In the `fetch` wrapper, intercept 401 responses. If the current route is not `/login`, `/register`, `/forgot-password`, `/reset-password`, `/auth/callback`, `/invitations/accept`, call `window.location.href = '/login?from=' + encodeURIComponent(window.location.pathname)`.
  2. Before redirecting, call `queryClient.clear()` to drop cached data.
  3. Show a single toast: "Sesi Anda telah berakhir. Silakan masuk kembali." (Id.)
  4. For 403 responses, do NOT redirect — let the page render the forbidden state.
- **Tests to add:** `apps/web/src/__tests__/api-client-401.test.tsx` —
  - Mock fetch returning 401; assert `window.location.href` is set to `/login?from=...`.
  - Assert toast is shown exactly once even if 5 parallel requests all 401.
- **Acceptance criteria:**
  - Manual: open the app, expire the session cookie (via devtools), trigger any action — should redirect to login with a single toast.

---

#### **P1-7 — Replace fragile string-match retry logic in `query-client.ts`**

- **Location:** `apps/web/src/lib/query-client.ts` lines 10–15.
- **Symptom:** Retry logic uses `error.message.includes('network')` to decide retries. This is fragile — server messages change, and localization would break it.
- **Required fix:**
  1. The `ApiError` class already exposes `.status` and `.code`. Retry only when:
     - `error instanceof ApiError && error.status >= 500`, OR
     - `error instanceof TypeError` (fetch itself failed), OR
     - `error.code === 'network_error'`.
  2. Do not retry on 4xx (client errors).
  3. Limit retries to 2 with exponential backoff (500ms, 1500ms).
- **Tests to add:** `apps/web/src/__tests__/query-client.test.ts` (new) — assert retry counts for 500, 429, 401, 403, network TypeError.
- **Acceptance criteria:** Tests pass; manual: a 500 error retries 2× then surfaces.

---

#### **P1-8 — Fix broken settle feature in `transactions/[id].tsx`**

- **Location:** `apps/web/src/pages/transactions/[id].tsx` lines 206–214 (the cash account `<select>` for settle).
- **Symptom:** The settle form's cash account dropdown has no options. The feature is non-functional.
- **Required fix:**
  1. Query the org's cash accounts (`useAccounts({ type: 'cash' })` or similar) and populate the dropdown.
  2. Default-select the original transaction's `cash_account_id`.
  3. On submit, call `settleTransaction({ transactionId, cashAccountId, idempotencyKey })`.
- **Tests to add:** Extend `apps/web/src/__tests__/transactions.test.ts` if it covers the detail page; otherwise add a Playwright e2e in `e2e/transactions-settle.spec.ts`.
- **Acceptance criteria:** Manual: open a partial credit sale, settle it via the UI, verify the AR balance goes to 0.

---

#### **P1-9 — Fix `wrangler.jsonc` `preview_database_id` pointing to production**

- **Location:** `apps/web/wrangler.jsonc` line ~19.
- **Symptom:** Preview deployments share the production D1 database. Any migration applied to preview mutates production data.
- **Required fix:**
  1. Create a separate D1 database for preview (or document that the team must create one). Set `preview_database_id` to the preview DB's UUID.
  2. If the team has not yet created a preview DB, set `preview_database_id` to an empty string and add a comment `// TODO: set to preview D1 ID before enabling preview deployments`.
  3. Same fix for the root `wrangler.jsonc` if applicable.
- **Acceptance criteria:** Constraint ref: C-OPS-3.

---

#### **P1-10 — Resolve CSP inconsistency between `_headers` and `index.html`**

- **Location:**
  - `apps/web/public/_headers` (the `Content-Security-Policy` line for `/*`).
  - `apps/web/index.html` (the `<meta http-equiv="Content-Security-Policy">` tag).
  - `apps/web/scripts/postbuild-csp.sh` (the postbuild CSP injector).
- **Symptom:** `_headers` allows `style-src 'self' 'unsafe-inline'` (for Tailwind runtime styles), but `index.html` meta CSP disallows `'unsafe-inline'`. Browsers enforce the stricter of the two, so Tailwind's runtime-injected styles are blocked, breaking the UI on first paint.
- **Required fix:**
  1. Pick one CSP source of truth. Recommendation: keep `_headers` as the source (Cloudflare applies it), and remove the `<meta>` CSP from `index.html`.
  2. Audit `style-src`: if Tailwind 4 requires `'unsafe-inline'`, keep it; if not (Tailwind 4 should support nonces or extracted styles), remove it.
  3. Run `pnpm --filter web build` and inspect the built `dist/index.html` to confirm only one CSP is delivered.
  4. Add an E2E assertion in `e2e/security-public.spec.ts` that loads the home page and asserts no CSP violations are reported via `page.on('console')`.
- **Acceptance criteria:** Manual: load the app in Chrome devtools, no CSP violation console messages.

---

#### **P1-11 — Initialize server-side Sentry and add structured logging**

- **Location:**
  - `apps/web/worker/index.ts` (add Sentry init at the top of `fetch`).
  - `apps/web/worker/middleware/error.middleware.ts` (capture unhandled errors with Sentry).
  - `apps/web/worker/http/json.ts` line 21 (remove the `console.log` that dumps full request bodies).
- **Symptom:** `SENTRY_DSN` is declared in `Env` but never used server-side. Errors are only `console.error`'d. The `console.log` in `json.ts` dumps request bodies (including passwords) to stdout.
- **Required fix:**
  1. Install `@sentry/cloudflare` (or use the Sentry Wrangler plugin if compatible). Init in the Worker entry with `SENTRY_DSN`, `environment: env.APP_ENV`, `release: env.GIT_SHA` (set by CI).
  2. In `errorHandler`, call `Sentry.captureException(error, { tags: { requestId }, extra: { code: error.code } })` for non-HttpError exceptions.
  3. Replace the `console.log` in `json.ts` with a structured `logRequest(ctx, body)` helper that redacts `password`, `currentPassword`, `newPassword`, `token`, `idempotencyKey` fields. The helper writes JSON to stdout: `{ level, requestId, method, path, userId, orgId, body: redactedBody }`.
  4. Gate the logger on `env.APP_ENV !== 'test'` so tests stay quiet.
- **Tests to add:** `apps/web/worker/http/json.test.ts` — assert redaction of password fields.
- **Acceptance criteria:** Constraint ref: C-OPS-4, C-SEC-8.

---

#### **P1-12 — Set `X-Request-Id` response header on every response**

- **Location:** `apps/web/worker/index.ts` (the `requestId` middleware around line 24).
- **Required fix:**
  ```ts
  app.use("*", async (c, next) => {
    const requestId = c.req.header("X-Request-Id") || crypto.randomUUID();
    c.set("requestId", requestId);
    await next();
    c.header("X-Request-Id", requestId);
  });
  ```
- **Acceptance criteria:** Constraint ref: C-OPS-2. Add a test that asserts the header is present on 200, 404, and 500 responses.

---

#### **P1-13 — Health endpoint must return 503 when DB is unreachable**

- **Location:** `apps/web/worker/routes/health.routes.ts` line ~16.
- **Required fix:**
  1. Run `SELECT 1 FROM app_metadata LIMIT 1` against `env.DB`. If it throws or returns no rows, return 503 with `{ status: 'unhealthy', database: 'down' }`.
  2. Otherwise return 200 with `{ status: 'healthy', database: 'up' }`.
  3. Optionally check `ASSETS.fetch` (a tiny `HEAD` to `/`) — return 503 if it fails.
- **Tests to add:** `apps/web/worker/routes/health.routes.test.ts` — fake D1 that throws → 503.
- **Acceptance criteria:** Constraint ref: C-OPS-1.

---

#### **P1-14 — Add rate limiting to registration, password-reset, and email-verification endpoints**

- **Location:** `apps/web/worker/services/auth.service.ts` (`createPasswordReset`, `resendEmailVerification`) and `apps/web/worker/routes/auth.routes.ts` (the `POST /register` handler).
- **Symptom:** Only login is rate-limited (5 failures / 15 min). Registration, password-reset, and email-verification endpoints can be hammered for email enumeration or spam.
- **Required fix:**
  1. Reuse the `login_attempts` table (or add a new `rate_limit_buckets` table) to count requests per `(email_or_ip, endpoint)` in a sliding window.
  2. Limits:
     - Registration: 5 per IP per hour.
     - Password reset request: 3 per email per hour, 10 per IP per hour.
     - Email verification resend: 3 per email per hour, 10 per IP per hour.
  3. Return 429 `rate_limited` with a `Retry-After` header.
  4. Always return 200/202 to the client (don't reveal whether the email exists) but throttle the actual email send.
- **Tests to add:** Extend `auth.service.test.ts`.
- **Acceptance criteria:** Manual: hammer `/register` from one IP → 6th request returns 429.

---

#### **P1-15 — Audit-log auth events (login/logout/password-reset/OAuth/org-create)**

- **Location:** `apps/web/worker/services/auth.service.ts`, `google-auth.service.ts`, `organization.service.ts`.
- **Symptom:** Audit log only captures entity mutations within an org. Auth events and org creation are not audited. The `logDuplicateRegistration` is a partial exception.
- **Required fix:**
  1. Add audit entries for: `login_success`, `login_failure`, `logout`, `password_reset_requested`, `password_reset_completed`, `email_verification_completed`, `oauth_link`, `oauth_login`, `organization_created`.
  2. For events that occur before the user has an `organization_id` (e.g., login), use `organization_id = NULL` and `actor_user_id = <user_id or NULL>`.
  3. Add `entity_type = 'auth'` for auth events.
- **Acceptance criteria:** After login, `SELECT * FROM audit_logs WHERE action = 'login_success'` returns one row.

---

#### **P1-16 — Implement D1 backup automation and document restore procedure**

- **Location:** `docs/production/` (new file `backup-and-restore.md`), `scripts/` (new `backup-d1.sh`).
- **Required fix:**
  1. Write a `backup-d1.sh` script that runs `wrangler d1 export DB --remote --output=backup-$(date +%Y%m%d-%H%M).sql`. Schedule via Cloudflare Cron Trigger or external cron.
  2. Document restore procedure: `wrangler d1 execute DB --remote --file=backup-YYYYMMDD-HHMM.sql`.
  3. Add a `docs/production/backup-and-restore.md` runbook with: backup frequency (recommend daily), retention (30 days), restore RPO/RTO targets, and a tested restore checklist.
  4. Add a Cloudflare Worker Cron Trigger that runs the backup script and stores the result in R2 (optional but recommended).
- **Acceptance criteria:** Run `bash scripts/backup-d1.sh` locally against `--local` — produces a non-empty SQL file.

---

#### **P1-17 — Bound `login_attempts` and `audit_logs` table growth**

- **Location:** `apps/web/worker/services/maintenance.service.ts` (`cleanupExpiredRows`).
- **Required fix:**
  1. Extend `cleanupExpiredRows` to also delete:
     - `login_attempts` older than 90 days.
     - `audit_logs` older than 7 years (regulatory retention; configurable via `AUDIT_RETENTION_DAYS` env).
     - `export_jobs` whose `expires_at` has passed.
     - `email_verifications` and `password_reset_tokens` whose `expires_at` has passed (already covered, verify).
  2. Document retention in `docs/production/monitoring.md`.
- **Acceptance criteria:** Unit test for `cleanupExpiredRows` covering each table.

---

#### **P1-18 — Fix password schema inconsistency between reset and register**

- **Location:** `apps/web/src/pages/reset-password.tsx` vs `apps/web/src/pages/register.tsx`.
- **Symptom:** Reset password doesn't enforce the same complexity rules (length, mixed case, etc.) as registration.
- **Required fix:**
  1. Extract a shared `passwordSchema` in `apps/web/src/lib/validations/auth.ts` (new file).
  2. Use it in both register and reset forms.
  3. Rules: min 8 chars, at least 1 letter and 1 digit (or whatever the current register enforces — match exactly).
- **Acceptance criteria:** Both forms reject "password" and accept "Password1".

---

#### **P1-19 — Fix `auth-callback.tsx` `setInterval` memory leak**

- **Location:** `apps/web/src/pages/auth-callback.tsx` lines 124–135.
- **Required fix:** Capture the interval ID and clear it on unmount via `useEffect` cleanup. Or use the existing `useCooldown` hook if applicable.
- **Acceptance criteria:** No `setInterval` leak detected in React DevTools profiler after navigating away from the page.

---

#### **P1-20 — Fix personal Gmail and placeholder phone in legal pages**

- **Location:**
  - `apps/web/src/pages/legal/refund.tsx` line ~72: `projects.eiai@gmail.com` → `support@ledjer.id`.
  - `apps/web/src/pages/legal/contact.tsx` line ~21: `6281234567890` → real WhatsApp number, or remove the WhatsApp link entirely if none exists.
- **Acceptance criteria:** No placeholder contact info in production pages.

---

#### **P1-21 — Fix session-token rotation and 3-second fail-open auth timeout**

- **Location:**
  - `apps/web/worker/services/session.service.ts` — add `last_used_at` rotation: if `now - last_used_at > 24h`, issue a new token, set the new cookie, and revoke the old session.
  - `apps/web/src/contexts/auth.tsx` lines 22–51 — replace the 3-second fail-open timeout with a loading state. Render a spinner until `/api/auth/me` resolves or rejects; never render the guest UI while a request is in-flight.
- **Acceptance criteria:**
  - Manual: long-idle session (>24h) rotates the cookie on next request.
  - Manual: refresh page on slow network — no flash of logged-out state.

---

#### **P1-22 — Don't leak OAuth errors to browser URLs**

- **Location:** `apps/web/src/pages/auth-callback.tsx` and the OAuth redirect URL construction in `google-auth.service.ts`.
- **Symptom:** OAuth errors (e.g., `error=access_denied`) appear in the URL hash, which may leak to logs, browser history, and Referer headers.
- **Required fix:**
  1. In `auth-callback.tsx`, read the error from `URLSearchParams`, then `history.replaceState(null, '', '/auth/callback')` to strip the query string before processing.
  2. Display the error in a toast or inline message, not in the URL.
- **Acceptance criteria:** After a failed OAuth flow, the URL bar shows `/auth/callback` with no query string.

---

### 4.3 P2 — MEDIUM PRIORITY (After P0 and P1)

---

#### **P2-1 — Implement the `account_mappings` table or remove it**

- **Location:** `apps/web/worker/db/migrations/0002_core_schema.sql` lines 170–185; `apps/web/worker/services/transactions.service.ts` (the hardcoded account-code lookups).
- **Symptom:** The `account_mappings` table is defined but never read or written. The posting logic uses hardcoded account codes (1200, 2100, 3100, etc.).
- **Required fix:** Either (a) wire `account_mappings` into `buildJournalLines` so business_type + transaction_type + category_name drives the debit/credit account selection, OR (b) drop the table in a new migration `0006_drop_account_mappings.sql` and document that hardcoded codes are the intended MVP design. Pick one and log the decision in §8.
- **Acceptance criteria:** No dead schema; `account_mappings` either has rows and is read, or is dropped.

---

#### **P2-2 — Wire up `export_jobs` table or remove it**

- **Location:** `apps/web/worker/db/migrations/0002_core_schema.sql` lines 415–431; `apps/web/worker/services/exports.service.ts`.
- **Symptom:** The `export_jobs` table exists (status, storage_key, error_message) but exports are generated synchronously and never insert a row.
- **Required fix:** Either (a) make exports async — create an `export_jobs` row, queue a job (Cloudflare Queues or a Cron), generate the CSV, store in R2, update the row — OR (b) drop the table and keep exports synchronous. Document the choice.
- **Acceptance criteria:** Consistent state — either async exports with rows, or no table.

---

#### **P2-3 — Add `assertBooksOpen` and `assertPeriodOpen` checks to void date and opening balances**

- **Location:**
  - `apps/web/worker/services/transactions.service.ts` line 635 (`validateSettlementTarget`) — also check the settle date.
  - `apps/web/worker/services/organization.service.ts` `postOpeningBalances` — call `assertBooksOpen` (acceptable bypass since opening balances are at `books_start_date`, but make the bypass explicit with a comment).
- **Acceptance criteria:** Constraint ref: C-ACC-8.

---

#### **P2-4 — Fix COGS rounding precision**

- **Location:** `apps/web/worker/services/transactions.service.ts` line 1516.
- **Symptom:** `Math.round((costMinor × qtyMilli) / 1000)` loses sub-rupiah precision for fractional quantities. The Inventory GL credit drifts from `Σ(stock_movements.quantity × unit_cost)`.
- **Required fix:**
  1. Use `Math.round` only on the final integer rupiah value. Internally, track cost in integer micro-minor units (or use BigInt if scale requires).
  2. Alternative: store `cost_milli_minor` (1000× the current scale) on stock movements and journal lines for full precision. Larger schema change; evaluate trade-off.
  3. Simpler MVP fix: enforce that `quantityMilli` is always a multiple of 1000 (i.e., whole units) for product sales, and reject fractional quantities with a 400 `fractional_quantity_unsupported`. Document this as an MVP limitation.
- **Acceptance criteria:** Test that `quantity=0.5, unitCost=1000` produces `COGS = 500` exactly, with no rounding drift.

---

#### **P2-5 — Counter increments must be inside `executeBatch`**

- **Location:** `apps/web/worker/services/transactions.service.ts` lines 517–518.
- **Symptom:** `generateTransactionNumber` and `generateEntryNumber` run before `executeBatch`. If the batch fails, the counter has still advanced — gap in numbering.
- **Required fix:** Move the counter UPSERT into the `executeBatch` array as the first statement. Capture the returned `current_value` from `RETURNING` via `results[0].results` (D1 supports this). Or: tolerate gaps (they are not accounting errors) and document that gaps may occur on failed posts. Pick one and log the decision.
- **Acceptance criteria:** Either no gaps on failed posts, or a documented acceptance of gaps.

---

#### **P2-6 — Fix `purchase_price_minor` being overwritten with average**

- **Location:** `apps/web/worker/services/transactions.service.ts` lines 434–436.
- **Symptom:** `products.purchase_price_minor` is set to `nextAverage` on every purchase. The field no longer reflects the last purchase price.
- **Required fix:**
  1. Stop updating `purchase_price_minor` in `reserveStockForTransaction`. Only update `average_cost_minor` and `current_stock_milli`.
  2. Add a separate column `last_purchase_price_minor` if you want to track the last purchase price (the field name `purchase_price_minor` should arguably be renamed too — but that's a schema migration).
- **Acceptance criteria:** `purchase_price_minor` reflects the last input `unitPriceMinor` from a purchase.

---

#### **P2-7 — `recordStockMovement` must create a matching journal entry**

- **Location:** `apps/web/worker/services/products.service.ts` lines 301–382.
- **Symptom:** The inventory API can mutate `stock_movements` without creating a journal entry, breaking the Inventory GL invariant.
- **Required fix:**
  1. Either: (a) remove the public `recordStockMovement` endpoint and force all stock movements through `postTransaction`, OR (b) require callers to supply the journal entry context and post both atomically.
  2. For MVP, recommend (a) — deprecate the public endpoint.
- **Acceptance criteria:** No code path can insert a `stock_movements` row without a matching `journal_lines` row.

---

#### **P2-8 — Add end-to-end accounting tests**

- **Location:** `apps/web/worker/services/golden-scenarios.test.ts` and new test files.
- **Required fix:** Add tests for:
  - `postTransaction` end-to-end for all 10 transaction types (cash_sale, credit_sale, receive_receivable, cash_purchase, credit_purchase, pay_payable, expense_payment, owner_capital, owner_draw, cash_transfer).
  - `voidTransaction` end-to-end with WAC verification.
  - `settlePartialTransaction` for all 4 scenarios (same/different cash × sale/purchase).
  - `postOpeningBalances` with mixed account types.
  - Cross-tenant isolation: user in org A cannot read org B's transactions, accounts, or reports.
  - Report reconciliation: trial balance total = balance sheet total; P&L net income = balance sheet retained-earnings delta.
  - Inventory GL invariant: `Σ(stock_movements.quantity × unit_cost) / 1000 == Inventory account balance`.
- **Acceptance criteria:** All new tests pass; coverage of service files > 70%.

---

#### **P2-9 — Fix `golden-scenarios.test.ts` "void sale does not change average cost" no-op test**

- **Location:** `apps/web/worker/services/golden-scenarios.test.ts` lines 80–88.
- **Symptom:** The test only asserts `stockAfterVoid > 0` — it doesn't call the void code or assert the average.
- **Required fix:** Rewrite to actually invoke `voidTransaction` and assert `average_cost_minor` is unchanged (or recalculated per the new P1-2 fix).

---

#### **P2-10 — Add bundle size budget enforcement**

- **Location:** `apps/web/vite.config.ts` (add `build.rollupOptions.output.manualChunks` and `build.chunkSizeWarningLimit`), `scripts/check-bundle-size.sh` (new).
- **Required fix:**
  1. Set `chunkSizeWarningLimit: 750` (KB) in vite config.
  2. Add a post-build script that sums `dist/assets/*.js` and fails if > 750KB total.
  3. Add the script to `scripts/ci-local.sh`.
- **Acceptance criteria:** CI fails if bundle exceeds 750KB.

---

#### **P2-11 — Document on-call schedule and replace runbook placeholders**

- **Location:** `docs/production/incident-response.md`, `docs/production/README.md`.
- **Symptom:** Runbook has `[owner name, email]` placeholders.
- **Required fix:** Replace with real on-call info (or, if none exists, document that on-call is not yet staffed and add a P1 to staff it). Add an on-call rotation table.

---

#### **P2-12 — Add `X-Frame-Options` and `Referrer-Policy` to `_headers` (if missing)**

- **Location:** `apps/web/public/_headers`.
- **Required fix:** Verify the following are set:
  ```
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: geolocation=(), microphone=(), camera=()
  ```
  Also ensure `Content-Security-Policy` includes `frame-ancestors 'none'` (more modern than `X-Frame-Options`).

---

#### **P2-13 — Paginate report queries server-side**

- **Location:** `apps/web/worker/services/reports.service.ts` (general ledger query, balance sheet query).
- **Symptom:** Reports join many tables and load all rows; only the response is sliced. For large orgs this will time out.
- **Required fix:**
  1. Add `LIMIT/OFFSET` parameters to `getGeneralLedger`.
  2. For balance sheet and trial balance, accept `asOfDate` and use it in the SQL `WHERE` (already done) — but also add an index on `journal_lines(organization_id, account_id, journal_entry_id)` if missing.
- **Acceptance criteria:** GL query for an org with 100k journal lines returns in <2s.

---

#### **P2-14 — Cap CSV exports and notify user**

- **Location:** `apps/web/worker/services/exports.service.ts`.
- **Symptom:** General ledger CSV caps at 50k rows silently. User is not notified.
- **Required fix:**
  1. If the result set exceeds 50k rows, include a header row note: `# NOTE: Result truncated to 50000 rows of N total`.
  2. Return a `truncated: true` flag in the API response metadata.
  3. Frontend shows a toast: "Hasil ekspor dipotong ke 50.000 baris."

---

#### **P2-15 — Add `__Host-` prefix to session cookie**

- **Location:** `apps/web/worker/routes/auth.routes.ts` (all `setCookie` calls).
- **Required fix:** When `env.APP_ENV === 'production'`, use cookie name `__Host-ledjer_session` with `Path=/`, `Secure`, `SameSite=Lax`, no `Domain`. In dev, keep `ledjer_session`. Update `getCookie` calls in `auth.middleware.ts` to try both names.

---

### 4.4 P3 — LOW PRIORITY / CLEANUP

- **P3-1** — Remove dead code: `transactions.service.ts` lines 275 and `exports.service.ts` line 277 — the `transaction_type NOT LIKE 'opening_%'` filter never matches (no transaction type starts with `opening_`).
- **P3-2** — Fix opening-balance entry numbers to use `JE-NNNNNN` instead of `JE-OB-NNNNNN` per the doc, OR update the doc to match.
- **P3-3** — Add a `Number.MAX_SAFE_INTEGER` guard in `transactions.service.ts` line 1704 for `qtyMilli × unitPriceMinor` overflow.
- **P3-4** — Replace magic number `code != 3500` in `reports.service.ts:268` with a constant `NET_INCOME_ACCOUNT_CODE = '3500'` and reference the account by `is_system = 1 AND account_type = 'equity' AND code = ?` to be rename-safe.
- **P3-5** — Add an `Idempotent-Replay: true` response header when a post/void/settle returns an existing result.
- **P3-6** — Fix `products.service.ts:538` `fromQuantityMilli` to return a string with 3 decimal places, not a float, to preserve precision in the API contract.
- **P3-7** — Add a `GET /api/audit-logs` endpoint with `team:manage` permission so admins can review the audit trail from the UI.
- **P3-8** — Add i18n infrastructure (currently all strings are hardcoded Indonesian or English in components). Even if MVP is Indonesian-only, extracting strings makes future localization trivial.
- **P3-9** — Add a `CHANGELOG.md` and follow Keep a Changelog format.
- **P3-10** — Add a `SECURITY.md` with security policy, supported versions, and vulnerability reporting instructions.
- **P3-11** — Add JSDoc to all exported service functions documenting inputs, outputs, errors thrown, and audit actions.
- **P3-12** — Add a `docs/architecture.md` with diagrams (use Mermaid) for request lifecycle, posting flow, void flow, and OAuth flow.
- **P3-13** — Run `pnpm audit` and address any high-severity vulnerabilities.
- **P3-14** — Add `engines` field to `package.json` with `node: ">=24"` and `pnpm: ">=10"`.
- **P3-15** — Add a `pre-commit` hook (via `lint-staged` + `husky` or simple shell script) that runs `typecheck` and `lint` on staged files.

---

## 5. WORKFLOW PROTOCOL

### 5.1 Pre-flight Checklist (Run Once Before Starting)

```bash
cd /home/z/my-project/review/Ledjer-main
pnpm install
pnpm typecheck && pnpm lint && pnpm test && pnpm --filter web build
bash scripts/ci-local.sh --full
```

If any step fails BEFORE you make changes, log it in §8 — it's a pre-existing failure, not yours.

### 5.2 Per-Item Workflow

For each backlog item (e.g., P0-1):

1. **Read** the cited file(s) and surrounding context (at least ±50 lines around the cited line).
2. **Read** the relevant test file(s).
3. **Write** the fix using `Edit` or `MultiEdit` (not `Write` for existing files).
4. **Add or update** tests per the item's "Tests to add" section.
5. **Run** `pnpm typecheck && pnpm lint && pnpm test` locally.
6. **Run** `pnpm --filter web build` if frontend touched.
7. **Run** the specific test file: `pnpm --filter web exec vitest run <path>`.
8. **Commit** (see §5.4).
9. **Append** to `/home/z/my-project/worklog.md` (see §5.6).

### 5.3 Test File Conventions

- Unit/integration tests live next to the source file: `foo.ts` → `foo.test.ts`.
- E2E tests live in `apps/web/e2e/`.
- Use the existing `FakeD1Database` pattern (`apps/web/worker/test/fake-d1.ts`) for service tests.
- Use `describe`/`it` (not `test`) to match existing style.
- Test names: describe the scenario in plain English, e.g., `it('returns 70k remaining when settling a 100k credit sale with 30k already paid via different cash account', ...)`.

### 5.4 Commit Granularity

- One backlog item = at least one commit. Large items may be multiple commits (e.g., "fix bug", "add tests", "update docs").
- Commit message format:
  ```
  [P0-1] Fix calculateSettlementRemaining broken find predicate

  The find predicate used `originalCashAccountId === cashAccountId` which
  does not reference the line being checked, causing find to return the
  first line in the array regardless of account. Replace with a filter
  that sums all cash-account lines in the correct direction.

  Constraint ref: C-ACC-7
  Tests: 4 new cases in transactions.service.test.ts
  ```
- Use conventional-commits style (`fix:`, `feat:`, `test:`, `docs:`, `chore:`) only if the existing repo does; otherwise the `[Pn-N]` prefix is sufficient.

### 5.5 Quality Gate (Run Before Every Commit)

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm --filter web build
```

All four must exit 0. If any fails, do NOT commit — fix the failure first.

For frontend changes, also run:
```bash
pnpm --filter web exec playwright test e2e/smoke.spec.ts --project=chromium
```

### 5.6 Worklog Entry Template

After each item, append to `/home/z/my-project/worklog.md`:

```markdown
---
Task ID: P0-1
Agent: <your name/model>
Task: Fix calculateSettlementRemaining broken find predicate

Work Log:
- Read transactions.service.ts lines 641-659 and surrounding context
- Wrote 4 new test cases in transactions.service.test.ts
- Replaced broken find with filter+sum approach
- Ran pnpm test — all 5 new tests pass, no regressions
- Committed: [P0-1] Fix calculateSettlementRemaining broken find predicate

Stage Summary:
- Settlement now correctly computes remainingMinor in all 4 scenarios
- AR/AP can no longer go negative due to settlement miscalculation
- Files changed: transactions.service.ts, transactions.service.test.ts
- Constraint ref: C-ACC-7
- No follow-ups
```

### 5.7 Branch Strategy

- Create a branch per P-level: `fix/p0-blockers`, `fix/p1-high`, `fix/p2-medium`, `fix/p3-cleanup`.
- Or one branch per item if your tooling supports it: `fix/P0-1-settlement-bug`.
- Do NOT push to `main` directly.

---

## 6. ACCEPTANCE CRITERIA (Definition of Done)

The remediation is complete when ALL of the following are true:

1. **All P0 items** are committed and merged.
2. **All P1 items** are committed and merged.
3. **P2 and P3 items** are either committed OR explicitly deferred in §8 with a rationale.
4. **Quality gate** (§5.5) is green on the final commit.
5. **`bash scripts/ci-local.sh --full`** exits 0.
6. **`pnpm --filter web exec playwright test`** (full suite) exits 0.
7. **`docs/accounting-rules.md`** matches the implementation (no drift between doc and code).
8. **`AUDIT-AND-REMEDIATION.md`** has a new section "Round 2 — 2026-07-15" listing every P0/P1 item resolved with commit SHAs.
9. **`/home/z/my-project/worklog.md`** has an entry for every item.
10. **`§8 Discovered During Remediation`** in this file is updated with any new findings or invalidated findings.

---

## 7. FORBIDDEN ACTIONS (Hard No)

- **DO NOT** introduce new runtime dependencies without approval.
- **DO NOT** refactor code outside the scope of the item.
- **DO NOT** delete or skip tests to make CI pass.
- **DO NOT** use `any`, `@ts-ignore`, or `eslint-disable` without a justification comment.
- **DO NOT** use floating-point arithmetic for monetary values.
- **DO NOT** store secrets, tokens, or PII in frontend code or `localStorage`.
- **DO NOT** push to `main` or deploy to production.
- **DO NOT** change database column types from INTEGER to FLOAT/REAL.
- **DO NOT** remove the `organization_id` filter from any tenant-scoped query.
- **DO NOT** weaken PBKDF2 iteration count, salt length, or key length.
- **DO NOT** remove the `assertJournalBalanced` call from `postTransaction`.
- **DO NOT** remove the schema CHECK constraint on `journal_lines` (debit/credit one-sided).
- **DO NOT** auto-link OAuth accounts by email match (see P0-4).
- **DO NOT** fail-open on CSRF in production (see P0-5).
- **DO NOT** log raw request bodies, passwords, or tokens (see C-SEC-8).
- **DO NOT** use `console.log` in production code paths (use the structured logger from P1-11).

---

## 8. DISCOVERED DURING REMEDIATION (Agent Appends Here)

> Append findings you discover during the work that are NOT in §4. Mark false positives from §4 as `[INVALIDATED]` with proof.

```markdown
### D-1 (discovered by pi, 2026-07-15)
- Title: Placeholder E2E specs need real test implementation
- Location: apps/web/e2e/static-routes.spec.ts, visual.spec.ts, performance.spec.ts
- Severity: P2
- Description: Created placeholder specs to unblock CI. Need proper test cases.
- Action taken: logged for later

### D-2 (discovered by pi, 2026-07-15)
- Title: Missing calculateSettlementRemaining export
- Location: apps/web/worker/services/transactions.service.ts:641
- Severity: P3
- Description: Function was not exported, needed export for unit testing
- Action taken: fixed — added export keyword

### D-4 (P2-1/P2-2 decision, 2026-07-15)
- Decision: Dropped unused `account_mappings` and `export_jobs` tables
- Rationale: Hardcoded account codes are the intended MVP design; sync exports don't need a jobs table. Both tables added schema dead weight.
- Migration: 0007_drop_unused_tables.sql
- Action: Dropped tables, updated schema.ts, removed export_jobs cleanup from maintenance.service.ts
```

---

## 9. APPENDIX — EXISTING TESTS AND THEIR COVERAGE

> Pre-existing test inventory (do NOT delete; extend only):

| File | What it covers |
|---|---|
| `worker/services/auth.service.test.ts` | Login rate limiting, password reset, email verification |
| `worker/services/transactions.service.test.ts` | `assertJournalBalanced`, `assertPeriodOpen` (with fake D1) |
| `worker/services/reports.service.test.ts` | `assertTrialBalanceBalanced` (synthetic rows) |
| `worker/services/accounts.service.test.ts` | `nextCashBankCode`, `deleteAccount`, `patchAccount` |
| `worker/services/products.service.test.ts` | `recordStockMovement`, `reconcileStock` |
| `worker/services/dashboard.service.test.ts` | `currentMonthPeriod`, dashboard SQL shape |
| `worker/services/exports.service.test.ts` | `csvEscape`, `toCsv` |
| `worker/services/golden-scenarios.test.ts` | `assertJournalBalanced` on hand-crafted lines; WAC arithmetic (one no-op void test — see P2-9) |
| `worker/services/team.service.test.ts` | Team invitation flow |
| `worker/auth/auth-crypto.test.ts` | PBKDF2, token hashing, timing-safe compare |
| `worker/db/schema.test.ts` | Schema enum consistency |
| `worker/index.test.ts` | Worker boot, not-found handling |
| `worker/organization.test.ts` | Organization middleware |
| `src/__tests__/auth-*.test.tsx` | Login, register, forgot-password, reset-password, auth-callback, auth-provider flows |
| `src/__tests__/transactions.test.ts` | Frontend transaction helpers |
| `src/__tests__/smoke.test.ts` | App smoke test |
| `src/__tests__/transaction-helpers.test.ts` | Pure helper functions |
| `e2e/smoke.spec.ts` | Public smoke |
| `e2e/auth.spec.ts` | Auth flow E2E |
| `e2e/security-public.spec.ts` | XSS, secrets, error messages |
| `e2e/accessibility.spec.ts` | axe-core a11y |
| `e2e/balance-sheet.spec.ts` | (broken — see P0-2) |
| `e2e/trial-balance.spec.ts` | (broken — see P0-2) |
| `e2e/profit-loss.spec.ts` | (broken — see P0-2) |
| `e2e/general-ledger.spec.ts` | (broken — see P0-2) |
| `e2e/products.spec.ts` | (broken — see P0-2) |
| `e2e/accounts.spec.ts` | Chart of accounts |
| `e2e/team-settings.spec.ts` | Team settings |
| `e2e/period-locks.spec.ts` | Period locks |
| `e2e/new-transaction.spec.ts` | New transaction flow |

---

## 10. END OF PROMPT

Begin work now. Start with P0-1. Update the worklog after each item. Stop and report when §6 acceptance criteria are met or when you hit a blocker you cannot resolve.

If anything in this prompt is ambiguous, choose the interpretation that maximizes accounting correctness, security, and tenant isolation — in that order. Document the choice in §8.

// END
