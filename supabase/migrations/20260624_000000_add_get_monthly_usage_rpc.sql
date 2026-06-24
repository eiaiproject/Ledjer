-- =============================================================================
-- LEDJER — Add get_monthly_usage RPC
-- =============================================================================
-- Returns the current user's monthly transaction count, limit, and period
-- boundaries from a single server-owned source of truth. Eliminates
-- client-side timezone drift between UI usage display and backend
-- enforcement.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.get_monthly_usage(
  p_org_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_count INTEGER;
  v_limit INTEGER := 50;
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
    'limit',        v_limit,
    'remaining',    GREATEST(v_limit - v_count, 0),
    'period_start', v_period_start,
    'period_end',   v_period_end
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.get_monthly_usage(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_monthly_usage(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
