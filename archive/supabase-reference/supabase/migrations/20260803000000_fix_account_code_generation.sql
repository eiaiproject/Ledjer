-- =============================================================================
-- FIX: Account Code Generation Bug
-- =============================================================================
-- Bug: create_cash_bank_account used get_next_counter which starts at 1,
-- producing v_min_code + 1 - 1 = v_min_code (e.g., 1110 for cash).
-- But 1110 is already occupied by the default Kas account created during
-- onboarding. This causes a unique constraint violation or duplicate code.
--
-- Fix: Replace counter-based approach with gap-finding using generate_series.
-- Use advisory lock scoped to (org_id, kind) for concurrency safety.
-- Find the first unused code in the allowed range.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_cash_bank_account(
  p_organization_id UUID,
  p_account_name TEXT,
  p_kind TEXT  -- 'cash', 'bank', 'qris', 'ewallet'
) RETURNS JSONB
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_role TEXT;
  v_min_code INTEGER;
  v_max_code INTEGER;
  v_report_group TEXT;
  v_code INTEGER;
  v_existing_id UUID;
  v_account_id UUID;
BEGIN
  -- Auth
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Autentikasi diperlukan';
  END IF;

  -- Membership + permission
  SELECT role::TEXT INTO v_role
  FROM public.organization_members
  WHERE organization_id = p_organization_id
    AND user_id = v_user_id
    AND status = 'active';

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'Anda bukan anggota organisasi ini';
  END IF;

  IF v_role != 'owner' AND NOT public.has_permission(p_organization_id, 'can_manage_accounts') THEN
    RAISE EXCEPTION 'Anda tidak memiliki izin untuk mengelola akun';
  END IF;

  -- Validate input
  IF p_account_name IS NULL OR btrim(p_account_name) = '' THEN
    RAISE EXCEPTION 'Nama akun wajib diisi';
  END IF;

  IF char_length(btrim(p_account_name)) > 60 THEN
    RAISE EXCEPTION 'Nama akun maksimal 60 karakter';
  END IF;

  IF p_kind NOT IN ('cash', 'bank', 'qris', 'ewallet') THEN
    RAISE EXCEPTION 'Jenis akun tidak valid. Pilih: cash, bank, qris, atau ewallet';
  END IF;

  -- Check for duplicate name (case-insensitive)
  SELECT id INTO v_existing_id
  FROM public.accounts
  WHERE organization_id = p_organization_id
    AND lower(name) = lower(btrim(p_account_name))
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RAISE EXCEPTION 'Nama akun sudah digunakan';
  END IF;

  -- Determine code range based on kind
  CASE p_kind
    WHEN 'cash' THEN
      v_min_code := 1111;  -- Skip 1110 (reserved for default Kas)
      v_max_code := 1119;
      v_report_group := 'Kas';
    WHEN 'bank' THEN
      v_min_code := 1121;  -- Skip 1120 (reserved for default Bank)
      v_max_code := 1129;
      v_report_group := 'Bank';
    WHEN 'qris', 'ewallet' THEN
      v_min_code := 1130;
      v_max_code := 1139;
      v_report_group := 'Bank';
    ELSE
      v_min_code := 1190;
      v_max_code := 1199;
      v_report_group := 'Kas';
  END CASE;

  -- Advisory lock: serialize account creation per (org, kind) to prevent races
  -- Lock is automatically released at end of transaction
  PERFORM pg_advisory_xact_lock(
    hashtext(p_organization_id::TEXT),
    hashtext('account_code:' || p_kind)
  );

  -- Find the first unused code in the range using generate_series
  SELECT gs.code INTO v_code
  FROM generate_series(v_min_code, v_max_code) AS gs(code)
  LEFT JOIN public.accounts a
    ON a.organization_id = p_organization_id AND a.code = gs.code
  WHERE a.id IS NULL
  ORDER BY gs.code
  LIMIT 1;

  IF v_code IS NULL THEN
    RAISE EXCEPTION 'Kode akun untuk jenis % sudah penuh. Hubungi admin.', p_kind;
  END IF;

  -- Insert the new account
  INSERT INTO public.accounts (
    organization_id, code, name, account_type, normal_balance,
    is_active, is_cash_account, is_locked, is_system, report_group
  ) VALUES (
    p_organization_id, v_code, btrim(p_account_name), 'asset', 'debit',
    true, true, false, false, v_report_group
  ) RETURNING id INTO v_account_id;

  INSERT INTO public.audit_logs (
    organization_id, actor_user_id, entity_type, entity_id, action, after_data
  ) VALUES (
    p_organization_id, v_user_id, 'account', v_account_id, 'create',
    jsonb_build_object('code', v_code, 'name', btrim(p_account_name), 'kind', p_kind)
  );

  RETURN jsonb_build_object(
    'id', v_account_id,
    'code', v_code,
    'name', btrim(p_account_name)
  );
END;
$$;

ALTER FUNCTION public.create_cash_bank_account(UUID, TEXT, TEXT) OWNER TO postgres;
REVOKE EXECUTE ON FUNCTION public.create_cash_bank_account(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_cash_bank_account(UUID, TEXT, TEXT) TO authenticated;
