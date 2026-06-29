# Billing Setup Guide

Last updated: 2026-06-29

## Current Status

**Mayar self-serve checkout is implemented as a server-side integration scaffold.**

The app creates Mayar invoices through Supabase Edge Functions and updates plans from the Mayar webhook after verifying invoice status through Mayar's API. Manual billing via admin SQL console remains the fallback procedure.

## Plan Structure

| Plan | Monthly | Yearly | Staff Limit | Transaction Limit |
|------|---------|--------|-------------|-------------------|
| Gratis | Rp 0 | Rp 0 | 0 | 50/month |
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
supabase secrets set APP_URL='https://app.ledjer.id'
```

3. Register the Mayar webhook URL:

```text
https://<project-ref>.functions.supabase.co/mayar-webhook?token=<MAYAR_WEBHOOK_TOKEN>
```

4. Test lifecycle: billing page checkout → Mayar paid invoice → webhook → `organizations.current_plan` changes to `solo`/`business`.

Security notes:

- Never expose `MAYAR_API_KEY` in Vite/frontend env.
- Public Mayar docs do not show webhook HMAC verification. The webhook URL token is required, and the function verifies invoice status through Mayar before changing a plan.
- `billing_checkout_sessions` is the idempotency record for invoice/webhook processing.

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
