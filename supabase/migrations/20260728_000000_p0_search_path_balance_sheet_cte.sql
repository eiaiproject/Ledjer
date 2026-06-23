-- =============================================================================
-- LEDJER — P0/P1 Hardening Patch
-- =============================================================================
-- Targets:
--   P0.A. Add explicit SET search_path = public to rename_account().
--         (Originally created without SET search_path; safer with it.)
--   P1.A. Rewrite get_balance_sheet() using CTEs (no TEMP TABLE) so it is
--         safe under pgbouncer transaction-pooling mode and matches the
--         trial-balance / profit-loss CTE style.
--   P1.B. Add a unique partial index on parties(organization_id,
--         lower(trim(name))) WHERE is_active to discourage duplicate-party
--         creation from the transaction form.
--   P1.C. Add an explicit row-level security policy forbidding client-role
--         DELETE on parties; ensure only OWNER can soft-disable via update.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- P0.A: rename_account search_path
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rename_account(
  p_account_id UUID,
  p_new_name TEXT
)
RETURNS JSON AS $$
DECLARE
  v_account RECORD;
  v_org_id UUID;
  v_trimmed_name TEXT;
  v_existing_id UUID;
BEGIN
  v_trimmed_name := TRIM(p_new_name);

  IF v_trimmed_name = '' THEN
    RAISE EXCEPTION 'Nama akun wajib diisi';
  END IF;

  IF LENGTH(v_trimmed_name) > 60 THEN
    RAISE EXCEPTION 'Nama akun maksimal 60 karakter';
  END IF;

  SELECT id, organization_id, name, is_system, is_locked, code
  INTO v_account
  FROM public.accounts
  WHERE id = p_account_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Akun tidak ditemukan';
  END IF;

  v_org_id := v_account.organization_id;

  IF NOT public.has_permission(v_org_id, 'can_manage_accounts') THEN
    RAISE EXCEPTION 'Tidak memiliki izin untuk mengelola akun';
  END IF;

  IF v_account.is_locked = true THEN
    RAISE EXCEPTION 'Akun ini terkunci dan tidak dapat diubah';
  END IF;

  SELECT id INTO v_existing_id
  FROM public.accounts
  WHERE organization_id = v_org_id
    AND LOWER(name) = LOWER(v_trimmed_name)
    AND id != p_account_id
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'Nama akun sudah digunakan';
  END IF;

  UPDATE public.accounts
  SET name = v_trimmed_name,
      updated_at = NOW()
  WHERE id = p_account_id
  RETURNING id, name, code INTO v_account;

  RETURN json_build_object(
    'id', v_account.id,
    'name', v_account.name,
    'code', v_account.code
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.rename_account(UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION public.rename_account(UUID, TEXT) IS
  'Rename account display name. SET search_path = public to harden SECURITY DEFINER.';

-- ---------------------------------------------------------------------------
-- P1.A: get_balance_sheet — rewrite using CTEs (no TEMP TABLE)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_balance_sheet(
  p_organization_id UUID,
  p_as_of_date DATE
)
RETURNS TABLE(
  section TEXT,
  account_code INTEGER,
  account_name TEXT,
  amount NUMERIC
) AS $$
BEGIN
  IF NOT public.is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'Anda bukan anggota organisasi ini';
  END IF;

  IF NOT public.has_permission(p_organization_id, 'can_view_reports') THEN
    RAISE EXCEPTION 'Anda tidak memiliki izin untuk melihat laporan neraca';
  END IF;

  RETURN QUERY
  WITH posted_lines AS (
    SELECT
      jl.account_id,
      jl.debit,
      jl.credit
    FROM public.journal_lines jl
    JOIN public.journal_entries je
      ON je.id = jl.journal_entry_id
     AND je.organization_id = jl.organization_id
    WHERE jl.organization_id = p_organization_id
      AND je.status = 'posted'
      AND je.entry_date <= p_as_of_date
  ),
  account_balances AS (
    SELECT
      a.id,
      a.code,
      a.name,
      a.account_type,
      COALESCE(SUM(pl.debit - pl.credit), 0) AS balance
    FROM public.accounts a
    LEFT JOIN posted_lines pl ON pl.account_id = a.id
    WHERE a.organization_id = p_organization_id
      AND a.is_active = true
    GROUP BY a.id, a.code, a.name, a.account_type
  ),
  net_income AS (
    -- Sign convention (see 20260724_000000_fix_balance_sheet_net_income_signs.sql):
    -- revenue / other_income are credit-normal (negative raw balance) → negate → positive
    -- cogs / expense / other_expense are debit-normal (positive raw balance) → negate → negative (subtracted)
    SELECT -COALESCE(SUM(balance), 0) AS net
    FROM account_balances
    WHERE account_type IN ('revenue', 'cogs', 'expense', 'other_income', 'other_expense')
  )
  SELECT
    'asset'::TEXT      AS section,
    ab.code::INTEGER   AS account_code,
    ab.name::TEXT      AS account_name,
    ab.balance::NUMERIC AS amount
  FROM account_balances ab
  WHERE ab.account_type = 'asset' AND ab.balance != 0

  UNION ALL

  SELECT
    'liability'::TEXT,
    ab.code::INTEGER,
    ab.name::TEXT,
    (-ab.balance)::NUMERIC
  FROM account_balances ab
  WHERE ab.account_type = 'liability' AND ab.balance != 0

  UNION ALL

  SELECT
    'equity'::TEXT,
    ab.code::INTEGER,
    ab.name::TEXT,
    (-ab.balance)::NUMERIC
  FROM account_balances ab
  WHERE ab.account_type = 'equity'
    AND ab.code != 3500
    AND ab.balance != 0

  UNION ALL

  SELECT
    'equity'::TEXT,
    3500::INTEGER,
    'Laba Tahun Berjalan'::TEXT,
    ni.net::NUMERIC
  FROM net_income ni
  WHERE ni.net != 0

  ORDER BY section, account_code;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.get_balance_sheet(UUID, DATE) TO authenticated;

COMMENT ON FUNCTION public.get_balance_sheet(UUID, DATE) IS
  'Balance sheet: rewritten with CTEs (no temp table) so it works under pgbouncer transaction pooling.';

-- ---------------------------------------------------------------------------
-- P1.B: Unique partial index on active parties to discourage duplicates.
-- Soft-deleted (is_active = false) parties are intentionally excluded so that
-- re-adding a previously-removed party with the same name remains possible.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS idx_parties_org_name_unique
  ON public.parties (organization_id, lower(trim(name)))
  WHERE is_active = true;

-- ---------------------------------------------------------------------------
-- P1.C: Explicit no-DELETE policy on parties for non-owner roles.
-- Soft-disable via UPDATE is already owner-restricted; this is a belt-and-
-- suspenders guard so the explicit DELETE policy is symmetric.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'parties'
      AND policyname = 'Owner can delete parties'
  ) THEN
    CREATE POLICY "Owner can delete parties"
      ON public.parties FOR DELETE
      USING (
        is_org_member(organization_id)
        AND get_org_role(organization_id) = 'owner'
      );
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
