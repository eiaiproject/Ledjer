# Private Beta QA Checklist

Expand on the existing `docs/qa-checklist.md` with private-beta-specific scenarios.

## Prerequisites

- Private beta environment deployed (frontend + Supabase)
- Test user accounts: 1 owner, 1 staff
- Sentry configured and receiving test errors
- Email confirmation enabled in Supabase
- Latest migration applied

---

## A. Account & Auth

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| A1 | Register new user | Fill email, password, full name on `/register` | Success message, redirect or email confirmation notice |
| A2 | Email confirmation | Check inbox, click confirmation link | Redirect to `/auth/callback`, then to `/onboarding` |
| A3 | Login | Enter credentials on `/login` | Redirect to `/dashboard` |
| A4 | Logout | Click logout in sidebar | Redirect to `/login`, session cleared |
| A5 | Password reset | Click "Lupa password?", enter email, click link | Redirect to `/reset-password`, set new password, login works |
| A6 | Auth redirect domain | After reset, verify redirect goes to production URL | No "redirect mismatch" error |
| A7 | Session persistence | Close browser, reopen, navigate to app | Session persists, no re-login required |
| A8 | Invalid login | Enter wrong password | Error message shown, no redirect |
| A9 | Expired session | Wait for JWT expiry (1 hour) or revoke session | Redirect to `/login` |

---

## B. Onboarding

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| B1 | Create organization | Complete onboarding form | Org created, accounts seeded, redirect to `/dashboard` |
| B2 | Books start date | Set start date | Transactions cannot be created before this date |
| B3 | Default chart of accounts | After onboarding | 10+ default accounts present (1110, 1200, 2100, etc.) |
| B4 | Empty dashboard state | Fresh org with no transactions | Zero balances, empty recent transactions |
| B5 | Onboarding guard | Navigate to `/dashboard` before completing onboarding | Redirect to `/onboarding` |

---

## C. Core Accounting Flow

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| C1 | Cash sale | Create Penjualan Tunai with amount | Transaction created, journal balanced |
| C2 | Expense payment | Create Bayar Beban | Debit expense, credit cash |
| C3 | Cash transfer | Create Transfer Antar Rekening | Balances shift correctly |
| C4 | Void transaction | Void a posted transaction | Reversal journal created, balances restored |
| C5 | Audit log | View audit log (owner only) | All financial actions logged |
| C6 | Journal balance | Create any transaction, check journal | Σ debit = Σ credit |
| C7 | Transaction limit | On free plan, create 50 transactions | 51st blocked with plan limit error |
| C8 | Duplicate prevention | Submit same form twice quickly | Only one transaction created (client_token idempotency) |

---

## D. Inventory / Product Flow

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| D1 | Create product | Add product with name, purchase price, selling price | Product appears in list |
| D2 | Purchase stock | Create purchase with product | Stock increases, inventory account debited |
| D3 | Sell stock | Create sale with product | Stock decreases, COGS journal created |
| D4 | Stock movement | After purchase + sale | `stock_movements` records both entries |
| D5 | COGS weighted average | Purchase 10 @ Rp 10,000, then 5 @ Rp 12,000, sell 1 | COGS = weighted average |
| D6 | Missing COGS account | Delete COGS account (5100), try to sell product | Error about missing COGS account |

---

## E. Reports

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| E1 | Trial balance | Navigate to `/reports/trial-balance` | Total debits = total credits |
| E2 | Profit & Loss | Navigate to `/reports/profit-loss` | Revenue - Expenses = Net Income |
| E3 | Balance sheet | Navigate to `/reports/balance-sheet` | Assets = Liabilities + Equity |
| E4 | General ledger | Navigate to `/reports/general-ledger` | All posted transactions shown |
| E5 | Date range filter | Filter reports by date range | Only transactions in range shown |
| E6 | Empty state | View reports with no transactions | Graceful empty state, no errors |
| E7 | As-of date balance sheet | Create future-dated transaction, view today | Future transaction excluded |

---

## F. Plan / Billing

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| F1 | Free plan display | View Settings → Billing | "Gratis" plan shown, 50 transaction limit displayed |
| F2 | Free plan limit | Create 50 transactions on free plan | 51st blocked |
| F3 | Mayar checkout (owner) | Enter WhatsApp, click "Bayar dengan Mayar" | Redirects to checkout and creates pending session |
| F4 | Upgrade request (staff) | View billing as staff | "Hanya pemilik" notice, no checkout button |
| F5 | Webhook plan change | Paid Mayar webhook received | Next page load shows new plan |
| F6 | Post-upgrade behavior | After upgrade to solo/business | Transaction limit removed, features unlocked |

---

## G. Team / Staff

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| G1 | Add staff | Owner invites staff by email | Invitation sent (requires confirmed email) |
| G2 | Staff login | Staff logs in with invited credentials | Access to dashboard, limited features |
| G3 | Staff permission: create | Staff with `can_create_transaction` | Can create transactions |
| G4 | Staff permission: blocked | Staff without `can_create_transaction` | Cannot create transactions |
| G5 | Staff cannot manage accounts | Staff tries `/accounts` | Restricted, no create/edit options |
| G6 | Owner manages settings | Owner accesses `/settings/team` | Full management UI |
| G7 | Cross-org isolation | Staff from org A tries to access org B data | Blocked by RLS |

---

## H. Error / Edge Cases

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| H1 | Invalid form input | Submit form with missing/invalid fields | Inline validation errors |
| H2 | Network failure | Disconnect network, try to create transaction | Graceful error message |
| H3 | Expired session | Attempt action after JWT expires | Redirect to `/login` |
| H4 | Unauthorized route | Navigate to `/dashboard` without login | Redirect to `/login` |
| H5 | 404 page | Navigate to `/nonexistent` | Redirect to `/dashboard` (current catch-all) |
| H6 | Error boundary | Trigger component error | Error boundary catches, shows recovery UI |
| H7 | Large amount | Transaction with amount 999,999,999,999 | Handled correctly |
| H8 | Zero amount | Transaction with amount 0 | Error "Nominal harus lebih dari 0" |

---

## I. Deployment Smoke

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| I1 | Home page loads | Open production URL (`https://ledjer-ahk.pages.dev`) | Landing page renders |
| I2 | Login page loads | Navigate to `/login` | Login form visible |
| I3 | Register page loads | Navigate to `/register` | Register form visible |
| I4 | Supabase connection | Submit login form | Auth request succeeds (check network tab) |
| I5 | Sentry receives error | Trigger a client error | Error appears in Sentry dashboard |
| I6 | CSP headers present | Check response headers in DevTools | CSP, HSTS, X-Frame-Options present |
| I7 | No config error | Load app with valid env vars | No "Konfigurasi Belum Lengkap" message |
| I8 | HTTPS | Verify all traffic is HTTPS | No mixed content warnings |
