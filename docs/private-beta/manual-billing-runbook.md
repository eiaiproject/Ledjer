# Manual Billing & Plan Provisioning — Private Beta Runbook

## Overview

During private beta, there is no self-serve payment gateway. Billing is handled manually by the operator. The app displays "Minta Upgrade" which directs users to contact the operator via WhatsApp/email.

## Plan Structure

| Plan | Price (monthly) | Transaction Limit | Users |
|------|-----------------|-------------------|-------|
| `free` | Rp 0 | 50/month | 1 owner |
| `solo` | Rp 39,000 | Unlimited | 1 owner |
| `business` | Rp 49,000 | Unlimited | 1 owner + 1 staff |

## How a Beta User Requests Upgrade

1. User navigates to Settings → Langganan & Billing.
2. User clicks "Minta Upgrade" on the desired plan.
3. Button directs user to WhatsApp/email the operator.
4. User sends: organization name, desired plan, payment method.

## How an Operator Approves & Changes Plan

### Method: Supabase SQL Console

The `organizations` table has a trigger that blocks direct `current_plan` changes from `authenticated` users. Only `service_role` can update the plan. Use the Supabase SQL Console (dashboard → SQL Editor) with the service role key.

**Step 1: Find the organization**

```sql
SELECT id, name, current_plan, created_by
FROM organizations
WHERE name ILIKE '%<search term>%'
   OR id = '<org-uuid>';
```

**Step 2: Update the plan**

```sql
-- ⚠️  Only run from Supabase SQL Console (service_role context)
-- Replace <org-uuid> and <new-plan> with actual values.
UPDATE organizations
SET current_plan = '<new-plan>'   -- 'solo' or 'business'
WHERE id = '<org-uuid>';
```

Valid plan values: `'free'`, `'solo'`, `'business'`.

**Step 3: Verify the change**

```sql
SELECT id, name, current_plan
FROM organizations
WHERE id = '<org-uuid>';
```

The user's next page load will reflect the new plan. No logout required.

### Method: Admin SQL Helper Script

A convenience script is available at `scripts/admin-update-plan.sql.example`:

```sql
-- See scripts/admin-update-plan.sql.example for a parameterized version.
-- Usage: Replace the placeholder values and run in Supabase SQL Console.
```

## Safety Checks

- The update statement **must** be scoped by `id = '<org-uuid>'` — never update all rows.
- The `current_plan` trigger only allows `service_role` context. An `authenticated` user running this SQL directly will see: `"Cannot modify billing plan from client. Use service role or billing RPC."`
- **Before updating:** verify the organization exists and confirm the plan name is valid.
- **After updating:** query to confirm the change took effect.

## Recording Manual Payments

There is no billing table in the app yet. For private beta, track payments externally:

### Recommended: Simple Spreadsheet

| Date | Org ID | Org Name | Plan | Amount Paid | Payment Method | Receipt | Operator |
|------|--------|----------|------|-------------|----------------|---------|----------|
| 2026-07-01 | abc-123 | Toko Maju | solo | Rp 39,000 | Bank Transfer | photo.pdf | Budi |

Store this spreadsheet in a shared drive accessible to operators.

## Downgrade / Revert

```sql
-- Revert to free plan (e.g., payment failed or user requested cancellation)
UPDATE organizations
SET current_plan = 'free'
WHERE id = '<org-uuid>';
```

The transaction limit (50/month) will re-apply immediately. If the user has exceeded 50 transactions in the current month, they will be blocked from creating new transactions until the next month.

## Failed / Manual Payment Follow-Up

1. User reports payment via WhatsApp/email.
2. Operator verifies payment receipt (bank transfer screenshot, etc.).
3. Operator runs plan update SQL.
4. Operator records payment in the tracking spreadsheet.
5. Operator notifies user via WhatsApp/email that upgrade is active.

## What NOT to Do

- ❌ Never allow `authenticated` users to change their own plan via SQL.
- ❌ Never run `UPDATE organizations SET current_plan` without `WHERE id = '<org-uuid>'`.
- ❌ Never expose `SUPABASE_SERVICE_ROLE_KEY` to frontend code.
- ❌ Never commit real payment records to the repository.
