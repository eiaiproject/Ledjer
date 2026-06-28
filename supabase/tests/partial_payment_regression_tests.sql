-- =============================================================================
-- LEDJER — post_transaction Partial Payment Regression Tests (STRICT)
-- =============================================================================
-- Validates the fix for v_cash_account_id undeclared variable bug in partial payments.
--
-- Tests cover:
--   PP1 — credit sale with payment_status = 'partial' (valid amount)
--   PP2 — credit purchase with payment_status = 'partial' (valid amount)
--   PP3 — partial amount = 0 when not allowed (should fail)
--   PP4 — partial amount >= total amount (should fail)
--   PP5 — partial amount > total amount (should fail)
--   PP6 — cash account belonging to another organization (should fail)
--   PP7 — missing cash account when partial payment requires one (should fail)
--   PP8 — tenant isolation for all above cases
--   PP9 — Journal entries remain balanced (total debit = total credit)
--   PP10 — Correct AR/AP posting for partial payments
--   PP11 — Correct cash/bank posting for partial payment
--   PP12 — Idempotency via client_token still works with partial payments
-- ============================================================================

\i supabase/tests/_test_helpers.sql

-- ═══════════════════════════════════════════════════════════════════
-- Setup: Common test org with owner, cash account, revenue, payable, party
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_owner_id   UUID;
  v_staff_id   UUID;
  v_org_id     UUID;
  v_cash_id    UUID;
  v_pay_id     UUID;
  v_rev_id     UUID;
  v_recv_id    UUID;
  v_customer_id UUID;
  v_supplier_id UUID;
  v_expense_id UUID;
  v_result     JSONB;
  v_err        TEXT;
  v_je_id      UUID;
  v_debit_sum  NUMERIC;
  v_credit_sum NUMERIC;
BEGIN
  SELECT t.out_owner_user_id, t.out_staff_user_id, t.out_organization_id,
         t.out_cash_account_id, t.out_payable_account_id, t.out_revenue_account_id
    INTO v_owner_id, v_staff_id, v_org_id, v_cash_id, v_pay_id, v_rev_id
  FROM public._test_create_org_with_users(
         'PARTIAL PAYMENT ORG', CURRENT_DATE,
         p_staff_perm_create := true
       ) AS t;

  -- Get receivable account (1200)
  SELECT id INTO v_recv_id FROM public.accounts
  WHERE organization_id = v_org_id AND code = 1200 AND is_active = true;

  -- Get expense account for credit_purchase
  SELECT id INTO v_expense_id FROM public.accounts
  WHERE organization_id = v_org_id AND code = 6190 AND is_active = true;

  -- Create customer party
  INSERT INTO public.parties (organization_id, name, party_type, is_active)
  VALUES (v_org_id, 'Test Customer', 'customer', true)
  RETURNING id INTO v_customer_id;

  -- Create supplier party
  INSERT INTO public.parties (organization_id, name, party_type, is_active)
  VALUES (v_org_id, 'Test Supplier', 'supplier', true)
  RETURNING id INTO v_supplier_id;

  PERFORM public._test_impersonate(v_owner_id);

  -- ═══════════════════════════════════════════════════════════════════
  -- PP1: credit_sale with payment_status = 'partial' (valid amount)
  -- ═══════════════════════════════════════════════════════════════════
  v_result := public.post_transaction(
    v_org_id, CURRENT_DATE, 'credit_sale', 100000,
    v_customer_id, NULL, v_cash_id, NULL, 'partial', 30000, NULL,
    'PP1: partial credit sale', NULL, NULL, NULL, NULL, NULL, gen_random_uuid()
  );

  PERFORM public._test_assert(
    'PP1.1: partial credit_sale succeeds with valid partial amount',
    (v_result ->> 'transaction_id') IS NOT NULL,
    'Result: ' || v_result::TEXT
  );

  -- Verify journal entry is balanced
  SELECT je.id INTO v_je_id
  FROM public.journal_entries je
  WHERE je.transaction_id = (v_result ->> 'transaction_id')::UUID;

  SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0)
    INTO v_debit_sum, v_credit_sum
  FROM public.journal_lines WHERE journal_entry_id = v_je_id;

  PERFORM public._test_assert_eq_numeric(
    'PP1.2: partial credit_sale journal balanced',
    v_debit_sum, v_credit_sum
  );

  -- Verify AR (1200) has remaining amount (70000 = 100000 - 30000)
  SELECT COALESCE(SUM(debit - credit), 0) INTO v_debit_sum
  FROM public.journal_lines jl
  JOIN public.accounts a ON a.id = jl.account_id
  WHERE jl.journal_entry_id = v_je_id AND a.code = 1200;

  PERFORM public._test_assert_eq_numeric(
    'PP1.3: partial credit_sale AR debit = remaining amount (70000)',
    v_debit_sum, 70000
  );

  -- Verify Cash (1110) has partial amount (30000)
  SELECT COALESCE(SUM(debit - credit), 0) INTO v_debit_sum
  FROM public.journal_lines jl
  JOIN public.accounts a ON a.id = jl.account_id
  WHERE jl.journal_entry_id = v_je_id AND a.code = 1110;

  PERFORM public._test_assert_eq_numeric(
    'PP1.4: partial credit_sale cash debit = partial amount (30000)',
    v_debit_sum, 30000
  );

  -- Verify Revenue (4100) has full amount (100000 credit)
  SELECT COALESCE(SUM(credit - debit), 0) INTO v_credit_sum
  FROM public.journal_lines jl
  JOIN public.accounts a ON a.id = jl.account_id
  WHERE jl.journal_entry_id = v_je_id AND a.code = 4100;

  PERFORM public._test_assert_eq_numeric(
    'PP1.5: partial credit_sale revenue credit = full amount (100000)',
    v_credit_sum, 100000
  );

  -- ═══════════════════════════════════════════════════════════════════
  -- PP2: credit_purchase with payment_status = 'partial' (valid amount)
  -- ═══════════════════════════════════════════════════════════════════
  v_result := public.post_transaction(
    v_org_id, CURRENT_DATE, 'credit_purchase', 200000,
    v_supplier_id, NULL, v_cash_id, NULL, 'partial', 50000, NULL,
    'PP2: partial credit purchase', NULL, NULL, NULL, NULL, v_expense_id, gen_random_uuid()
  );

  PERFORM public._test_assert(
    'PP2.1: partial credit_purchase succeeds with valid partial amount',
    (v_result ->> 'transaction_id') IS NOT NULL,
    'Result: ' || v_result::TEXT
  );

  SELECT je.id INTO v_je_id
  FROM public.journal_entries je
  WHERE je.transaction_id = (v_result ->> 'transaction_id')::UUID;

  SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0)
    INTO v_debit_sum, v_credit_sum
  FROM public.journal_lines WHERE journal_entry_id = v_je_id;

  PERFORM public._test_assert_eq_numeric(
    'PP2.2: partial credit_purchase journal balanced',
    v_debit_sum, v_credit_sum
  );

  -- Verify Expense (6190) has full amount (200000 debit)
  SELECT COALESCE(SUM(debit - credit), 0) INTO v_debit_sum
  FROM public.journal_lines jl
  JOIN public.accounts a ON a.id = jl.account_id
  WHERE jl.journal_entry_id = v_je_id AND a.code = 6190;

  PERFORM public._test_assert_eq_numeric(
    'PP2.3: partial credit_purchase expense debit = full amount (200000)',
    v_debit_sum, 200000
  );

  -- Verify Cash (1110) has partial amount (50000 credit)
  SELECT COALESCE(SUM(credit - debit), 0) INTO v_credit_sum
  FROM public.journal_lines jl
  JOIN public.accounts a ON a.id = jl.account_id
  WHERE jl.journal_entry_id = v_je_id AND a.code = 1110;

  PERFORM public._test_assert_eq_numeric(
    'PP2.4: partial credit_purchase cash credit = partial amount (50000)',
    v_credit_sum, 50000
  );

  -- Verify Payable (2100) has remaining amount (150000 = 200000 - 50000 credit)
  SELECT COALESCE(SUM(credit - debit), 0) INTO v_credit_sum
  FROM public.journal_lines jl
  JOIN public.accounts a ON a.id = jl.account_id
  WHERE jl.journal_entry_id = v_je_id AND a.code = 2100;

  PERFORM public._test_assert_eq_numeric(
    'PP2.5: partial credit_purchase payable credit = remaining amount (150000)',
    v_credit_sum, 150000
  );

  -- ═══════════════════════════════════════════════════════════════════
  -- PP3: partial amount = 0 (should fail)
  -- ═══════════════════════════════════════════════════════════════════
  BEGIN
    PERFORM public.post_transaction(
      v_org_id, CURRENT_DATE, 'credit_sale', 100000,
      v_customer_id, NULL, v_cash_id, NULL, 'partial', 0, NULL,
      'PP3: partial amount zero', NULL, NULL, NULL, NULL, NULL, gen_random_uuid()
    );
    PERFORM public._test_fail('PP3', 'partial amount = 0 should have been rejected');
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    PERFORM public._test_assert(
      'PP3: partial amount = 0 rejected',
      v_err ILIKE '%valid%' OR v_err ILIKE '%lebih dari 0%',
      format('expected validation error, got: %s', v_err)
    );
  END;

  -- ═══════════════════════════════════════════════════════════════════
  -- PP4: partial amount = total amount (should fail)
  -- ═══════════════════════════════════════════════════════════════════
  BEGIN
    PERFORM public.post_transaction(
      v_org_id, CURRENT_DATE, 'credit_sale', 100000,
      v_customer_id, NULL, v_cash_id, NULL, 'partial', 100000, NULL,
      'PP4: partial equals total', NULL, NULL, NULL, NULL, NULL, gen_random_uuid()
    );
    PERFORM public._test_fail('PP4', 'partial amount = total should have been rejected');
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    PERFORM public._test_assert(
      'PP4: partial amount = total rejected',
      v_err ILIKE '%valid%' OR v_err ILIKE '%lebih kecil%',
      format('expected validation error, got: %s', v_err)
    );
  END;

  -- ═══════════════════════════════════════════════════════════════════
  -- PP5: partial amount > total amount (should fail)
  -- ═══════════════════════════════════════════════════════════════════
  BEGIN
    PERFORM public.post_transaction(
      v_org_id, CURRENT_DATE, 'credit_sale', 100000,
      v_customer_id, NULL, v_cash_id, NULL, 'partial', 150000, NULL,
      'PP5: partial greater than total', NULL, NULL, NULL, NULL, NULL, gen_random_uuid()
    );
    PERFORM public._test_fail('PP5', 'partial amount > total should have been rejected');
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    PERFORM public._test_assert(
      'PP5: partial amount > total rejected',
      v_err ILIKE '%valid%' OR v_err ILIKE '%lebih kecil%',
      format('expected validation error, got: %s', v_err)
    );
  END;

  -- ══════════════════════════════════════════════════════════════════
  -- PP6: cash account belonging to another organization (should fail)
  -- ══════════════════════════════════════════════════════════════════
  -- Create second org with its own cash account
  SELECT t.out_organization_id, t.out_cash_account_id
    INTO v_staff_id, v_cash_id -- reusing vars for second org
  FROM public._test_create_org_with_users('OTHER ORG', CURRENT_DATE) AS t;

  BEGIN
    PERFORM public.post_transaction(
      v_org_id, CURRENT_DATE, 'credit_sale', 100000,
      v_customer_id, NULL, v_cash_id, NULL, 'partial', 30000, NULL,
      'PP6: cross-org cash account', NULL, NULL, NULL, NULL, NULL, gen_random_uuid()
    );
    PERFORM public._test_fail('PP6', 'cross-org cash account should have been rejected');
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    PERFORM public._test_assert(
      'PP6: cross-org cash account rejected',
      v_err ILIKE '%tidak ditemukan%' OR v_err ILIKE '%not found%' OR v_err ILIKE '%termasuk%',
      format('expected cross-org rejection, got: %s', v_err)
    );
  END;

  -- ══════════════════════════════════════════════════════════════════
  -- PP7: missing cash account when partial payment requires one (should fail)
  -- ══════════════════════════════════════════════════════════════════
  BEGIN
    PERFORM public.post_transaction(
      v_org_id, CURRENT_DATE, 'credit_sale', 100000,
      v_customer_id, NULL, NULL, NULL, 'partial', 30000, NULL,
      'PP7: missing cash account', NULL, NULL, NULL, NULL, NULL, gen_random_uuid()
    );
    PERFORM public._test_fail('PP7', 'missing cash account should have been rejected');
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    PERFORM public._test_assert(
      'PP7: missing cash account rejected',
      v_err ILIKE '%kas%' OR v_err ILIKE '%wajib%' OR v_err ILIKE '%tidak ditemukan%',
      format('expected missing cash account error, got: %s', v_err)
    );
  END;

  -- ══════════════════════════════════════════════════════════════════
  -- PP8: tenant isolation - other org cannot see partial transactions
  -- ══════════════════════════════════════════════════════════════════
  -- Setup second org
  SELECT t.out_owner_user_id, t.out_organization_id, t.out_cash_account_id, t.out_payable_account_id, t.out_revenue_account_id
    INTO v_staff_id, v_staff_id, v_cash_id, v_pay_id, v_rev_id
  FROM public._test_create_org_with_users('ISOLATION ORG', CURRENT_DATE) AS t;

  SELECT id INTO v_customer_id FROM public.parties WHERE organization_id = v_staff_id AND party_type = 'customer' LIMIT 1;

  IF v_customer_id IS NULL THEN
    INSERT INTO public.parties (organization_id, name, party_type, is_active)
    VALUES (v_staff_id, 'Other Customer', 'customer', true)
    RETURNING id INTO v_customer_id;
  END IF;

  PERFORM public._test_impersonate(v_staff_id);

  -- Try to post partial with first org's ID (should fail - not a member)
  BEGIN
    PERFORM public.post_transaction(
      v_org_id, CURRENT_DATE, 'credit_sale', 100000,
      v_customer_id, NULL, v_cash_id, NULL, 'partial', 30000, NULL,
      'PP8: tenant isolation', NULL, NULL, NULL, NULL, NULL, gen_random_uuid()
    );
    PERFORM public._test_fail('PP8', 'tenant isolation should have blocked cross-org post');
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    PERFORM public._test_assert(
      'PP8: cross-org post rejected',
      v_err ILIKE '%anggota%' OR v_err ILIKE '%member%' OR v_err ILIKE '%permission%',
      format('expected cross-org rejection, got: %s', v_err)
    );
  END;

  -- ══════════════════════════════════════════════════════════════════
  -- PP9: Journal entries remain balanced for all partial transactions
  -- ══════════════════════════════════════════════════════════════════
  PERFORM public._test_impersonate(v_owner_id);

  -- Verify PP1 journal still balanced
  SELECT je.id INTO v_je_id
  FROM public.journal_entries je
  JOIN public.transactions t ON t.id = je.transaction_id
  WHERE t.organization_id = v_org_id AND t.description = 'PP1: partial credit sale'
  LIMIT 1;

  SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0)
    INTO v_debit_sum, v_credit_sum
  FROM public.journal_lines WHERE journal_entry_id = v_je_id;

  PERFORM public._test_assert_eq_numeric(
    'PP9.1: PP1 journal remains balanced after all tests',
    v_debit_sum, v_credit_sum
  );

  -- Verify PP2 journal still balanced
  SELECT je.id INTO v_je_id
  FROM public.journal_entries je
  JOIN public.transactions t ON t.id = je.transaction_id
  WHERE t.organization_id = v_org_id AND t.description = 'PP2: partial credit purchase'
  LIMIT 1;

  SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0)
    INTO v_debit_sum, v_credit_sum
  FROM public.journal_lines WHERE journal_entry_id = v_je_id;

  PERFORM public._test_assert_eq_numeric(
    'PP9.2: PP2 journal remains balanced after all tests',
    v_debit_sum, v_credit_sum
  );

  -- ══════════════════════════════════════════════════════════════════
  -- PP10: Correct AR/AP posting for partial payments
  -- ══════════════════════════════════════════════════════════════════
  -- PP10.1: credit_sale partial - AR should have remaining amount
  SELECT je.id INTO v_je_id
  FROM public.journal_entries je
  JOIN public.transactions t ON t.id = je.transaction_id
  WHERE t.organization_id = v_org_id AND t.description = 'PP1: partial credit sale'
  LIMIT 1;

  -- Check AR line (1200) - should be debit of 70000 (remaining)
  SELECT COALESCE(SUM(debit), 0) INTO v_debit_sum
  FROM public.journal_lines jl
  JOIN public.accounts a ON a.id = jl.account_id
  WHERE jl.journal_entry_id = v_je_id AND a.code = 1200;

  PERFORM public._test_assert_eq_numeric(
    'PP10.1: partial credit_sale AR debit = 70000',
    v_debit_sum, 70000
  );

  -- PP10.2: credit_purchase partial - AP should have remaining amount
  SELECT je.id INTO v_je_id
  FROM public.journal_entries je
  JOIN public.transactions t ON t.id = je.transaction_id
  WHERE t.organization_id = v_org_id AND t.description = 'PP2: partial credit purchase'
  LIMIT 1;

  -- Check AP line (2100) - should be credit of 150000 (remaining)
  SELECT COALESCE(SUM(credit), 0) INTO v_credit_sum
  FROM public.journal_lines jl
  JOIN public.accounts a ON a.id = jl.account_id
  WHERE jl.journal_entry_id = v_je_id AND a.code = 2100;

  PERFORM public._test_assert_eq_numeric(
    'PP10.2: partial credit_purchase AP credit = 150000',
    v_credit_sum, 150000
  );

  -- ══════════════════════════════════════════════════════════════════
  -- PP11: Correct cash/bank posting for partial payment
  -- ══════════════════════════════════════════════════════════════════
  -- PP11.1: credit_sale partial - cash should be debit of partial amount
  SELECT je.id INTO v_je_id
  FROM public.journal_entries je
  JOIN public.transactions t ON t.id = je.transaction_id
  WHERE t.organization_id = v_org_id AND t.description = 'PP1: partial credit sale'
  LIMIT 1;

  SELECT COALESCE(SUM(debit), 0) INTO v_debit_sum
  FROM public.journal_lines jl
  JOIN public.accounts a ON a.id = jl.account_id
  WHERE jl.journal_entry_id = v_je_id AND a.code = 1110;

  PERFORM public._test_assert_eq_numeric(
    'PP11.1: partial credit_sale cash debit = 30000',
    v_debit_sum, 30000
  );

  -- PP11.2: credit_purchase partial - cash should be credit of partial amount
  SELECT je.id INTO v_je_id
  FROM public.journal_entries je
  JOIN public.transactions t ON t.id = je.transaction_id
  WHERE t.organization_id = v_org_id AND t.description = 'PP2: partial credit purchase'
  LIMIT 1;

  SELECT COALESCE(SUM(credit), 0) INTO v_credit_sum
  FROM public.journal_lines jl
  JOIN public.accounts a ON a.id = jl.account_id
  WHERE jl.journal_entry_id = v_je_id AND a.code = 1110;

  PERFORM public._test_assert_eq_numeric(
    'PP11.2: partial credit_purchase cash credit = 50000',
    v_credit_sum, 50000
  );

  PERFORM public._test_impersonate(v_owner_id);

  -- ══════════════════════════════════════════════════════════════════
  -- PP12: Idempotency via client_token works with partial payments
  -- ══════════════════════════════════════════════════════════════════
  DECLARE
    v_token UUID := gen_random_uuid();
    v_result1 JSONB;
    v_result2 JSONB;
    v_txn_count INTEGER;
  BEGIN
    v_result1 := public.post_transaction(
      v_org_id, CURRENT_DATE, 'credit_sale', 50000,
      v_customer_id, NULL, v_cash_id, NULL, 'partial', 15000, NULL,
      'PP12: idempotent partial credit sale', NULL, NULL, NULL, NULL, NULL, v_token
    );

    PERFORM public._test_assert(
      'PP12.1: first idempotent partial call succeeds',
      (v_result1 ->> 'transaction_id') IS NOT NULL,
      'Result: ' || v_result1::TEXT
    );

    v_result2 := public.post_transaction(
      v_org_id, CURRENT_DATE, 'credit_sale', 50000,
      v_customer_id, NULL, v_cash_id, NULL, 'partial', 15000, NULL,
      'PP12: idempotent partial credit sale', NULL, NULL, NULL, NULL, NULL, v_token
    );

    PERFORM public._test_assert(
      'PP12.2: second idempotent call returns same transaction_id',
      (v_result1 ->> 'transaction_id') = (v_result2 ->> 'transaction_id'),
      'First: ' || (v_result1 ->> 'transaction_id') || ', Second: ' || (v_result2 ->> 'transaction_id')
    );

    SELECT COUNT(*)::INTEGER INTO v_txn_count
    FROM public.transactions
    WHERE organization_id = v_org_id AND client_token = v_token;

    PERFORM public._test_assert(
      'PP12.3: exactly one transaction for duplicate token',
      v_txn_count = 1,
      'Count: ' || v_txn_count::TEXT
    );
  END;

  RAISE NOTICE '=== Partial Payment Regression Tests PASSED ===';
END $$;

DO $$ BEGIN RAISE NOTICE '=== Partial Payment Tests Complete ==='; END $$;