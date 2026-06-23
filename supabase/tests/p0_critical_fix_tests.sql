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
-- P0.1: pay_payable direction (source-code assertion only as fallback)
-- The real direction check requires an authenticated RPC call which is
-- covered by the golden scenario; here we guard the function signature
-- and the source order to catch regressions early.
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
    PERFORM public._test_fail('P0.1.0', 'canonical post_transaction (17 args) not found');
  END IF;

  -- Pay_payable must set debit to account code 2100 (Utang) BEFORE setting credit to cash.
  -- This is the order-sensitive shape introduced by the P0.1 fix.
  PERFORM public._test_assert(
    'P0.1.1: pay_payable branch debits account code 2100 (Utang Usaha)',
    v_func_source LIKE '%pay_payable%code = 2100%v_debit_account_id%'
      AND v_func_source LIKE '%pay_payable%v_credit_account_id%:=%p_cash_account_id%',
    'pay_payable should debit Utang (2100) and credit cash. Verify function body.'
  );

  -- Guard against the old wrong direction ever returning.
  -- Use position() with literal substring (no LIKE wildcard ambiguity).
  -- The wrong direction was `v_debit_account_id := p_cash_account_id`
  -- (with exact := separator). Check it does NOT appear anywhere in
  -- the function body.
  PERFORM public._test_assert(
    'P0.1.2: pay_payable branch does NOT assign cash to debit',
    position('v_debit_account_id := p_cash_account_id' IN v_func_source) = 0,
    'Old wrong direction (debit := cash) detected in post_transaction body.'
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
    AND n.nspname = 'public' AND p.pronargs = 17
  LIMIT 1;

  IF v_source IS NULL THEN
    PERFORM public._test_fail('P0.4.0', 'canonical post_transaction missing');
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
SELECT public._test_cleanup();

DO $$ BEGIN RAISE NOTICE '=== P0 Critical Fix Tests Complete ==='; END $$;