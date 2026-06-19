-- ============================================================
-- LEDJER MVP — Organization Creation RPC
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_organization_with_template(
  p_organization_name TEXT,
  p_business_type business_type,
  p_books_start_date DATE,
  p_default_cash_account_name TEXT DEFAULT 'Kas',
  p_opening_cash_balance NUMERIC DEFAULT 0
)
RETURNS JSONB AS $$
DECLARE
  v_org_id UUID;
  v_user_id UUID;
  v_accounts_created INTEGER;
  v_cash_account_id UUID;
  v_saldo_awal_id UUID;
  v_journal_id UUID;
  v_line_id UUID;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Create organization
  INSERT INTO organizations (
    name, business_type, base_currency, books_start_date,
    onboarding_status, created_by
  ) VALUES (
    p_organization_name,
    p_business_type,
    'IDR',
    p_books_start_date,
    'completed',
    v_user_id
  ) RETURNING id INTO v_org_id;

  -- Create owner membership
  INSERT INTO organization_members (
    organization_id, user_id, role, status,
    can_create_transaction, can_view_reports, can_manage_accounts,
    can_void_transaction, can_view_audit_log,
    invited_by, joined_at
  ) VALUES (
    v_org_id, v_user_id, 'owner', 'active',
    true, true, true, true, true,
    v_user_id, now()
  );

  -- Create default chart of accounts
  v_accounts_created := public.create_default_accounts(v_org_id, p_organization_name);

  -- Find the selected cash/bank account
  SELECT id INTO v_cash_account_id
  FROM accounts
  WHERE organization_id = v_org_id
    AND name = p_default_cash_account_name
    AND account_type = 'asset'
  LIMIT 1;

  -- If not found, default to Kas
  IF v_cash_account_id IS NULL THEN
    SELECT id INTO v_cash_account_id
    FROM accounts
    WHERE organization_id = v_org_id
      AND code = 1110
    LIMIT 1;
  END IF;

  -- Find Saldo Awal account
  SELECT id INTO v_saldo_awal_id
  FROM accounts
  WHERE organization_id = v_org_id
    AND code = 3200
  LIMIT 1;

  -- Post opening cash balance if > 0
  IF p_opening_cash_balance > 0 AND v_cash_account_id IS NOT NULL AND v_saldo_awal_id IS NOT NULL THEN
    -- Create journal entry
    INSERT INTO journal_entries (
      organization_id, entry_number, entry_date, entry_type,
      description, status, posted_at, posted_by
    ) VALUES (
      v_org_id,
      public.generate_entry_number(v_org_id),
      p_books_start_date,
      'opening_balance',
      'Saldo awal ' || p_default_cash_account_name,
      'posted',
      now(),
      v_user_id
    ) RETURNING id INTO v_journal_id;

    -- Create debit line (cash/bank)
    INSERT INTO journal_lines (
      organization_id, journal_entry_id, account_id,
      debit, credit, description, line_order
    ) VALUES (
      v_org_id, v_journal_id, v_cash_account_id,
      p_opening_cash_balance, 0,
      'Saldo awal ' || p_default_cash_account_name, 1
    );

    -- Create credit line (Saldo Awal)
    INSERT INTO journal_lines (
      organization_id, journal_entry_id, account_id,
      debit, credit, description, line_order
    ) VALUES (
      v_org_id, v_journal_id, v_saldo_awal_id,
      0, p_opening_cash_balance,
      'Saldo awal ' || p_default_cash_account_name, 2
    );

    -- Create transaction record
    INSERT INTO transactions (
      organization_id, transaction_number, transaction_date,
      transaction_type, amount, cash_account_id,
      description, status, posted_at, posted_by, created_by
    ) VALUES (
      v_org_id,
      public.generate_transaction_number(v_org_id),
      p_books_start_date,
      'opening_cash_balance',
      p_opening_cash_balance,
      v_cash_account_id,
      'Saldo awal ' || p_default_cash_account_name,
      'posted',
      now(),
      v_user_id,
      v_user_id
    ) RETURNING id INTO v_line_id;

    -- Link journal entry to transaction
    UPDATE journal_entries
    SET transaction_id = v_line_id
    WHERE id = v_journal_id;

    -- Note: journal entry linked via UPDATE journal_entries SET transaction_id above

    -- Create audit log
    INSERT INTO audit_logs (
      organization_id, actor_user_id, entity_type, entity_id,
      action, after_data
    ) VALUES (
      v_org_id, v_user_id, 'transaction', v_line_id,
      'create', jsonb_build_object(
        'transaction_type', 'opening_cash_balance',
        'amount', p_opening_cash_balance
      )
    );
  END IF;

  -- Create profile if not exists
  INSERT INTO profiles (user_id, full_name, email)
  VALUES (
    v_user_id,
    COALESCE(
      (SELECT raw_user_meta_data->>'full_name' FROM auth.users WHERE id = v_user_id),
      ''
    ),
    COALESCE(
      (SELECT email FROM auth.users WHERE id = v_user_id),
      ''
    )
  )
  ON CONFLICT (user_id) DO NOTHING;

  -- Return result
  RETURN jsonb_build_object(
    'organization_id', v_org_id,
    'onboarding_status', 'completed',
    'accounts_created', v_accounts_created,
    'cash_account_id', v_cash_account_id,
    'opening_balance_posted', (p_opening_cash_balance > 0)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
