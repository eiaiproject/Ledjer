# Billing Setup Guide

Last updated: 2026-06-27

## Current Status

**⚠️ Self-serve billing is NOT implemented.** Manual billing via admin SQL console is the current method.

The billing scaffold (provider abstraction, billing events table, admin RPCs) is in place for Stage 4. Actual payment provider integration requires selecting and implementing a provider.

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

## When Adding a Payment Provider

1. **Choose provider**: Midtrans (Indonesia), Stripe, Xendit, etc.
2. **Implement `BillingProvider` interface** in `apps/web/src/lib/billing-providers/<provider>.ts`
3. **Create Edge Function** for webhook handling (server-side only)
4. **Add webhook signature verification**
5. **Wire checkout flow** in billing settings page
6. **Update landing page** CTAs to link to checkout
7. **Test full lifecycle**: checkout → active → renewal → cancellation
8. **Never expose provider API keys to frontend**

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
