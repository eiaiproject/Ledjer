-- =============================================================================
-- FIX: CSV export safety for report exports (trial balance, profit loss, balance sheet)
-- =============================================================================
-- These exports were created in stage4 (20260627000000) with naive comma
-- concatenation. The production hardening migration (20260731000000) updated
-- transactions, accounts, products, and general ledger to use csv_escape,
-- but missed trial balance, profit loss, and balance sheet.
--
-- Fix: Re-create all three with csv_escape to prevent formula injection
-- and CSV structural breaks from user-controlled fields.
-- =============================================================================

-- ── Shared permission guard (reduces duplication across 3 export fns) ──
CREATE OR REPLACE FUNCTION public.check_export_permission(p_org_id UUID) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
AS $$
BEGIN
  IF NOT public.is_org_member(p_org_id) THEN
    RAISE EXCEPTION 'Anda bukan anggota organisasi ini';
  END IF;
  IF NOT public.has_permission(p_org_id, 'can_view_reports') THEN
    RAISE EXCEPTION 'Anda tidak memiliki izin untuk export data';
  END IF;
END;
$$;

ALTER FUNCTION public.check_export_permission(UUID) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.check_export_permission(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_export_permission(UUID) TO authenticated;

-- ── Trial Balance CSV ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.export_trial_balance_csv(
  p_organization_id UUID,
  p_as_of_date DATE DEFAULT NULL
) RETURNS TEXT
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
AS $$
DECLARE
  v_result TEXT;
  v_header TEXT := 'Kode Akun,Nama Akun,Debit,Kredit';
  v_date DATE;
BEGIN
  PERFORM public.check_export_permission(p_organization_id);

  v_date := COALESCE(p_as_of_date, CURRENT_DATE);

  SELECT string_agg(
    public.csv_escape(tb.account_code::TEXT) || ',' ||
    public.csv_escape(tb.account_name) || ',' ||
    public.csv_escape(tb.ending_debit::TEXT) || ',' ||
    public.csv_escape(tb.ending_credit::TEXT),
    E'\n'
    ORDER BY tb.account_code
  ) INTO v_result
  FROM public.get_trial_balance(p_organization_id, v_date) tb;

  RETURN v_header || E'\n' || COALESCE(v_result, '');
END;
$$;

ALTER FUNCTION public.export_trial_balance_csv(UUID, DATE) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.export_trial_balance_csv(UUID, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.export_trial_balance_csv(UUID, DATE) TO authenticated;

-- ── Profit & Loss CSV ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.export_profit_loss_csv(
  p_organization_id UUID,
  p_from_date DATE DEFAULT NULL,
  p_to_date DATE DEFAULT NULL
) RETURNS TEXT
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
AS $$
DECLARE
  v_result TEXT;
  v_header TEXT := 'Bagian,Kode Akun,Nama Akun,Jumlah';
  v_from DATE;
  v_to DATE;
BEGIN
  PERFORM public.check_export_permission(p_organization_id);

  v_from := COALESCE(p_from_date, date_trunc('month', CURRENT_DATE)::DATE);
  v_to := COALESCE(p_to_date, CURRENT_DATE);

  SELECT string_agg(
    public.csv_escape(pl.section) || ',' ||
    public.csv_escape(pl.account_code::TEXT) || ',' ||
    public.csv_escape(pl.account_name) || ',' ||
    public.csv_escape(pl.amount::TEXT),
    E'\n'
    ORDER BY pl.section, pl.account_code
  ) INTO v_result
  FROM public.get_profit_loss(p_organization_id, v_from, v_to) pl;

  RETURN v_header || E'\n' || COALESCE(v_result, '');
END;
$$;

ALTER FUNCTION public.export_profit_loss_csv(UUID, DATE, DATE) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.export_profit_loss_csv(UUID, DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.export_profit_loss_csv(UUID, DATE, DATE) TO authenticated;

-- ── Balance Sheet CSV ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.export_balance_sheet_csv(
  p_organization_id UUID,
  p_as_of_date DATE DEFAULT NULL
) RETURNS TEXT
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
AS $$
DECLARE
  v_result TEXT;
  v_header TEXT := 'Bagian,Kode Akun,Nama Akun,Jumlah';
  v_date DATE;
BEGIN
  PERFORM public.check_export_permission(p_organization_id);

  v_date := COALESCE(p_as_of_date, CURRENT_DATE);

  SELECT string_agg(
    public.csv_escape(bs.section) || ',' ||
    public.csv_escape(bs.account_code::TEXT) || ',' ||
    public.csv_escape(bs.account_name) || ',' ||
    public.csv_escape(bs.amount::TEXT),
    E'\n'
    ORDER BY bs.section, bs.account_code
  ) INTO v_result
  FROM public.get_balance_sheet(p_organization_id, v_date) bs;

  RETURN v_header || E'\n' || COALESCE(v_result, '');
END;
$$;

ALTER FUNCTION public.export_balance_sheet_csv(UUID, DATE) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.export_balance_sheet_csv(UUID, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.export_balance_sheet_csv(UUID, DATE) TO authenticated;
