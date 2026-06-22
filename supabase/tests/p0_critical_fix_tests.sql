-- =============================================================================
-- LEDJER — P0 Critical Fix Regression Tests
-- =============================================================================
-- Tests specifically for P0.1 (pay_payable direction) and P0.2 (onboarding flow)
--
-- These tests validate the SQL logic. For full integration testing with auth,
-- run via Supabase test framework or psql with proper JWT context.
-- =============================================================================

-- ═══════════════════════════════════════════════════════════════════
-- Helper
-- ═══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public._test_assert(
  p_test_name TEXT,
  p_condition BOOLEAN,
  p_detail TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  IF p_condition THEN
    RAISE NOTICE 'PASS: %', p_test_name;
  ELSE
    RAISE WARNING 'FAIL: % %', p_test_name,
      CASE WHEN p_detail IS NOT NULL THEN ' — ' || p_detail ELSE '' END;
  END IF;
END;
$$ LANGUAGE plpgsql;


-- ═══════════════════════════════════════════════════════════════════
-- P0.1 TEST 1: Verify pay_payable function definition has correct direction
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_func_source TEXT;
  v_has_wrong_direction BOOLEAN;
  v_has_correct_direction BOOLEAN;
BEGIN
  -- Get the canonical post_transaction function source
  SELECT pg_get_functiondef(p.oid) INTO v_func_source
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.proname = 'post_transaction'
    AND n.nspname = 'public'
    AND p.pronargs = 17  -- canonical 17-param version
  LIMIT 1;

  IF v_func_source IS NULL THEN
    RAISE WARNING 'SKIP: P0.1.1 — post_transaction function not found';
    RETURN;
  END IF;

  -- Check for WRONG direction: debit cash + credit payable
  -- This would appear as: v_debit_account_id := p_cash_account_id followed by code = 2100
  -- in the pay_payable branch
  v_has_wrong_direction := v_func_source LIKE '%pay_payable%'
    AND v_func_source LIKE '%v_debit_account_id%:=%p_cash_account_id%'
    AND v_func_source LIKE '%code = 2100%v_credit_account_id%';

  -- Check for CORRECT direction: debit payable (2100) + credit cash
  v_has_correct_direction := v_func_source LIKE '%pay_payable%'
    AND v_func_source LIKE '%code = 2100%v_debit_account_id%'
    AND v_func_source LIKE '%v_credit_account_id%:=%p_cash_account_id%';

  PERFORM public._test_assert(
    'P0.1.1: pay_payable does NOT have reversed direction',
    NOT v_has_wrong_direction,
    'Found wrong direction pattern in function source'
  );

  PERFORM public._test_assert(
    'P0.1.2: pay_payable HAS correct direction (debit=2100, credit=cash)',
    v_has_correct_direction,
    'Expected debit=Utang(2100), credit=Cash. Check function source.'
  );
END $$;


-- ═══════════════════════════════════════════════════════════════════
-- P0.1 TEST 2: Verify all transaction types have correct account mappings
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_func_source TEXT;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_func_source
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.proname = 'post_transaction'
    AND n.nspname = 'public'
    AND p.pronargs = 17
  LIMIT 1;

  IF v_func_source IS NULL THEN
    RAISE WARNING 'SKIP: P0.1.3 — post_transaction function not found';
    RETURN;
  END IF;

  -- cash_sale: debit=cash, credit=revenue
  PERFORM public._test_assert(
    'P0.1.3: cash_sale debits cash account',
    v_func_source LIKE '%cash_sale%v_debit_account_id%:=%p_cash_account_id%',
    'cash_sale should debit cash'
  );

  -- receive_receivable: debit=cash, credit=piutang(1200)
  PERFORM public._test_assert(
    'P0.1.4: receive_receivable debits cash',
    v_func_source LIKE '%receive_receivable%v_debit_account_id%:=%p_cash_account_id%',
    'receive_receivable should debit cash'
  );

  -- owner_capital: debit=cash, credit=modal(3100)
  PERFORM public._test_assert(
    'P0.1.5: owner_capital debits cash',
    v_func_source LIKE '%owner_capital%v_debit_account_id%:=%p_cash_account_id%',
    'owner_capital should debit cash'
  );

  -- owner_draw: debit=prive(3300), credit=cash
  PERFORM public._test_assert(
    'P0.1.6: owner_draw credits cash',
    v_func_source LIKE '%owner_draw%v_credit_account_id%:=%p_cash_account_id%',
    'owner_draw should credit cash'
  );

  -- expense_payment: debit=expense, credit=cash
  PERFORM public._test_assert(
    'P0.1.7: expense_payment credits cash',
    v_func_source LIKE '%expense_payment%v_credit_account_id%:=%p_cash_account_id%',
    'expense_payment should credit cash'
  );
END $$;


-- ═══════════════════════════════════════════════════════════════════
-- P0.2 TEST 3: Verify onboarding flow uses in_progress then completed
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_template_source TEXT;
  v_wrapping_source TEXT;
  v_org_id UUID;
  v_onboarding TEXT;
BEGIN
  -- Check create_organization_with_template sets in_progress
  SELECT pg_get_functiondef(p.oid) INTO v_template_source
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.proname = 'create_organization_with_template'
    AND n.nspname = 'public'
  LIMIT 1;

  IF v_template_source IS NOT NULL THEN
    PERFORM public._test_assert(
      'P0.2.1: create_organization_with_template sets in_progress',
      v_template_source LIKE '%in_progress%',
      'Template function should set onboarding_status to in_progress'
    );

    PERFORM public._test_assert(
      'P0.2.2: create_organization_with_template does NOT set completed',
      v_template_source NOT LIKE '%''completed''%',
      'Template function should not set completed directly'
    );
  ELSE
    RAISE WARNING 'SKIP: P0.2.1-2 — create_organization_with_template not found';
  END IF;

  -- Check create_organization_with_opening_balances sets completed after balances
  SELECT pg_get_functiondef(p.oid) INTO v_wrapping_source
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.proname = 'create_organization_with_opening_balances'
    AND n.nspname = 'public'
  LIMIT 1;

  IF v_wrapping_source IS NOT NULL THEN
    PERFORM public._test_assert(
      'P0.2.3: create_organization_with_opening_balances sets completed',
      v_wrapping_source LIKE '%completed%',
      'Wrapping function should set completed after all balances'
    );
  ELSE
    RAISE WARNING 'SKIP: P0.2.3 — create_organization_with_opening_balances not found';
  END IF;

  -- Check existing org onboarding status
  SELECT id INTO v_org_id FROM public.organizations LIMIT 1;
  IF v_org_id IS NOT NULL THEN
    SELECT onboarding_status::TEXT INTO v_onboarding
    FROM public.organizations WHERE id = v_org_id;

    PERFORM public._test_assert(
      'P0.2.4: Existing org has valid onboarding status',
      v_onboarding IN ('in_progress', 'completed'),
      'Actual: ' || v_onboarding
    );
  END IF;
END $$;


-- ═══════════════════════════════════════════════════════════════════
-- P0.2 TEST 4: Verify post_opening_balance allows in_progress
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_post_ob_source TEXT;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_post_ob_source
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.proname = 'post_opening_balance'
    AND n.nspname = 'public'
  LIMIT 1;

  IF v_post_ob_source IS NOT NULL THEN
    PERFORM public._test_assert(
      'P0.2.5: post_opening_balance rejects completed status',
      v_post_ob_source LIKE '%completed%EXCEPTION%' OR v_post_ob_source LIKE '%EXCEPTION%completed%',
      'Should raise exception when onboarding is completed'
    );
  ELSE
    RAISE WARNING 'SKIP: P0.2.5 — post_opening_balance not found';
  END IF;
END $$;


-- ═══════════════════════════════════════════════════════════════════
-- EXISTING TESTS: Journal balance integrity
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_org_id UUID;
  v_unbalanced_count INTEGER;
BEGIN
  SELECT id INTO v_org_id FROM public.organizations LIMIT 1;
  IF v_org_id IS NULL THEN
    RAISE WARNING 'SKIP: Balance test — no org';
    RETURN;
  END IF;

  SELECT COUNT(*)
  INTO v_unbalanced_count
  FROM (
    SELECT je.id
    FROM public.journal_entries je
    JOIN public.journal_lines jl ON jl.journal_entry_id = je.id
    WHERE je.organization_id = v_org_id
      AND je.status = 'posted'
    GROUP BY je.id
    HAVING ABS(COALESCE(SUM(jl.debit), 0) - COALESCE(SUM(jl.credit), 0)) > 0.01
  ) unbalanced;

  PERFORM public._test_assert(
    'BALANCE: All posted journal entries are balanced',
    v_unbalanced_count = 0,
    'Unbalanced journals: ' || v_unbalanced_count
  );
END $$;


-- ═══════════════════════════════════════════════════════════════════
-- EXISTING TESTS: Trial balance
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_org_id UUID;
  v_total_debit NUMERIC;
  v_total_credit NUMERIC;
  v_diff NUMERIC;
BEGIN
  SELECT id INTO v_org_id FROM public.organizations LIMIT 1;
  IF v_org_id IS NULL THEN
    RAISE WARNING 'SKIP: Trial balance test — no org';
    RETURN;
  END IF;

  SELECT
    COALESCE(SUM(jl.debit), 0),
    COALESCE(SUM(jl.credit), 0)
  INTO v_total_debit, v_total_credit
  FROM public.journal_lines jl
  JOIN public.journal_entries je ON je.id = jl.journal_entry_id
  WHERE jl.organization_id = v_org_id
    AND je.status = 'posted';

  v_diff := ABS(v_total_debit - v_total_credit);

  PERFORM public._test_assert(
    'BALANCE: Trial balance (total debits = total credits)',
    v_diff < 0.01,
    'Difference: ' || v_diff
  );
END $$;


-- ═══════════════════════════════════════════════════════════════════
-- EXISTING TESTS: Balance sheet equation
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_org_id UUID;
  v_assets NUMERIC := 0;
  v_liabilities NUMERIC := 0;
  v_equity NUMERIC := 0;
  v_revenue NUMERIC := 0;
  v_expenses NUMERIC := 0;
  v_balance_diff NUMERIC;
BEGIN
  SELECT id INTO v_org_id FROM public.organizations LIMIT 1;
  IF v_org_id IS NULL THEN
    RAISE WARNING 'SKIP: Balance sheet test — no org';
    RETURN;
  END IF;

  SELECT COALESCE(SUM(jl.debit - jl.credit), 0) INTO v_assets
  FROM public.journal_lines jl
  JOIN public.accounts a ON a.id = jl.account_id
  JOIN public.journal_entries je ON je.id = jl.journal_entry_id
  WHERE jl.organization_id = v_org_id AND a.account_type = 'asset' AND je.status = 'posted';

  SELECT COALESCE(SUM(jl.credit - jl.debit), 0) INTO v_liabilities
  FROM public.journal_lines jl
  JOIN public.accounts a ON a.id = jl.account_id
  JOIN public.journal_entries je ON je.id = jl.journal_entry_id
  WHERE jl.organization_id = v_org_id AND a.account_type = 'liability' AND je.status = 'posted';

  SELECT COALESCE(SUM(jl.credit - jl.debit), 0) INTO v_equity
  FROM public.journal_lines jl
  JOIN public.accounts a ON a.id = jl.account_id
  JOIN public.journal_entries je ON je.id = jl.journal_entry_id
  WHERE jl.organization_id = v_org_id AND a.account_type = 'equity' AND je.status = 'posted';

  SELECT COALESCE(SUM(jl.credit - jl.debit), 0) INTO v_revenue
  FROM public.journal_lines jl
  JOIN public.accounts a ON a.id = jl.account_id
  JOIN public.journal_entries je ON je.id = jl.journal_entry_id
  WHERE jl.organization_id = v_org_id AND a.account_type = 'revenue' AND je.status = 'posted';

  SELECT COALESCE(SUM(jl.debit - jl.credit), 0) INTO v_expenses
  FROM public.journal_lines jl
  JOIN public.accounts a ON a.id = jl.account_id
  JOIN public.journal_entries je ON je.id = jl.journal_entry_id
  WHERE jl.organization_id = v_org_id
    AND a.account_type IN ('expense', 'cogs', 'other_expense')
    AND je.status = 'posted';

  v_balance_diff := ABS(v_assets - (v_liabilities + v_equity + v_revenue - v_expenses));

  PERFORM public._test_assert(
    'BALANCE: A = L + E + R - X',
    v_balance_diff < 0.01,
    'Diff: ' || v_diff || ' (A:' || v_assets || ' L:' || v_liabilities ||
    ' E:' || v_equity || ' R:' || v_revenue || ' X:' || v_expenses || ')'
  );
END $$;


-- Cleanup
DROP FUNCTION IF EXISTS public._test_assert(TEXT, BOOLEAN, TEXT);

RAISE NOTICE '=== P0 Critical Fix Tests Complete ===';
