-- ──────────────────────────────────────────────────────────────────────────────
-- Production hardening for Mayar billing
-- ──────────────────────────────────────────────────────────────────────────────
-- 1. finalize_mayar_payment RPC — idempotent, race-safe payment finalization
--    Uses conditional update semantics (only processes if session is 'pending')
-- 2. Partial unique index to prevent duplicate pending checkout sessions for the
--    same org + plan + billing_period
-- 3. Updated_at trigger for billing_checkout_sessions
-- ──────────────────────────────────────────────────────────────────────────────

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. finalize_mayar_payment RPC
-- ══════════════════════════════════════════════════════════════════════════════
-- Called by the mayar-webhook Edge Function after verifying invoice status
-- with Mayar API.  Wrapped in a single transaction with row-level locking
-- to prevent race conditions from duplicate or parallel webhook deliveries.
--
-- Returns the updated session row if payment was finalized.
-- Returns NULL if the session was already paid (idempotent no-op).
-- Raises an exception if the session is not found or is in an unexpected state.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.finalize_mayar_payment(
  p_session_id            UUID,
  p_organization_id       UUID,
  p_actor_user_id         UUID,
  p_plan                  TEXT,
  p_billing_period        TEXT,
  p_amount                INTEGER,
  p_period_start          TIMESTAMPTZ,
  p_period_end            TIMESTAMPTZ,
  p_provider_transaction_id TEXT DEFAULT NULL,
  p_provider_customer_id    TEXT DEFAULT NULL,
  p_webhook_payload         JSONB DEFAULT '{}'::jsonb,
  p_provider_response       JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session       RECORD;
  v_org_before    RECORD;
  v_result        JSONB;
  v_active_status CONSTANT TEXT := 'active';
  v_mayar_provider CONSTANT TEXT := 'mayar';
BEGIN
  -- Lock the session row to prevent concurrent webhook processing
  SELECT id, status, plan, billing_period, amount, organization_id, created_by
  INTO   v_session
  FROM   public.billing_checkout_sessions
  WHERE  id = p_session_id
  FOR UPDATE;  -- row-level lock

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Checkout session not found: %', p_session_id;
  END IF;

  -- Idempotency: if already paid, return success without side effects
  IF v_session.status = 'paid' THEN
    RETURN jsonb_build_object(
      'id', v_session.id,
      'status', 'paid',
      'idempotent', true
    );
  END IF;

  -- Only process pending sessions
  IF v_session.status != 'pending' THEN
    RAISE EXCEPTION 'Cannot finalize session in status: %', v_session.status;
  END IF;

  -- Verify the session belongs to the expected organization
  IF v_session.organization_id != p_organization_id THEN
    RAISE EXCEPTION 'Session organization mismatch';
  END IF;

  -- Verify amount matches
  IF v_session.amount != p_amount THEN
    RAISE EXCEPTION 'Session amount mismatch: expected % got %', v_session.amount, p_amount;
  END IF;

  -- Capture current org state before changes
  SELECT current_plan, subscription_status
  INTO   v_org_before
  FROM   public.organizations
  WHERE  id = p_organization_id
  FOR UPDATE;  -- lock org row too

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organization not found: %', p_organization_id;
  END IF;

  -- Update organization subscription
  UPDATE public.organizations
  SET
    current_plan                  = p_plan::public.org_plan,
    subscription_status           = v_active_status,
    current_period_start          = p_period_start,
    current_period_end            = p_period_end,
    payment_provider              = v_mayar_provider,
    payment_provider_customer_id  = COALESCE(NULLIF(p_provider_customer_id, ''), payment_provider_customer_id),
    payment_provider_subscription_id = COALESCE(NULLIF(p_provider_transaction_id, ''), payment_provider_subscription_id),
    updated_at                    = now()
  WHERE id = p_organization_id;

  -- Mark checkout session as paid
  UPDATE public.billing_checkout_sessions
  SET
    status                = 'paid',
    paid_at               = now(),
    mayar_transaction_id  = COALESCE(NULLIF(p_provider_transaction_id, ''), mayar_transaction_id),
    webhook_payload       = p_webhook_payload,
    provider_response     = p_provider_response,
    updated_at            = now()
  WHERE id = p_session_id;

  -- Insert payment succeeded event
  INSERT INTO public.billing_events (
    organization_id,
    actor_user_id,
    event_type,
    from_plan,
    to_plan,
    from_status,
    to_status,
    payment_provider,
    provider_event_id,
    metadata
  ) VALUES (
    p_organization_id,
    p_actor_user_id,
    'payment_succeeded',
    v_org_before.current_plan,
    p_plan,
    v_org_before.subscription_status,
    v_active_status,
    v_mayar_provider,
    p_provider_transaction_id,
    jsonb_build_object(
      'checkout_session_id', p_session_id,
      'billing_period', p_billing_period,
      'amount', p_amount,
      'current_period_start', p_period_start,
      'current_period_end', p_period_end
    )
  );

  -- Insert audit log for plan change
  INSERT INTO public.audit_logs (
    organization_id,
    actor_user_id,
    entity_type,
    entity_id,
    action,
    before_data,
    after_data,
    reason
  ) VALUES (
    p_organization_id,
    p_actor_user_id,
    'organization',
    p_organization_id,
    'billing_plan_change',
    jsonb_build_object(
      'plan', v_org_before.current_plan,
      'subscription_status', v_org_before.subscription_status
    ),
    jsonb_build_object(
      'plan', p_plan,
      'subscription_status', v_active_status,
      'payment_provider', v_mayar_provider
    ),
    'mayar_payment_succeeded'
  );

  -- Return the updated session as confirmation
  SELECT jsonb_build_object(
    'id', s.id,
    'status', s.status,
    'paid_at', s.paid_at,
    'idempotent', false
  )
  INTO v_result
  FROM public.billing_checkout_sessions s
  WHERE s.id = p_session_id;

  RETURN v_result;
END;
$$;

-- Grant execution to service_role only (called from Edge Function)
REVOKE ALL ON FUNCTION public.finalize_mayar_payment(
  UUID, UUID, UUID, TEXT, TEXT, INTEGER, TIMESTAMPTZ, TIMESTAMPTZ,
  TEXT, TEXT, JSONB, JSONB
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_mayar_payment(
  UUID, UUID, UUID, TEXT, TEXT, INTEGER, TIMESTAMPTZ, TIMESTAMPTZ,
  TEXT, TEXT, JSONB, JSONB
) TO service_role;

COMMENT ON FUNCTION public.finalize_mayar_payment IS
  'Idempotent, race-safe payment finalization called by the mayar-webhook Edge Function. Uses row-level locking (FOR UPDATE) and conditional update semantics to prevent double-processing from duplicate/parallel webhook deliveries.';

-- ══════════════════════════════════════════════════════════════════════════════
-- 2. Partial unique index for duplicate pending checkout prevention
-- ══════════════════════════════════════════════════════════════════════════════
-- Prevents the same user+org+plan+billing_period from having more than one
-- active pending session.  The Edge Function looks up existing pending
-- sessions before creating a new Mayar invoice.
-- ══════════════════════════════════════════════════════════════════════════════

DROP INDEX IF EXISTS idx_billing_checkout_sessions_unique_pending;
CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_checkout_sessions_unique_pending
  ON public.billing_checkout_sessions(organization_id, plan, billing_period, created_by)
  WHERE status = 'pending';

COMMENT ON INDEX public.idx_billing_checkout_sessions_unique_pending IS
  'Prevents duplicate pending checkout sessions for the same user+org+plan+billing_period.';

-- ══════════════════════════════════════════════════════════════════════════════
-- 3. Auto-update updated_at for billing_checkout_sessions
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.update_billing_checkout_sessions_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_billing_checkout_sessions_updated_at ON public.billing_checkout_sessions;
CREATE TRIGGER trg_billing_checkout_sessions_updated_at
  BEFORE UPDATE ON public.billing_checkout_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_billing_checkout_sessions_updated_at();

-- ══════════════════════════════════════════════════════════════════════════════
-- 4. Revoke the updated_at trigger function from anon/authenticated
-- ══════════════════════════════════════════════════════════════════════════════
REVOKE ALL ON FUNCTION public.update_billing_checkout_sessions_updated_at() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_billing_checkout_sessions_updated_at() TO service_role;
