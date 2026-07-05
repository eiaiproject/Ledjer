-- =============================================================================
-- TEMPORARY PRODUCT POLICY: free plan has unlimited transactions
-- =============================================================================
-- Transaction posting is free without a monthly quota for now. Keep monthly
-- usage reporting for the UI, but remove the server-side free-plan block from
-- post_transaction and return a nullable limit/remaining pair from
-- get_monthly_usage.
-- =============================================================================

DO $$
DECLARE
  v_signature TEXT := 'public.post_transaction(uuid,date,text,numeric,uuid,text,uuid,uuid,text,numeric,date,text,text,uuid,numeric,numeric,uuid,uuid,text)';
  v_source    TEXT;
  v_updated   TEXT;
  v_start     INTEGER;
  v_end       INTEGER;
BEGIN
  SELECT pg_get_functiondef(v_signature::regprocedure)
    INTO v_source;

  v_start := strpos(v_source, '  -- ── FIX #2: Subscription Transaction Limit Guard ──');
  v_end := strpos(v_source, '  -- ── Product Validation ──');

  IF v_start = 0 OR v_end = 0 OR v_end <= v_start THEN
    RAISE EXCEPTION 'Could not locate free-plan transaction limit block in post_transaction';
  END IF;

  v_updated :=
    substring(v_source FROM 1 FOR v_start - 1) ||
    '  -- ── TEMP: Transaction posting is unlimited for every plan. ──' || E'\n' ||
    '  -- Plan gates still apply to non-transaction features such as team invites.' || E'\n\n' ||
    substring(v_source FROM v_end);

  v_updated := regexp_replace(v_updated, ';[[:space:]]*$', '');
  EXECUTE v_updated;
END $$;

CREATE OR REPLACE FUNCTION public.get_monthly_usage(p_org_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count INTEGER;
  v_period_start TIMESTAMPTZ;
  v_period_end TIMESTAMPTZ;
BEGIN
  IF NOT public.is_org_member(p_org_id) THEN
    RAISE EXCEPTION 'You are not a member of this organization';
  END IF;

  v_period_start := date_trunc('month', now());
  v_period_end   := v_period_start + INTERVAL '1 month';

  SELECT COUNT(*)::INTEGER
  INTO v_count
  FROM public.transactions
  WHERE organization_id = p_org_id
    AND status IN ('posted', 'voided')
    AND original_transaction_id IS NULL
    AND transaction_type NOT LIKE 'opening_%'
    AND created_at >= v_period_start
    AND created_at < v_period_end;

  RETURN jsonb_build_object(
    'count',        v_count,
    'limit',        NULL,
    'remaining',    NULL,
    'is_unlimited', true,
    'period_start', v_period_start,
    'period_end',   v_period_end
  );
END;
$$;

ALTER FUNCTION public.get_monthly_usage(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_monthly_usage(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_monthly_usage(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_monthly_usage(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_monthly_usage(uuid) TO service_role;

ALTER FUNCTION public.post_transaction(uuid, date, text, numeric, uuid, text, uuid, uuid, text, numeric, date, text, text, uuid, numeric, numeric, uuid, uuid, text) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.post_transaction(uuid, date, text, numeric, uuid, text, uuid, uuid, text, numeric, date, text, text, uuid, numeric, numeric, uuid, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.post_transaction(uuid, date, text, numeric, uuid, text, uuid, uuid, text, numeric, date, text, text, uuid, numeric, numeric, uuid, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.post_transaction(uuid, date, text, numeric, uuid, text, uuid, uuid, text, numeric, date, text, text, uuid, numeric, numeric, uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_transaction(uuid, date, text, numeric, uuid, text, uuid, uuid, text, numeric, date, text, text, uuid, numeric, numeric, uuid, uuid, text) TO service_role;
