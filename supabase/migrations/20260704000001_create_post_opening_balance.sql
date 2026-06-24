-- Create RPC for posting opening balance for additional accounts
-- This allows the frontend to post opening balances for accounts
-- other than the main cash account

CREATE OR REPLACE FUNCTION public.post_opening_balance(
  p_organization_id UUID,
  p_account_id UUID,
  p_amount NUMERIC,
  p_description TEXT,
  p_entry_date DATE
)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_saldo_awal_id UUID;
  v_journal_id UUID;
  v_txn_id UUID;
  v_entry_number TEXT;
  v_txn_number TEXT;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Check permission
  IF NOT public.has_permission(p_organization_id, 'can_create_transaction') THEN
    RAISE EXCEPTION 'You do not have permission to create transactions';
  END IF;

  -- Validate amount
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than 0';
  END IF;

  -- Find Saldo Awal account (code 3200)
  SELECT id INTO v_saldo_awal_id
  FROM accounts
  WHERE organization_id = p_organization_id
    AND code = 3200
  LIMIT 1;

  IF v_saldo_awal_id IS NULL THEN
    RAISE EXCEPTION 'Saldo Awal account not found';
  END IF;

  -- Generate entry number
  SELECT COUNT(*) + 1 INTO v_entry_number
  FROM journal_entries
  WHERE organization_id = p_organization_id;

  v_entry_number := 'JE-' || LPAD(v_entry_number::TEXT, 4, '0');

  -- Generate transaction number
  SELECT COUNT(*) + 1 INTO v_txn_number
  FROM transactions
  WHERE organization_id = p_organization_id;

  v_txn_number := 'TX-' || LPAD(v_txn_number::TEXT, 4, '0');

  -- Create journal entry
  INSERT INTO journal_entries (
    organization_id, entry_number, entry_date, entry_type,
    description, status, posted_at, posted_by
  ) VALUES (
    p_organization_id, v_entry_number, p_entry_date, 'opening_balance',
    p_description, 'posted', now(), v_user_id
  ) RETURNING id INTO v_journal_id;

  -- Create debit line (asset account)
  INSERT INTO journal_lines (
    organization_id, journal_entry_id, account_id,
    debit, credit, description, line_order
  ) VALUES (
    p_organization_id, v_journal_id, p_account_id,
    p_amount, 0, p_description, 1
  );

  -- Create credit line (Saldo Awal)
  INSERT INTO journal_lines (
    organization_id, journal_entry_id, account_id,
    debit, credit, description, line_order
  ) VALUES (
    p_organization_id, v_journal_id, v_saldo_awal_id,
    0, p_amount, p_description, 2
  );

  -- Create transaction record
  INSERT INTO transactions (
    organization_id, transaction_number, transaction_date,
    transaction_type, amount, cash_account_id,
    description, status, posted_at, posted_by, created_by
  ) VALUES (
    p_organization_id, v_txn_number, p_entry_date,
    'opening_cash_balance', p_amount, p_account_id,
    p_description, 'posted', now(), v_user_id, v_user_id
  ) RETURNING id INTO v_txn_id;

  -- Link journal entry to transaction
  UPDATE journal_entries
  SET transaction_id = v_txn_id
  WHERE id = v_journal_id;

  -- Create audit log
  INSERT INTO audit_logs (
    organization_id, actor_user_id, entity_type, entity_id,
    action, after_data
  ) VALUES (
    p_organization_id, v_user_id, 'transaction', v_txn_id,
    'create', jsonb_build_object(
      'transaction_type', 'opening_cash_balance',
      'amount', p_amount
    )
  );

  RETURN jsonb_build_object(
    'journal_entry_id', v_journal_id,
    'transaction_id', v_txn_id,
    'success', true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
