-- Mayar checkout session state for self-serve billing.
-- The checkout session is the idempotency anchor between Ledjer plans and
-- Mayar invoice/webhook identifiers.

CREATE TABLE IF NOT EXISTS public.billing_checkout_sessions (
  id UUID DEFAULT gen_random_uuid() NOT NULL,
  organization_id UUID NOT NULL,
  created_by UUID NOT NULL,
  plan public.org_plan NOT NULL,
  billing_period TEXT NOT NULL CHECK (billing_period IN ('monthly', 'yearly')),
  amount INTEGER NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'IDR',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'expired', 'failed', 'canceled')),
  payment_provider TEXT NOT NULL DEFAULT 'mayar',
  mayar_invoice_id TEXT,
  mayar_transaction_id TEXT,
  checkout_url TEXT,
  customer_email TEXT,
  customer_mobile TEXT,
  expires_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  provider_response JSONB DEFAULT '{}'::jsonb,
  webhook_payload JSONB DEFAULT '{}'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  CONSTRAINT billing_checkout_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT billing_checkout_sessions_org_fkey
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE,
  CONSTRAINT billing_checkout_sessions_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id),
  CONSTRAINT billing_checkout_sessions_paid_plan_check
    CHECK (plan IN ('solo', 'business'))
);

CREATE INDEX IF NOT EXISTS idx_billing_checkout_sessions_org_created
  ON public.billing_checkout_sessions(organization_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS billing_checkout_sessions_mayar_invoice_unique
  ON public.billing_checkout_sessions(mayar_invoice_id)
  WHERE mayar_invoice_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS billing_checkout_sessions_mayar_transaction_unique
  ON public.billing_checkout_sessions(mayar_transaction_id)
  WHERE mayar_transaction_id IS NOT NULL;

ALTER TABLE public.billing_checkout_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS billing_checkout_sessions_select ON public.billing_checkout_sessions;
CREATE POLICY billing_checkout_sessions_select ON public.billing_checkout_sessions
  FOR SELECT USING (public.is_org_member(organization_id));

REVOKE ALL ON public.billing_checkout_sessions FROM PUBLIC, anon;
GRANT SELECT ON public.billing_checkout_sessions TO authenticated;
GRANT ALL ON public.billing_checkout_sessions TO service_role;
