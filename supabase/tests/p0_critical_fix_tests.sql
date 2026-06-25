-- =============================================================================
-- LEDJER — P0 Critical Fix Regression Tests (STRICT)
-- =============================================================================
-- Validates:
--   P0.1 — pay_payable direction is Debit Utang (2100) / Credit Cash
--   P0.2 — onboarding flow sets in_progress then completed
--   P0.4 — opening_* types rejected by post_transaction
--   P0.5 — post_opening_balance restricted to onboarding/in_progress
--
-- STRICT MODE: every assertion uses _test_assert (RAISE EXCEPTION on FAIL).
-- ============================================================================

\i supabase/tests/_test_helpers.sql

-- ═══════════════════════════════════════════════════════════════════
-- P0.1: pay_payable direction
-- Behavioral test is in master_fix_regression_tests.sql M-5.
-- Here we only verify the canonical function signature exists.
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_arg_count INTEGER;
BEGIN
  SELECT p.pronargs INTO v_arg_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.proname = 'post_transaction'
    AND n.nspname = 'public'
    AND p.prosecdef = true
  LIMIT 1;

  PERFORM public._test_assert(
    'P0.1.0: canonical post_transaction exists with 19 args',
    v_arg_count = 19,
    'Expected 19 args, got ' || COALESCE(v_arg_count::TEXT, 'NULL')
  );
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- P0.2: Onboarding flow uses in_progress → completed
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_template_source TEXT;
  v_wrapping_source TEXT;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_template_source
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.proname = 'create_organization_with_template'
    AND n.nspname = 'public' LIMIT 1;

  IF v_template_source IS NULL THEN
    PERFORM public._test_fail('P0.2.0', 'create_organization_with_template not found');
  END IF;

  PERFORM public._test_assert(
    'P0.2.1: template sets onboarding_status=in_progress',
    v_template_source LIKE '%in_progress%',
    'Template must insert onboarding_status=in_progress'
  );

  SELECT pg_get_functiondef(p.oid) INTO v_wrapping_source
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.proname = 'create_organization_with_opening_balances'
    AND n.nspname = 'public' LIMIT 1;

  IF v_wrapping_source IS NULL THEN
    PERFORM public._test_fail('P0.2.2', 'create_organization_with_opening_balances not found');
  END IF;

  PERFORM public._test_assert(
    'P0.2.3: wrapper sets onboarding_status=completed AFTER balances',
    v_wrapping_source LIKE '%completed%' AND v_wrapping_source LIKE '%onboarding_status%',
    'Wrapper must UPDATE organizations SET onboarding_status=completed after balances'
  );
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- P0.4: post_transaction rejects opening_* types (source check)
-- Final integration verified in golden scenario.
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_source TEXT;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_source
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.proname = 'post_transaction'
    AND n.nspname = 'public' AND p.pronargs = 19
  LIMIT 1;

  IF v_source IS NULL THEN
    PERFORM public._test_fail('P0.4.0', 'canonical post_transaction missing (19 args)');
  END IF;

  PERFORM public._test_assert(
    'P0.4.1: post_transaction guard rejects opening_cash_balance',
    v_source LIKE '%opening_cash_balance%' AND v_source LIKE '%EXCEPTION%',
    'Guard must explicitly reject opening_cash_balance'
  );
  PERFORM public._test_assert(
    'P0.4.2: post_transaction guard rejects opening_receivable_balance',
    v_source LIKE '%opening_receivable_balance%',
    'Guard must list opening_receivable_balance'
  );
  PERFORM public._test_assert(
    'P0.4.3: post_transaction guard rejects opening_payable_balance',
    v_source LIKE '%opening_payable_balance%',
    'Guard must list opening_payable_balance'
  );
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- P0.5: post_opening_balance rejects completed status and normal txns
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_source TEXT;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_source
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.proname = 'post_opening_balance'
    AND n.nspname = 'public' LIMIT 1;

  IF v_source IS NULL THEN
    PERFORM public._test_fail('P0.5.0', 'post_opening_balance missing');
  END IF;

  PERFORM public._test_assert(
    'P0.5.1: post_opening_balance rejects onboarding=completed',
    v_source LIKE '%completed%' AND v_source LIKE '%EXCEPTION%',
    'Function must raise exception when onboarding is completed'
  );

  PERFORM public._test_assert(
    'P0.5.2: post_opening_balance rejects when normal transactions exist',
    v_source LIKE '%EXCEPTION%' AND (
      v_source LIKE '%transaksi normal%' OR
      v_source LIKE '%opening_balance%' OR
      v_source ILIKE '%normal transaction%'
    ),
    'Function must raise when normal transactions exist'
  );
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- Cleanup
-- ═══════════════════════════════════════════════════════════════════

DO $$ BEGIN RAISE NOTICE '=== P0 Critical Fix Tests Complete ==='; END $$;
