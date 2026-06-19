-- ============================================================
-- LEDJER MVP — Priority review fixes
-- Fixes accounting correctness, report filters, RLS exposure, and
-- explicit search_path for SECURITY DEFINER functions.
-- ============================================================

-- SECURITY DEFINER helpers with explicit search_path
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_org_member(org_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = org_id
      AND user_id = auth.uid()
      AND status = 'active'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.get_org_role(org_id UUID)
RETURNS TEXT AS $$
  SELECT role::TEXT FROM public.organization_members
  WHERE organization_id = org_id
    AND user_id = auth.uid()
    AND status = 'active'
  LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.has_permission(
  p_org_id UUID,
  p_permission TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  v_member public.organization_members%ROWTYPE;
BEGIN
  SELECT *
  INTO v_member
  FROM public.organization_members
  WHERE organization_id = p_org_id
    AND user_id = auth.uid()
    AND status = 'active'
  LIMIT 1;

  IF v_member.id IS NULL THEN
    RETURN false;
  END IF;

  IF v_member.role = 'owner' THEN
    RETURN true;
  END IF;

  RETURN CASE p_permission
    WHEN 'can_create_transaction' THEN v_member.can_create_transaction
    WHEN 'can_view_reports' THEN v_member.can_view_reports
    WHEN 'can_manage_accounts' THEN v_member.can_manage_accounts
    WHEN 'can_void_transaction' THEN v_member.can_void_transaction
    WHEN 'can_view_audit_log' THEN v_member.can_view_audit_log
    WHEN 'can_manage_products' THEN v_member.can_manage_products
    ELSE false
  END;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- Make already-defined SECURITY DEFINER functions resolve objects from the
-- intended schema only. Full function rewrites below also include this option.
ALTER FUNCTION public.create_organization_with_template(TEXT, public.business_type, DATE, TEXT, NUMERIC) SET search_path = public;
ALTER FUNCTION public.invite_staff(UUID, TEXT) SET search_path = public;
ALTER FUNCTION public.update_staff_permissions(UUID, UUID, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN) SET search_path = public;
ALTER FUNCTION public.remove_staff(UUID, UUID) SET search_path = public;
ALTER FUNCTION public.handle_new_user() SET search_path = public;

-- Profiles are referenced from team and transaction screens. The base policy
-- only exposes a user's own profile, so allow active organization members to
-- see the profile rows of other active members in the same organization.
DROP POLICY IF EXISTS "Org members can view co-member profiles" ON public.profiles;
CREATE POLICY "Org members can view co-member profiles"
  ON public.profiles FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.organization_members viewer
      JOIN public.organization_members subject
        ON subject.organization_id = viewer.organization_id
      WHERE viewer.user_id = auth.uid()
        AND viewer.status = 'active'
        AND subject.user_id = profiles.user_id
        AND subject.status = 'active'
    )
  );

-- Align account management RLS with the staff permission model.
DROP POLICY IF EXISTS "Owner can insert accounts" ON public.accounts;
DROP POLICY IF EXISTS "Owner can update accounts" ON public.accounts;
DROP POLICY IF EXISTS "Owner can delete accounts" ON public.accounts;
DROP POLICY IF EXISTS "Members with account permission can insert accounts" ON public.accounts;
DROP POLICY IF EXISTS "Members with account permission can update accounts" ON public.accounts;
DROP POLICY IF EXISTS "Members with account permission can delete accounts" ON public.accounts;

CREATE POLICY "Members with account permission can insert accounts"
  ON public.accounts FOR INSERT
  WITH CHECK (public.has_permission(organization_id, 'can_manage_accounts'));

CREATE POLICY "Members with account permission can update accounts"
  ON public.accounts FOR UPDATE
  USING (public.has_permission(organization_id, 'can_manage_accounts'))
  WITH CHECK (public.has_permission(organization_id, 'can_manage_accounts'));

CREATE POLICY "Members with account permission can delete accounts"
  ON public.accounts FOR DELETE
  USING (
    public.has_permission(organization_id, 'can_manage_accounts')
    AND NOT is_system
    AND NOT is_locked
  );

-- Protect exposed reporting view from bypassing underlying RLS policies.
ALTER VIEW public.general_ledger SET (security_invoker = true);

-- GENERAL LEDGER FUNCTION (with permission check)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_general_ledger(
  p_organization_id UUID,
  p_account_id UUID DEFAULT NULL,
  p_from_date DATE DEFAULT NULL,
  p_to_date DATE DEFAULT NULL
)
RETURNS TABLE(
  account_id UUID,
  account_code INTEGER,
  account_name TEXT,
  entry_date DATE,
  journal_entry_id UUID,
  entry_number TEXT,
  transaction_id UUID,
  transaction_number TEXT,
  description TEXT,
  party_name TEXT,
  debit NUMERIC,
  credit NUMERIC,
  running_balance NUMERIC
) AS $$
BEGIN
  IF NOT public.has_permission(p_organization_id, 'can_view_reports') THEN
    RAISE EXCEPTION 'You do not have permission to view reports';
  END IF;

  RETURN QUERY
  SELECT
    gl.account_id,
    gl.account_code,
    gl.account_name,
    gl.entry_date,
    gl.journal_entry_id,
    gl.entry_number,
    gl.transaction_id,
    gl.transaction_number,
    gl.description,
    gl.party_name,
    gl.debit,
    gl.credit,
    gl.running_balance
  FROM public.general_ledger gl
  WHERE gl.organization_id = p_organization_id
    AND (p_account_id IS NULL OR gl.account_id = p_account_id)
    AND (p_from_date IS NULL OR gl.entry_date >= p_from_date)
    AND (p_to_date IS NULL OR gl.entry_date <= p_to_date)
  ORDER BY gl.account_code, gl.entry_date, gl.journal_entry_id, gl.running_balance;
END;
$$ LANGUAGE plpgsql STABLE SET search_path = public;

-- TRIAL BALANCE FUNCTION
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_trial_balance(
  p_organization_id UUID,
  p_as_of_date DATE DEFAULT NULL
)
RETURNS TABLE(
  account_id UUID,
  account_code INTEGER,
  account_name TEXT,
  account_type TEXT,
  normal_balance TEXT,
  debit_total NUMERIC,
  credit_total NUMERIC,
  ending_debit NUMERIC,
  ending_credit NUMERIC
) AS $$
BEGIN
  IF NOT public.has_permission(p_organization_id, 'can_view_reports') THEN
    RAISE EXCEPTION 'You do not have permission to view reports';
  END IF;

  RETURN QUERY
  WITH filtered_lines AS (
    SELECT jl.account_id, jl.debit, jl.credit
    FROM public.journal_lines jl
    JOIN public.journal_entries je ON je.id = jl.journal_entry_id
    WHERE jl.organization_id = p_organization_id
      AND je.status = 'posted'
      AND (p_as_of_date IS NULL OR je.entry_date <= p_as_of_date)
  ),
  account_activity AS (
    SELECT
      a.id AS account_id,
      a.code AS account_code,
      a.name AS account_name,
      a.account_type::TEXT AS account_type,
      a.normal_balance::TEXT AS normal_balance,
      COALESCE(SUM(fl.debit), 0) AS debit_total,
      COALESCE(SUM(fl.credit), 0) AS credit_total,
      CASE
        WHEN a.normal_balance = 'debit' THEN COALESCE(SUM(fl.debit - fl.credit), 0)
        ELSE COALESCE(SUM(fl.credit - fl.debit), 0)
      END AS normal_amount
    FROM public.accounts a
    LEFT JOIN filtered_lines fl ON fl.account_id = a.id
    WHERE a.organization_id = p_organization_id
      AND a.is_active = true
    GROUP BY a.id, a.code, a.name, a.account_type, a.normal_balance
  )
  SELECT
    aa.account_id,
    aa.account_code,
    aa.account_name,
    aa.account_type,
    aa.normal_balance,
    aa.debit_total,
    aa.credit_total,
    CASE
      WHEN aa.normal_balance = 'debit' AND aa.normal_amount >= 0 THEN aa.normal_amount
      WHEN aa.normal_balance = 'credit' AND aa.normal_amount < 0 THEN ABS(aa.normal_amount)
      ELSE 0
    END AS ending_debit,
    CASE
      WHEN aa.normal_balance = 'credit' AND aa.normal_amount >= 0 THEN aa.normal_amount
      WHEN aa.normal_balance = 'debit' AND aa.normal_amount < 0 THEN ABS(aa.normal_amount)
      ELSE 0
    END AS ending_credit
  FROM account_activity aa
  WHERE aa.debit_total != 0 OR aa.credit_total != 0
  ORDER BY aa.account_code;
END;
$$ LANGUAGE plpgsql STABLE SET search_path = public;

-- PROFIT AND LOSS FUNCTION
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_profit_loss(
  p_organization_id UUID,
  p_from_date DATE,
  p_to_date DATE
)
RETURNS TABLE(
  section TEXT,
  account_code INTEGER,
  account_name TEXT,
  amount NUMERIC
) AS $$
BEGIN
  IF NOT public.has_permission(p_organization_id, 'can_view_reports') THEN
    RAISE EXCEPTION 'You do not have permission to view reports';
  END IF;

  RETURN QUERY
  WITH filtered_lines AS (
    SELECT jl.account_id, jl.debit, jl.credit
    FROM public.journal_lines jl
    JOIN public.journal_entries je ON je.id = jl.journal_entry_id
    WHERE jl.organization_id = p_organization_id
      AND je.status = 'posted'
      AND je.entry_type != 'opening_balance'
      AND je.entry_date BETWEEN p_from_date AND p_to_date
  )
  SELECT
    'revenue' AS section,
    a.code AS account_code,
    a.name AS account_name,
    COALESCE(SUM(fl.credit - fl.debit), 0) AS amount
  FROM public.accounts a
  LEFT JOIN filtered_lines fl ON fl.account_id = a.id
  WHERE a.organization_id = p_organization_id
    AND a.account_type = 'revenue'
    AND a.is_active = true
  GROUP BY a.id, a.code, a.name

  UNION ALL

  SELECT
    'cogs' AS section,
    a.code AS account_code,
    a.name AS account_name,
    COALESCE(SUM(fl.debit - fl.credit), 0) AS amount
  FROM public.accounts a
  LEFT JOIN filtered_lines fl ON fl.account_id = a.id
  WHERE a.organization_id = p_organization_id
    AND a.account_type = 'cogs'
    AND a.is_active = true
  GROUP BY a.id, a.code, a.name

  UNION ALL

  SELECT
    'expense' AS section,
    a.code AS account_code,
    a.name AS account_name,
    COALESCE(SUM(fl.debit - fl.credit), 0) AS amount
  FROM public.accounts a
  LEFT JOIN filtered_lines fl ON fl.account_id = a.id
  WHERE a.organization_id = p_organization_id
    AND a.account_type = 'expense'
    AND a.is_active = true
  GROUP BY a.id, a.code, a.name

  UNION ALL

  SELECT
    'other_income' AS section,
    a.code AS account_code,
    a.name AS account_name,
    COALESCE(SUM(fl.credit - fl.debit), 0) AS amount
  FROM public.accounts a
  LEFT JOIN filtered_lines fl ON fl.account_id = a.id
  WHERE a.organization_id = p_organization_id
    AND a.account_type = 'other_income'
    AND a.is_active = true
  GROUP BY a.id, a.code, a.name

  UNION ALL

  SELECT
    'other_expense' AS section,
    a.code AS account_code,
    a.name AS account_name,
    COALESCE(SUM(fl.debit - fl.credit), 0) AS amount
  FROM public.accounts a
  LEFT JOIN filtered_lines fl ON fl.account_id = a.id
  WHERE a.organization_id = p_organization_id
    AND a.account_type = 'other_expense'
    AND a.is_active = true
  GROUP BY a.id, a.code, a.name

  ORDER BY section, account_code;
END;
$$ LANGUAGE plpgsql STABLE SET search_path = public;

-- BALANCE SHEET FUNCTION
-- ------------------------------------------------------------
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
DECLARE
  v_net_income NUMERIC;
BEGIN
  IF NOT public.has_permission(p_organization_id, 'can_view_reports') THEN
    RAISE EXCEPTION 'You do not have permission to view reports';
  END IF;

  SELECT COALESCE(
    SUM(CASE WHEN a.account_type = 'revenue' THEN jl.credit - jl.debit ELSE 0 END) -
    SUM(CASE WHEN a.account_type = 'cogs' THEN jl.debit - jl.credit ELSE 0 END) -
    SUM(CASE WHEN a.account_type = 'expense' THEN jl.debit - jl.credit ELSE 0 END) +
    SUM(CASE WHEN a.account_type = 'other_income' THEN jl.credit - jl.debit ELSE 0 END) -
    SUM(CASE WHEN a.account_type = 'other_expense' THEN jl.debit - jl.credit ELSE 0 END),
    0
  ) INTO v_net_income
  FROM public.journal_lines jl
  JOIN public.accounts a ON a.id = jl.account_id
  JOIN public.journal_entries je ON je.id = jl.journal_entry_id
  WHERE jl.organization_id = p_organization_id
    AND je.status = 'posted'
    AND je.entry_type != 'opening_balance'
    AND je.entry_date <= p_as_of_date;

  RETURN QUERY
  WITH filtered_lines AS (
    SELECT jl.account_id, jl.debit, jl.credit
    FROM public.journal_lines jl
    JOIN public.journal_entries je ON je.id = jl.journal_entry_id
    WHERE jl.organization_id = p_organization_id
      AND je.status = 'posted'
      AND je.entry_date <= p_as_of_date
  )
  SELECT
    'asset' AS section,
    a.code AS account_code,
    a.name AS account_name,
    COALESCE(SUM(fl.debit - fl.credit), 0) AS amount
  FROM public.accounts a
  LEFT JOIN filtered_lines fl ON fl.account_id = a.id
  WHERE a.organization_id = p_organization_id
    AND a.account_type = 'asset'
    AND a.is_active = true
  GROUP BY a.id, a.code, a.name

  UNION ALL

  SELECT
    'liability' AS section,
    a.code AS account_code,
    a.name AS account_name,
    COALESCE(SUM(fl.credit - fl.debit), 0) AS amount
  FROM public.accounts a
  LEFT JOIN filtered_lines fl ON fl.account_id = a.id
  WHERE a.organization_id = p_organization_id
    AND a.account_type = 'liability'
    AND a.is_active = true
  GROUP BY a.id, a.code, a.name

  UNION ALL

  SELECT
    'equity' AS section,
    a.code AS account_code,
    a.name AS account_name,
    COALESCE(SUM(fl.credit - fl.debit), 0) AS amount
  FROM public.accounts a
  LEFT JOIN filtered_lines fl ON fl.account_id = a.id
  WHERE a.organization_id = p_organization_id
    AND a.account_type = 'equity'
    AND a.is_active = true
    AND a.code NOT IN (3400, 3500)
  GROUP BY a.id, a.code, a.name

  UNION ALL

  SELECT
    'equity' AS section,
    3500 AS account_code,
    'Laba Tahun Berjalan' AS account_name,
    v_net_income AS amount

  ORDER BY section, account_code;
END;
$$ LANGUAGE plpgsql STABLE SET search_path = public;

-- Accounting engine: void keeps original journal posted and adds a posted
-- reversal journal so reports net the transaction to zero.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.void_transaction(
  p_organization_id UUID,
  p_transaction_id UUID,
  p_void_reason TEXT,
  p_void_date DATE DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_role TEXT;
  v_txn RECORD;
  v_orig_je RECORD;
  v_reversal_je_id UUID;
  v_reversal_txn_id UUID;
  v_line RECORD;
  v_line_order INTEGER := 0;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT role::TEXT INTO v_role
  FROM public.organization_members
  WHERE organization_id = p_organization_id
    AND user_id = v_user_id
    AND status = 'active';

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'You are not a member of this organization';
  END IF;

  IF v_role != 'owner' THEN
    IF NOT public.has_permission(p_organization_id, 'can_void_transaction') THEN
      RAISE EXCEPTION 'You do not have permission to void transactions';
    END IF;
  END IF;

  IF NULLIF(TRIM(p_void_reason), '') IS NULL THEN
    RAISE EXCEPTION 'Void reason is required';
  END IF;

  SELECT * INTO v_txn
  FROM public.transactions
  WHERE id = p_transaction_id
    AND organization_id = p_organization_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transaction not found';
  END IF;

  IF v_txn.status != 'posted' THEN
    RAISE EXCEPTION 'Only posted transactions can be voided';
  END IF;

  SELECT je.* INTO v_orig_je
  FROM public.journal_entries je
  WHERE je.transaction_id = p_transaction_id
    AND je.organization_id = p_organization_id
    AND je.status = 'posted'
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No posted journal entry found for this transaction';
  END IF;

  INSERT INTO public.journal_entries (
    organization_id, entry_number, entry_date, entry_type,
    transaction_id, description, status,
    reversed_entry_id, reversal_reason,
    posted_at, posted_by
  ) VALUES (
    p_organization_id,
    public.generate_entry_number(p_organization_id),
    COALESCE(p_void_date, CURRENT_DATE),
    'reversal',
    p_transaction_id,
    'Pembatalan: ' || v_txn.description,
    'posted',
    v_orig_je.id,
    p_void_reason,
    now(),
    v_user_id
  ) RETURNING id INTO v_reversal_je_id;

  FOR v_line IN
    SELECT * FROM public.journal_lines
    WHERE journal_entry_id = v_orig_je.id
    ORDER BY line_order
  LOOP
    v_line_order := v_line_order + 1;
    INSERT INTO public.journal_lines (
      organization_id, journal_entry_id, account_id, party_id,
      debit, credit, description, line_order
    ) VALUES (
      p_organization_id, v_reversal_je_id, v_line.account_id, v_line.party_id,
      v_line.credit, v_line.debit,
      'Reversal: ' || v_line.description, v_line_order
    );
  END LOOP;

  IF (
    SELECT ABS(SUM(debit) - SUM(credit))
    FROM public.journal_lines
    WHERE journal_entry_id = v_reversal_je_id
  ) > 0.01 THEN
    RAISE EXCEPTION 'Reversal journal is not balanced';
  END IF;

  INSERT INTO public.transactions (
    organization_id, transaction_number, transaction_date,
    transaction_type, amount, party_id, category_name,
    cash_account_id, destination_cash_account_id,
    payment_status, due_date, description, notes,
    status, posted_at, posted_by, created_by,
    original_transaction_id
  ) VALUES (
    p_organization_id,
    public.generate_transaction_number(p_organization_id),
    COALESCE(p_void_date, CURRENT_DATE),
    v_txn.transaction_type,
    v_txn.amount,
    v_txn.party_id,
    v_txn.category_name,
    v_txn.cash_account_id,
    v_txn.destination_cash_account_id,
    v_txn.payment_status,
    v_txn.due_date,
    'Pembatalan: ' || v_txn.description,
    p_void_reason,
    'posted',
    now(),
    v_user_id,
    v_user_id,
    p_transaction_id
  ) RETURNING id INTO v_reversal_txn_id;

  UPDATE public.journal_entries
  SET transaction_id = v_reversal_txn_id
  WHERE id = v_reversal_je_id;

  UPDATE public.transactions
  SET status = 'voided',
      voided_at = now(),
      voided_by = v_user_id,
      void_reason = p_void_reason,
      reversal_transaction_id = v_reversal_txn_id
  WHERE id = p_transaction_id;

  INSERT INTO public.audit_logs (
    organization_id, actor_user_id, entity_type, entity_id,
    action, before_data, reason
  ) VALUES (
    p_organization_id, v_user_id, 'transaction', p_transaction_id,
    'void',
    jsonb_build_object(
      'transaction_number', v_txn.transaction_number,
      'amount', v_txn.amount,
      'transaction_type', v_txn.transaction_type
    ),
    p_void_reason
  );

  RETURN jsonb_build_object(
    'original_transaction_id', p_transaction_id,
    'reversal_transaction_id', v_reversal_txn_id,
    'reversal_journal_entry_id', v_reversal_je_id,
    'status', 'voided'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

ALTER FUNCTION public.post_transaction(UUID, DATE, TEXT, NUMERIC, UUID, TEXT, UUID, UUID, TEXT, NUMERIC, DATE, TEXT, TEXT, UUID, NUMERIC, NUMERIC) SET search_path = public;

-- Same-organization integrity constraints for cross-table references.
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'accounts_organization_id_id_key') THEN
    ALTER TABLE public.accounts ADD CONSTRAINT accounts_organization_id_id_key UNIQUE (organization_id, id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'parties_organization_id_id_key') THEN
    ALTER TABLE public.parties ADD CONSTRAINT parties_organization_id_id_key UNIQUE (organization_id, id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transactions_organization_id_id_key') THEN
    ALTER TABLE public.transactions ADD CONSTRAINT transactions_organization_id_id_key UNIQUE (organization_id, id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'journal_entries_organization_id_id_key') THEN
    ALTER TABLE public.journal_entries ADD CONSTRAINT journal_entries_organization_id_id_key UNIQUE (organization_id, id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'account_mappings_debit_account_same_org_fkey') THEN
    ALTER TABLE public.account_mappings
      ADD CONSTRAINT account_mappings_debit_account_same_org_fkey
      FOREIGN KEY (organization_id, debit_account_id)
      REFERENCES public.accounts (organization_id, id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'account_mappings_credit_account_same_org_fkey') THEN
    ALTER TABLE public.account_mappings
      ADD CONSTRAINT account_mappings_credit_account_same_org_fkey
      FOREIGN KEY (organization_id, credit_account_id)
      REFERENCES public.accounts (organization_id, id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transactions_party_same_org_fkey') THEN
    ALTER TABLE public.transactions
      ADD CONSTRAINT transactions_party_same_org_fkey
      FOREIGN KEY (organization_id, party_id)
      REFERENCES public.parties (organization_id, id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transactions_cash_account_same_org_fkey') THEN
    ALTER TABLE public.transactions
      ADD CONSTRAINT transactions_cash_account_same_org_fkey
      FOREIGN KEY (organization_id, cash_account_id)
      REFERENCES public.accounts (organization_id, id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transactions_destination_cash_account_same_org_fkey') THEN
    ALTER TABLE public.transactions
      ADD CONSTRAINT transactions_destination_cash_account_same_org_fkey
      FOREIGN KEY (organization_id, destination_cash_account_id)
      REFERENCES public.accounts (organization_id, id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'journal_entries_transaction_same_org_fkey') THEN
    ALTER TABLE public.journal_entries
      ADD CONSTRAINT journal_entries_transaction_same_org_fkey
      FOREIGN KEY (organization_id, transaction_id)
      REFERENCES public.transactions (organization_id, id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'journal_lines_entry_same_org_fkey') THEN
    ALTER TABLE public.journal_lines
      ADD CONSTRAINT journal_lines_entry_same_org_fkey
      FOREIGN KEY (organization_id, journal_entry_id)
      REFERENCES public.journal_entries (organization_id, id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'journal_lines_account_same_org_fkey') THEN
    ALTER TABLE public.journal_lines
      ADD CONSTRAINT journal_lines_account_same_org_fkey
      FOREIGN KEY (organization_id, account_id)
      REFERENCES public.accounts (organization_id, id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'journal_lines_party_same_org_fkey') THEN
    ALTER TABLE public.journal_lines
      ADD CONSTRAINT journal_lines_party_same_org_fkey
      FOREIGN KEY (organization_id, party_id)
      REFERENCES public.parties (organization_id, id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'attachments_transaction_same_org_fkey') THEN
    ALTER TABLE public.attachments
      ADD CONSTRAINT attachments_transaction_same_org_fkey
      FOREIGN KEY (organization_id, transaction_id)
      REFERENCES public.transactions (organization_id, id);
  END IF;
END $$;
