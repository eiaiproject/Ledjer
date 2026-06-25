-- =============================================================================
-- LEDJER — Master Fix Regression Tests (P1-1, P1-2a, P1-3)
-- =============================================================================
-- Run AFTER all migrations are applied.
-- Uses _test_assert for strict pass/fail.
-- =============================================================================

\i supabase/tests/_test_helpers.sql

-- ═══════════════════════════════════════════════════════════════════
-- M-1: login_attempts direct INSERT rejected (P1-1)
-- Verified via privilege check (superuser bypasses RLS, so actual INSERT test
-- is unreliable in this harness). CI runs as anon/authenticated where REVOKE
-- and missing INSERT policy block the operation.
-- ═══════════════════════════════════════════════════════════════════
DO $$
BEGIN
  PERFORM public._test_assert(
    'M-1a: anon has no INSERT on login_attempts',
    NOT has_table_privilege('anon', 'public.login_attempts', 'INSERT'),
    'anon should not be able to INSERT into login_attempts'
  );

  PERFORM public._test_assert(
    'M-1b: authenticated has no INSERT on login_attempts',
    NOT has_table_privilege('authenticated', 'public.login_attempts', 'INSERT'),
    'authenticated should not be able to INSERT into login_attempts'
  );

  PERFORM public._test_assert(
    'M-1c: no INSERT policy exists on login_attempts',
    NOT EXISTS (
      SELECT 1 FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      WHERE c.relname = 'login_attempts' AND p.polcmd IN ('a', '*')
    ),
    'INSERT policy should have been dropped'
  );
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- M-2: Zero-cost product sale blocked (P1-2a)
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_owner UUID;
  v_oid UUID;
  v_cash_id UUID;
  v_product_id UUID;
  v_error TEXT;
BEGIN
  SELECT out_owner_user_id, out_organization_id, out_cash_account_id
  INTO v_owner, v_oid, v_cash_id
  FROM public._test_create_org_with_users('M2_org', CURRENT_DATE);

  PERFORM public._test_impersonate(v_owner);

  -- Create a product with zero purchase_price
  INSERT INTO public.products (organization_id, name, code, unit, purchase_price, selling_price, current_stock, is_active)
  VALUES (v_oid, 'M2 Zero Cost Item', 'M2-ZC', 'pcs', 0, 10000, 10, true)
  RETURNING id INTO v_product_id;

  -- Record opening stock at zero cost
  PERFORM public.record_stock_movement(
    v_oid, v_product_id, CURRENT_DATE,
    'opening_balance', 10, 0,
    NULL, 'M2 opening stock'
  );

  -- Attempt to sell — should be blocked because purchase_price = 0
  BEGIN
    PERFORM public.post_transaction(
      v_oid, CURRENT_DATE, 'cash_sale', 100000,
      NULL, NULL, v_cash_id, NULL, 'paid', NULL, NULL,
      'M2 zero cost sale attempt', NULL, v_product_id, 10, 10000
    );
    PERFORM public._test_fail('M-2', 'Zero-cost sale should have been blocked');
  EXCEPTION WHEN OTHERS THEN
    v_error := SQLERRM;
    PERFORM public._test_assert(
      'M-2: zero-cost product sale blocked',
      v_error ILIKE '%harga pokok%' OR v_error ILIKE '%purchase_price%' OR v_error ILIKE '%belum diatur%',
      'Unexpected: ' || v_error
    );
  END;
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- M-3: post_transaction idempotency via client_token (P1-3)
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_owner UUID;
  v_oid UUID;
  v_cash_id UUID;
  v_token UUID;
  v_result1 JSONB;
  v_result2 JSONB;
  v_txn_count INTEGER;
BEGIN
  SELECT out_owner_user_id, out_organization_id, out_cash_account_id
  INTO v_owner, v_oid, v_cash_id
  FROM public._test_create_org_with_users('M3_org', CURRENT_DATE);

  PERFORM public._test_impersonate(v_owner);

  v_token := gen_random_uuid();

  -- First call with client_token
  v_result1 := public.post_transaction(
    v_oid, CURRENT_DATE, 'owner_capital', 500000,
    NULL, NULL, v_cash_id, NULL, 'paid', NULL, NULL,
    'M3 idempotent test', NULL, NULL, NULL, NULL, NULL, v_token
  );

  PERFORM public._test_assert(
    'M-3a: first call returns transaction_id',
    (v_result1 ->> 'transaction_id') IS NOT NULL,
    'Result: ' || v_result1::TEXT
  );

  -- Second call with same client_token — should return existing, not create new
  v_result2 := public.post_transaction(
    v_oid, CURRENT_DATE, 'owner_capital', 500000,
    NULL, NULL, v_cash_id, NULL, 'paid', NULL, NULL,
    'M3 idempotent test', NULL, NULL, NULL, NULL, NULL, v_token
  );

  PERFORM public._test_assert(
    'M-3b: idempotent call returns same transaction_id',
    (v_result1 ->> 'transaction_id') = (v_result2 ->> 'transaction_id'),
    'First: ' || (v_result1 ->> 'transaction_id') || ', Second: ' || (v_result2 ->> 'transaction_id')
  );

  -- Only one transaction should exist
  SELECT COUNT(*)::INTEGER INTO v_txn_count
  FROM public.transactions
  WHERE organization_id = v_oid AND client_token = v_token;

  PERFORM public._test_assert(
    'M-3c: exactly one transaction for duplicate token',
    v_txn_count = 1,
    'Count: ' || v_txn_count::TEXT
  );
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- M-4: void_transaction idempotency via client_token (P1-3)
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_owner UUID;
  v_oid UUID;
  v_cash_id UUID;
  v_txn_id UUID;
  v_token UUID;
  v_result1 JSONB;
  v_result2 JSONB;
  v_reversal_count INTEGER;
BEGIN
  SELECT out_owner_user_id, out_organization_id, out_cash_account_id
  INTO v_owner, v_oid, v_cash_id
  FROM public._test_create_org_with_users('M4_org', CURRENT_DATE);

  PERFORM public._test_impersonate(v_owner);

  -- Post a transaction to void
  SELECT (public.post_transaction(
    v_oid, CURRENT_DATE, 'owner_capital', 200000,
    NULL, NULL, v_cash_id, NULL, 'paid', NULL, NULL,
    'M4 to be voided', NULL, NULL, NULL, NULL
  ) ->> 'transaction_id')::UUID INTO v_txn_id;

  v_token := gen_random_uuid();

  -- First void call
  v_result1 := public.void_transaction(v_oid, v_txn_id, 'M4 void test', CURRENT_DATE, v_token);

  PERFORM public._test_assert(
    'M-4a: first void returns reversal_transaction_id',
    (v_result1 ->> 'reversal_transaction_id') IS NOT NULL,
    'Result: ' || v_result1::TEXT
  );

  -- Second void call with same token — should return existing
  v_result2 := public.void_transaction(v_oid, v_txn_id, 'M4 void test', CURRENT_DATE, v_token);

  PERFORM public._test_assert(
    'M-4b: idempotent void returns same reversal',
    (v_result1 ->> 'reversal_transaction_id') = (v_result2 ->> 'reversal_transaction_id'),
    'First: ' || (v_result1 ->> 'reversal_transaction_id') || ', Second: ' || (v_result2 ->> 'reversal_transaction_id')
  );
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- M-5: pay_payable direction — debit Utang (2100), credit Cash (P0.1)
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_owner UUID;
  v_oid UUID;
  v_cash_id UUID;
  v_payable_id UUID;
  v_party_id UUID;
  v_expense_id UUID;
  v_txn_id UUID;
  v_je RECORD;
  v_line RECORD;
  v_debit_is_payable BOOLEAN := false;
  v_credit_is_cash BOOLEAN := false;
BEGIN
  SELECT out_owner_user_id, out_organization_id, out_cash_account_id, out_payable_account_id
  INTO v_owner, v_oid, v_cash_id, v_payable_id
  FROM public._test_create_org_with_users('M5_org', CURRENT_DATE);

  PERFORM public._test_impersonate(v_owner);

  -- Create a supplier party for the payable
  INSERT INTO public.parties (organization_id, name, party_type, is_active)
  VALUES (v_oid, 'M5 Supplier', 'supplier', true)
  RETURNING id INTO v_party_id;

  -- A non-product credit purchase needs an explicit debit (expense) account.
  SELECT id INTO v_expense_id FROM public.accounts
  WHERE organization_id = v_oid AND code = 6190 AND is_active = true;

  -- First: create a payable via credit_purchase (unpaid), debiting an expense.
  SELECT (public.post_transaction(
    v_oid, CURRENT_DATE, 'credit_purchase', 500000,
    v_party_id, NULL, v_cash_id, NULL, 'unpaid', NULL, CURRENT_DATE + 30,
    'M5 credit purchase', NULL, NULL, NULL, NULL, v_expense_id
  ) ->> 'transaction_id')::UUID INTO v_txn_id;

  -- Now pay the payable — the direction under test. pay_payable must
  -- debit Utang Usaha (2100) and credit Cash. The journal-line assertions
  -- below verify the account codes directly.
  PERFORM public.post_transaction(
    v_oid, CURRENT_DATE, 'pay_payable', 500000,
    v_party_id, NULL, v_cash_id, NULL, 'paid', NULL, NULL,
    'M5 pay payable', NULL, NULL, NULL, NULL
  );

  -- Check the journal lines of the pay_payable transaction
  FOR v_line IN
    SELECT jl.account_id, jl.debit, jl.credit, a.code
    FROM public.journal_lines jl
    JOIN public.journal_entries je ON je.id = jl.journal_entry_id
    JOIN public.accounts a ON a.id = jl.account_id
    WHERE je.organization_id = v_oid
      AND je.description ILIKE '%M5 pay payable%'
      AND je.status = 'posted'
  LOOP
    IF v_line.debit > 0 AND v_line.code = 2100 THEN
      v_debit_is_payable := true;
    END IF;
    IF v_line.credit > 0 AND v_line.code = 1110 THEN
      v_credit_is_cash := true;
    END IF;
  END LOOP;

  PERFORM public._test_assert(
    'M-5: pay_payable debits Utang Usaha (2100)',
    v_debit_is_payable,
    'Expected debit on account code 2100'
  );

  PERFORM public._test_assert(
    'M-5: pay_payable credits Cash (1110)',
    v_credit_is_cash,
    'Expected credit on account code 1110'
  );
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- M-6: post_transaction resolves parties server-side and rolls back on failure (P2-2)
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_owner UUID;
  v_oid UUID;
  v_result JSONB;
  v_txn_id UUID;
  v_party_id UUID;
  v_party_count INTEGER;
  v_err TEXT;
BEGIN
  SELECT out_owner_user_id, out_organization_id
  INTO v_owner, v_oid
  FROM public._test_create_org_with_users('M6_org', CURRENT_DATE);

  PERFORM public._test_impersonate(v_owner);

  v_result := public.post_transaction(
    p_organization_id => v_oid,
    p_transaction_date => CURRENT_DATE,
    p_transaction_type => 'credit_sale',
    p_amount => 100000,
    p_payment_status => 'unpaid',
    p_due_date => CURRENT_DATE + 7,
    p_description => 'M6 credit sale with server-side party',
    p_party_name => 'M6 Customer'
  );

  v_txn_id := (v_result ->> 'transaction_id')::UUID;
  SELECT party_id INTO v_party_id
  FROM public.transactions
  WHERE id = v_txn_id AND organization_id = v_oid;

  PERFORM public._test_assert(
    'M-6a: server-side party resolution assigns transaction.party_id',
    v_party_id IS NOT NULL,
    'transaction.party_id should be set'
  );

  PERFORM public._test_assert(
    'M-6b: created party is typed as customer',
    EXISTS (
      SELECT 1
      FROM public.parties
      WHERE id = v_party_id
        AND organization_id = v_oid
        AND name = 'M6 Customer'
        AND party_type = 'customer'
        AND is_active = true
    ),
    'expected active customer party named M6 Customer'
  );

  PERFORM public.post_transaction(
    p_organization_id => v_oid,
    p_transaction_date => CURRENT_DATE,
    p_transaction_type => 'credit_sale',
    p_amount => 50000,
    p_payment_status => 'unpaid',
    p_due_date => CURRENT_DATE + 7,
    p_description => 'M6 second credit sale same party',
    p_party_name => '  M6 Customer  '
  );

  SELECT COUNT(*)::INTEGER INTO v_party_count
  FROM public.parties
  WHERE organization_id = v_oid
    AND lower(btrim(name)) = 'm6 customer'
    AND is_active = true;

  PERFORM public._test_assert(
    'M-6c: server-side party resolution dedupes by trimmed name',
    v_party_count = 1,
    'active party count for M6 Customer = ' || v_party_count::TEXT
  );

  BEGIN
    PERFORM public.post_transaction(
      p_organization_id => v_oid,
      p_transaction_date => CURRENT_DATE,
      p_transaction_type => 'credit_sale',
      p_amount => -100000,
      p_payment_status => 'unpaid',
      p_due_date => CURRENT_DATE + 7,
      p_description => 'M6 failed credit sale should roll back party',
      p_party_name => 'M6 Failed Customer'
    );
    PERFORM public._test_fail('M-6d', 'negative amount transaction unexpectedly succeeded');
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    PERFORM public._test_assert(
      'M-6d: failed post raises after party resolution',
      v_err IS NOT NULL,
      'expected an error from invalid negative journal lines'
    );
  END;

  SELECT COUNT(*)::INTEGER INTO v_party_count
  FROM public.parties
  WHERE organization_id = v_oid
    AND lower(btrim(name)) = 'm6 failed customer'
    AND is_active = true;

  PERFORM public._test_assert(
    'M-6e: failed post leaves no orphan party',
    v_party_count = 0,
    'orphan party count for failed post = ' || v_party_count::TEXT
  );
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- Cleanup
-- ═══════════════════════════════════════════════════════════════════
SELECT public._test_cleanup();
SELECT public._test_cleanup();
