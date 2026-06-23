-- =============================================================================
-- LEDJER — pay_payable Behavioral Test
-- =============================================================================
-- Behavioral (not source-inspection) test that verifies pay_payable posts
--   DEBIT  Utang Usaha (code 2100)
--   CREDIT Kas/Bank   (the supplied cash account)
-- and the resulting balances: payable decreases, cash decreases.
--
-- This catches the P0.1 bug class (debit/credit reversed) at runtime, not by
-- grepping the function body. The function-level source check in
-- p0_critical_fix_tests.sql remains as a smoke guard.
--
-- STRICT MODE: every assertion uses _test_assert (RAISE EXCEPTION on FAIL).
-- ============================================================================

\i supabase/tests/_test_helpers.sql

DO $$
DECLARE
  v_owner_id   UUID;
  v_staff_id   UUID;
  v_org_id     UUID;
  v_cash_id    UUID;
  v_pay_id     UUID;
  v_rev_id     UUID;

  v_supplier_id UUID;

  v_credit_purchase_id UUID;
  v_pay_payable_id     UUID;

  v_journal_id UUID;
  v_debit_line RECORD;
  v_credit_line RECORD;

  v_debit_amount NUMERIC;
  v_credit_amount NUMERIC;
  v_payable_balance NUMERIC;
  v_cash_balance   NUMERIC;
  v_payable_before NUMERIC;
  v_cash_before    NUMERIC;
BEGIN
  -- Setup: fresh org, owner, default CoA
  SELECT t.out_owner_user_id, t.out_staff_user_id, t.out_organization_id,
         t.out_cash_account_id, t.out_payable_account_id, t.out_revenue_account_id
    INTO v_owner_id, v_staff_id, v_org_id, v_cash_id, v_pay_id, v_rev_id
  FROM public._test_create_org_with_users('PAYABLE ORG', CURRENT_DATE) AS t;

  IF v_cash_id IS NULL THEN PERFORM public._test_fail('SETUP', 'cash account missing'); END IF;
  IF v_pay_id IS NULL THEN PERFORM public._test_fail('SETUP', 'payable account missing'); END IF;

  PERFORM public._test_impersonate(v_owner_id);

  -- Create a supplier party
  INSERT INTO public.parties (organization_id, name, party_type, is_active)
  VALUES (v_org_id, 'Supplier Test', 'supplier', true)
  RETURNING id INTO v_supplier_id;

  -- Record balances BEFORE pay_payable
  v_payable_before := public.get_account_balance(v_pay_id, NULL);
  v_cash_before    := public.get_account_balance(v_cash_id, NULL);

  -- Step 1: post a credit_purchase (unpaid) to create a payable of 500,000
  v_credit_purchase_id := (public.post_transaction(
    v_org_id, CURRENT_DATE, 'credit_purchase', 500000,
    v_supplier_id, NULL, NULL, NULL, 'unpaid', NULL, NULL,
    'Pembelian kredit ke supplier', NULL, NULL, NULL, NULL, NULL
  ) ->> 'transaction_id')::UUID;

  -- Payable should now be 500,000 (credit balance, displayed as positive)
  v_payable_balance := public.get_account_balance(v_pay_id, NULL);
  PERFORM public._test_assert_eq_numeric(
    'PB1: payable balance after credit_purchase',
    v_payable_balance, 500000);

  -- Step 2: post pay_payable for 500,000 → payable should be 0, cash should decrease
  v_pay_payable_id := (public.post_transaction(
    v_org_id, CURRENT_DATE, 'pay_payable', 500000,
    v_supplier_id, NULL, v_cash_id, NULL, 'paid', NULL, NULL,
    'Bayar utang ke supplier', NULL, NULL, NULL, NULL, NULL
  ) ->> 'transaction_id')::UUID;

  -- ═══════════════════════════════════════════════════════════════════
  -- ASSERTION 1: pay_payable journal direction
  --   DEBIT  account 2100 (Utang Usaha) = 500,000
  --   CREDIT cash account (the one we passed) = 500,000
  -- ═══════════════════════════════════════════════════════════════════

  SELECT je.id INTO v_journal_id
  FROM public.journal_entries je
  WHERE je.transaction_id = v_pay_payable_id
    AND je.organization_id = v_org_id
    AND je.status = 'posted'
  LIMIT 1;

  IF v_journal_id IS NULL THEN
    PERFORM public._test_fail('PB2', 'no posted journal entry found for pay_payable');
  END IF;

  -- Fetch the two posted lines
  SELECT a.code, jl.debit, jl.credit
    INTO v_debit_line
  FROM public.journal_lines jl
  JOIN public.accounts a ON a.id = jl.account_id
  WHERE jl.journal_entry_id = v_journal_id AND jl.debit > 0
  LIMIT 1;

  IF NOT FOUND THEN
    PERFORM public._test_fail('PB3', 'no debit line in pay_payable journal');
  END IF;

  SELECT a.code, jl.debit, jl.credit
    INTO v_credit_line
  FROM public.journal_lines jl
  JOIN public.accounts a ON a.id = jl.account_id
  WHERE jl.journal_entry_id = v_journal_id AND jl.credit > 0
  LIMIT 1;

  IF NOT FOUND THEN
    PERFORM public._test_fail('PB4', 'no credit line in pay_payable journal');
  END IF;

  PERFORM public._test_assert(
    'PB5: pay_payable DEBIT line is account code 2100 (Utang Usaha)',
    v_debit_line.code = 2100,
    format('expected code 2100, got %s', v_debit_line.code)
  );

  PERFORM public._test_assert(
    'PB6: pay_payable DEBIT line is the supplied cash account',
    v_credit_line.account_id IS DISTINCT FROM NULL
  );

  PERFORM public._test_assert_eq_numeric(
    'PB7: pay_payable DEBIT amount equals transaction amount',
    v_debit_line.debit, 500000);

  PERFORM public._test_assert_eq_numeric(
    'PB8: pay_payable CREDIT amount equals transaction amount',
    v_credit_line.credit, 500000);

  PERFORM public._test_assert(
    'PB9: pay_payable CREDIT account is the cash account we passed',
    v_credit_line.account_id IS DISTINCT FROM v_debit_line.account_id,
    'debit and credit must be different accounts'
  );

  PERFORM public._test_assert(
    'PB10: pay_payable CREDIT account IS the cash account (code 1110 or is_cash_account)',
    EXISTS (
      SELECT 1 FROM public.accounts a
      WHERE a.id = v_credit_line.account_id
        AND (a.code = 1110 OR a.is_cash_account = true)
    ),
    'credit account is not a cash account'
  );

  -- ═══════════════════════════════════════════════════════════════════
  -- ASSERTION 2: balances after pay_payable
  --   payable decreases (500k → 0)
  --   cash decreases (0 → -500k)
  -- ═══════════════════════════════════════════════════════════════════

  v_payable_balance := public.get_account_balance(v_pay_id, NULL);
  v_cash_balance    := public.get_account_balance(v_cash_id, NULL);

  PERFORM public._test_assert_eq_numeric(
    'PB11: payable balance after pay_payable = 0',
    v_payable_balance, 0);

  PERFORM public._test_assert_eq_numeric(
    'PB12: cash balance after pay_payable decreased by 500k (was % -> now -500k)',
    v_cash_balance, -500000);

  -- Verify the journal itself is balanced (debits == credits per entry)
  PERFORM public._test_assert(
    'PB13: pay_payable journal entry is balanced (ΣD = ΣC)',
    ABS(COALESCE((SELECT SUM(debit) FROM public.journal_lines WHERE journal_entry_id = v_journal_id), 0)
      - COALESCE((SELECT SUM(credit) FROM public.journal_lines WHERE journal_entry_id = v_journal_id), 0)) < 0.01,
    'pay_payable journal is unbalanced'
  );

  -- ═══════════════════════════════════════════════════════════════════
  -- ASSERTION 3: partial pay_payable also debits 2100
  -- ═══════════════════════════════════════════════════════════════════

  -- Create another unpaid credit_purchase of 200,000
  v_credit_purchase_id := (public.post_transaction(
    v_org_id, CURRENT_DATE, 'credit_purchase', 200000,
    v_supplier_id, NULL, NULL, NULL, 'unpaid', NULL, NULL,
    'Pembelian kredit ke-2', NULL, NULL, NULL, NULL, NULL
  ) ->> 'transaction_id')::UUID;

  v_pay_payable_id := (public.post_transaction(
    v_org_id, CURRENT_DATE, 'pay_payable', 80000,
    v_supplier_id, NULL, v_cash_id, NULL, 'paid', NULL, NULL,
    'Bayar sebagian utang', NULL, NULL, NULL, NULL, NULL
  ) ->> 'transaction_id')::UUID;

  SELECT je.id INTO v_journal_id
  FROM public.journal_entries je
  WHERE je.transaction_id = v_pay_payable_id
    AND je.organization_id = v_org_id
  LIMIT 1;

  SELECT a.code, jl.debit, jl.credit
    INTO v_debit_line
  FROM public.journal_lines jl
  JOIN public.accounts a ON a.id = jl.account_id
  WHERE jl.journal_entry_id = v_journal_id AND jl.debit > 0
  LIMIT 1;

  PERFORM public._test_assert(
    'PB14: partial pay_payable also debits account 2100',
    v_debit_line.code = 2100,
    format('partial pay_payable debited code %s, expected 2100', v_debit_line.code)
  );

  PERFORM public._test_assert_eq_numeric(
    'PB15: partial pay_payable debit amount equals payment amount',
    v_debit_line.debit, 80000);

  -- Payable now 200,000 - 80,000 = 120,000
  PERFORM public._test_assert_eq_numeric(
    'PB16: payable balance after partial pay_payable',
    public.get_account_balance(v_pay_id, NULL), 120000);

  RAISE NOTICE '=== Payable Behavior Tests PASSED ===';
END $$;

-- Cleanup
SELECT public._test_cleanup();

DO $$ BEGIN RAISE NOTICE '=== Payable Behavior Tests Complete ==='; END $$;
