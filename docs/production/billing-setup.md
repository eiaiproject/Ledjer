# Billing Setup Guide

Last updated: 2026-07-05

## Current Status

**Mayar self-serve checkout is implemented and active for private beta.**

The app creates Mayar invoices through Supabase Edge Functions and updates plans from the Mayar webhook after verifying invoice status through Mayar's API. Manual billing via admin SQL console remains the fallback procedure.

Temporary product policy: the Gratis plan currently has no transaction limit. Paid plans still exist for plan lifecycle and feature differentiation, but transaction posting is unlimited across plans.

## Plan Structure

| Plan | Monthly | Yearly | Staff Limit | Transaction Limit |
|------|---------|--------|-------------|-------------------|
| Gratis | Rp 0 | Rp 0 | 0 | Unlimited (temporary) |
| Solo | Rp 39.000 | Rp 390.000 | 0 | Unlimited |
| Business | Rp 49.000 | Rp 490.000 | 1 | Unlimited |

## Manual Billing Procedure

### Changing a Plan (Admin)

```sql
-- Step 1: Find organization
SELECT id, name, current_plan, created_by
FROM organizations
WHERE name ILIKE '%toko%';

-- Step 2: Update plan (via Supabase SQL Console — service role context)
SELECT public.admin_update_plan(
  '<ORG_UUID>'::uuid,
  'solo'  -- or 'free', 'business', 'trial', 'past_due', 'canceled', 'expired'
);

-- Step 3: Verify
SELECT id, name, current_plan, subscription_status
FROM organizations
WHERE id = '<ORG_UUID>';
```

### Suspending an Organization (Admin)

```sql
SELECT public.admin_set_suspension(
  '<ORG_UUID>'::uuid,
  true,                          -- suspend
  'Payment overdue'              -- reason
);

-- To unsuspend:
SELECT public.admin_set_suspension('<ORG_UUID>'::uuid, false, NULL);
```

### Viewing All Organizations (Admin)

```sql
SELECT * FROM public.admin_list_organizations();
SELECT * FROM public.admin_list_organizations('toko');  -- with search
```

## Billing Lifecycle States

```
free ──────> solo/business ──────> past_due ──────> canceled
  │               │                    │
  │               └── trial ──>        │
  │                                    │
  └────────────────────────────────────┘
  
suspended (overlay — can happen to any active plan)
```

| State | Description | Transaction Allowed |
|-------|-------------|---------------------|
| `active` | Paid and current | ✅ |
| `trialing` | In trial period | ✅ |
| `past_due` | Payment failed | ⚠️ Grace period (TBD) |
| `canceled` | User or admin canceled | ❌ |
| `expired` | Subscription expired | ❌ |
| `suspended` | Admin suspended (abuse/security) | ❌ |

## Database Schema

Key tables and columns:

- `organizations.current_plan` — enum: free, solo, business, trial, past_due, canceled, expired
- `organizations.subscription_status` — text: active, trialing, past_due, canceled, expired, suspended
- `organizations.trial_ends_at` — timestamp
- `organizations.locked_through_date` — date (period lock)
- `organizations.suspended_at` — timestamp
- `organizations.payment_provider` — text
- `organizations.payment_provider_customer_id` — text
- `organizations.payment_provider_subscription_id` — text
- `billing_events` — audit trail for all plan/status changes

## Mayar Setup

1. Deploy the Edge Functions:

```bash
supabase functions deploy mayar-create-checkout
supabase functions deploy mayar-webhook
```

2. Set server-side secrets:

```bash
supabase secrets set MAYAR_API_KEY='<mayar-api-key>'
supabase secrets set MAYAR_ENV='sandbox'              # or production
supabase secrets set MAYAR_WEBHOOK_TOKEN='<random-token>'
supabase secrets set APP_URL='https://ledjer-ahk.pages.dev'  # change to https://ledjer.id after custom domain is active
```

3. Register the Mayar webhook URL:

```text
https://<project-ref>.supabase.co/functions/v1/mayar-webhook?token=<MAYAR_WEBHOOK_TOKEN>
```

> ⚠️ **Correct URL format:** `https://<project-ref>.supabase.co/functions/v1/<function-name>`
> The legacy format `https://<project-ref>.functions.supabase.co/<function-name>` is deprecated and should not be used.


4. Test lifecycle: billing page checkout → Mayar paid invoice → webhook → `organizations.current_plan` changes to `solo`/`business`.

Security notes:

- Never expose `MAYAR_API_KEY` in Vite/frontend env.
- Public Mayar docs do not show webhook HMAC verification. The webhook URL token is required, and the function verifies invoice status through Mayar before changing a plan.    - `billing_checkout_sessions` is the idempotency record for invoice/webhook processing.

## Edge Function Auth Configuration

In `supabase/config.toml`:

```toml
[functions.mayar-create-checkout]
verify_jwt = true

[functions.mayar-webhook]
verify_jwt = false
```

- `mayar-create-checkout` requires a valid Supabase JWT (user must be authenticated).
- `mayar-webhook` does NOT require a JWT (external webhook from Mayar).
- Instead, `mayar-webhook` uses a mandatory `MAYAR_WEBHOOK_TOKEN` passed as a query parameter.

## Webhook Security

`MAYAR_WEBHOOK_TOKEN` is **mandatory**. The webhook will return 500 if the token is not configured, and 401 if the token is missing or wrong. Token comparison uses constant-time comparison to prevent timing attacks.

## Duplicate Checkout Prevention

The Edge Function checks for an existing pending checkout session for the same organization, plan, billing period, and user. If a valid pending session exists (not expired), the existing checkout URL is returned instead of creating a duplicate Mayar invoice. A partial unique index prevents duplicate pending sessions at the database level.

## Webhook Idempotency

The `finalize_mayar_payment` RPC uses row-level locking (`FOR UPDATE`) and conditional update semantics. If a checkout session is already marked as `paid`, the RPC returns an idempotent success result without inserting duplicate billing events or audit log entries.

## Audit Trail

All plan changes are recorded in:
- `billing_events` table (detailed, with metadata)
- `audit_logs` table (high-level actions)

Query recent billing events:
```sql
SELECT be.*, o.name as org_name
FROM billing_events be
JOIN organizations o ON o.id = be.organization_id
ORDER BY be.created_at DESC
LIMIT 50;
```
