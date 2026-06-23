-- =============================================================================
-- LEDJER — Opening Balance Guard Behavioral Tests
-- =============================================================================
-- Behavioral tests for the opening-balance guards:
--   1. post_transaction MUST reject opening_cash_balance / opening_receivable_balance /
--      opening_payable_balance — regardless of caller.
--   2. post_opening_balance succeeds during onboarding/in_progress for a cash/bank
--      account, then fails:
--      - After onboarding_status = 'completed'.
--      - After at least one normal (non-opening) transaction exists.
--
-- Catches regression classes:
--   - Accidental removal of the guard in post_transaction.
--   - post_opening_balance being callable after the books are open.
--   - post_opening_balance missing the owner-role or normal-tx check.
--
-- STRICT MODE: every assertion uses _test_assert (RAISE EXCEPTION on FAIL).
-- ============================================================================

\i supabase/tests/_test_helpers.sql

-- ═══════════════════════════════════════════════════════════════════
-- PART A: post_transaction rejects every opening_* type
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_owner_id   UUID;
  v_staff_id   UUID;
  v_org_id     UUID;
  v_cash_id    UUID;
  v_pay_id     UUID;
  v_rev_id     UUID;

  v_err         TEXT;
  v_type        TEXT;
  v_types_checked INTEGER := 0;
BEGIN
  SELECT t.out_owner_user_id, t.out_staff_user_id, t.out_organization_id,
         t.out_cash_account_id, t.out_payable_account_id, t.out_revenue_account_id
    INTO v_owner_id, v_staff_id, v_org_id, v_cash_id, v_pay_id, v_rev_id
  FROM public._test_create_org_with_users('OPENING GUARD ORG', CURRENT_DATE) AS t;

  IF v_cash_id IS NULL OR v_pay_id IS NULL THEN
    PERFORM public._test_fail('SETUP.A', 'default cash/payable accounts missing');
  END IF;

  PERFORM public._test_impersonate(v_owner_id);

  -- ── A1: opening_cash_balance rejected
  BEGIN
    PERFORM public.post_transaction(
      v_org_id, CURRENT_DATE, 'opening_cash_balance', 1000000,
      NULL, NULL, v_cash_id, NULL, 'paid', NULL, NULL,
      'should fail', NULL, NULL, NULL, NULL, NULL
    );
    PERFORM public._test_fail('OG.A1', 'post_transaction did not raise for opening_cash_balance');
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    PERFORM public._test_assert(
      'OG.A1: post_transaction rejects opening_cash_balance',
      v_err ILIKE '%saldo awal%' OR v_err ILIKE '%opening%',
      format('expected opening-balance error, got: %s', v_err)
    );
  END;
  v_types_checked := v_types_checked + 1;

  -- ── A2: opening_receivable_balance rejected
  BEGIN
    PERFORM public.post_transaction(
      v_org_id, CURRENT_DATE, 'opening_receivable_balance', 1000000,
      NULL, NULL, NULL, NULL, 'paid', NULL, NULL,
      'should fail', NULL, NULL, NULL, NULL, NULL
    );
    PERFORM public._test_fail('OG.A2', 'post_transaction did not raise for opening_receivable_balance');
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    PERFORM public._test_assert(
      'OG.A2: post_transaction rejects opening_receivable_balance',
      v_err ILIKE '%saldo awal%' OR v_err ILIKE '%opening%',
      format('expected opening-balance error, got: %s', v_err)
    );
  END;
  v_types_checked := v_types_checked + 1;

  -- ── A3: opening_payable_balance rejected
  BEGIN
    PERFORM public.post_transaction(
      v_org_id, CURRENT_DATE, 'opening_payable_balance', 1000000,
      NULL, NULL, NULL, NULL, 'paid', NULL, NULL,
      'should fail', NULL, NULL, NULL, NULL, NULL
    );
    PERFORM public._test_fail('OG.A3', 'post_transaction did not raise for opening_payable_balance');
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    PERFORM public._test_assert(
      'OG.A3: post_transaction rejects opening_payable_balance',
      v_err ILIKE '%saldo awal%' OR v_err ILIKE '%opening%',
      format('expected opening-balance error, got: %s', v_err)
    );
  END;
  v_types_checked := v_types_checked + 1;

  PERFORM public._test_assert(
    'OG.A4: all three opening_* types were tested',
    v_types_checked = 3,
    format('only %s/3 types tested', v_types_checked)
  );
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- PART B: post_opening_balance WORKS during in_progress
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_owner_id   UUID;
  v_staff_id   UUID;
  v_org_id     UUID;
  v_cash_id    UUID;
  v_pay_id     UUID;
  v_rev_id     UUID;

  v_result     JSONB;
  v_txn_count_before INTEGER;
  v_txn_count_after  INTEGER;
BEGIN
  SELECT t.out_owner_user_id, t.out_staff_user_id, t.out_organization_id,
         t.out_cash_account_id, t.out_payable_account_id, t.out_revenue_account_id
    INTO v_owner_id, v_staff_id, v_org_id, v_cash_id, v_pay_id, v_rev_id
  FROM public._test_create_org_with_users('OPENING IN-PROGRESS ORG', CURRENT_DATE) AS t;

  PERFORM public._test_impersonate(v_owner_id);

  -- Count opening transactions before
  SELECT COUNT(*) INTO v_txn_count_before
  FROM public.transactions
  WHERE organization_id = v_org_id AND transaction_type LIKE 'opening_%';

  -- Should work — org is in_progress, no normal txns yet
  BEGIN
    v_result := public.post_opening_balance(
      v_org_id, v_cash_id, 1500000,
      'Saldo awal kas', CURRENT_DATE
    );
  EXCEPTION WHEN OTHERS THEN
    PERFORM public._test_fail('OG.B1',
      format('post_opening_balance should work in in_progress with no normal txns, but raised: %s', SQLERRM));
  END;

  PERFORM public._test_assert(
    'OG.B1: post_opening_balance returns success=true in in_progress',
    (v_result ->> 'success')::BOOLEAN = true,
    format('result was: %s', v_result::TEXT)
  );

  SELECT COUNT(*) INTO v_txn_count_after
  FROM public.transactions
  WHERE organization_id = v_org_id AND transaction_type LIKE 'opening_%';

  PERFORM public._test_assert(
    'OG.B2: post_opening_balance inserted one opening transaction',
    v_txn_count_after = v_txn_count_before + 1,
    format('count went from %s to %s', v_txn_count_before, v_txn_count_after)
  );

  -- Verify the cash account balance increased by 1,500,000
  PERFORM public._test_assert_eq_numeric(
    'OG.B3: cash balance after post_opening_balance = 1,500,000',
    public.get_account_balance(v_cash_id, NULL), 1500000);
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- PART C: post_opening_balance FAILS after onboarding_status = 'completed'
--         (verified independently from the normal-txn check)
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_owner_id   UUID;
  v_staff_id   UUID;
  v_org_id     UUID;
  v_cash_id    UUID;
  v_pay_id     UUID;
  v_rev_id     UUID;

  v_err         TEXT;
BEGIN
  SELECT t.out_owner_user_id, t.out_staff_user_id, t.out_organization_id,
         t.out_cash_account_id, t.out_payable_account_id, t.out_revenue_account_id
    INTO v_owner_id, v_staff_id, v_org_id, v_cash_id, v_pay_id, v_rev_id
  FROM public._test_create_org_with_users('OPENING COMPLETED ORG', CURRENT_DATE) AS t;

  PERFORM public._test_impersonate(v_owner_id);

  -- Flip onboarding_status to 'completed' WITHOUT posting any transaction yet.
  UPDATE public.organizations
  SET onboarding_status = 'completed'
  WHERE id = v_org_id;

  BEGIN
    PERFORM public.post_opening_balance(
      v_org_id, v_cash_id, 1500000,
      'Harus ditolak setelah onboarding selesai', CURRENT_DATE
    );
    PERFORM public._test_fail('OG.C1', 'post_opening_balance did NOT reject when onboarding_status=completed');
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    PERFORM public._test_assert(
      'OG.C1: post_opening_balance rejected when onboarding_status=completed',
      v_err ILIKE '%saldo awal%' OR v_err ILIKE '%opening%' OR v_err ILIKE '%onboarding%',
      format('expected onboarding-rejection error, got: %s', v_err)
    );
  END;
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- PART C2: post_opening_balance FAILS when a normal (non-opening)
--          transaction already exists, even if onboarding_status is
--          still 'in_progress'. Verifies the second guard independently.
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_owner_id   UUID;
  v_staff_id   UUID;
  v_org_id     UUID;
  v_cash_id    UUID;
  v_pay_id     UUID;
  v_rev_id     UUID;

  v_err         TEXT;
BEGIN
  SELECT t.out_owner_user_id, t.out_staff_user_id, t.out_organization_id,
         t.out_cash_account_id, t.out_payable_account_id, t.out_revenue_account_id
    INTO v_owner_id, v_staff_id, v_org_id, v_cash_id, v_pay_id, v_rev_id
  FROM public._test_create_org_with_users('OPENING NORMAL-TXN ORG', CURRENT_DATE) AS t;

  PERFORM public._test_impersonate(v_owner_id);

  -- Post one normal transaction (do not flip onboarding_status).
  PERFORM public.post_transaction(
    v_org_id, CURRENT_DATE, 'cash_sale', 100000,
    NULL, NULL, v_cash_id, NULL, 'paid', NULL, NULL,
    'Penjualan tunai normal', NULL, NULL, NULL, NULL, NULL
  );

  -- Now post_opening_balance must reject because of the normal-txn guard.
  BEGIN
    PERFORM public.post_opening_balance(
      v_org_id, v_cash_id, 999999,
      'Harus ditolak setelah ada transaksi normal', CURRENT_DATE
    );
    PERFORM public._test_fail('OG.C2', 'post_opening_balance did NOT reject after normal transaction');
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    PERFORM public._test_assert(
      'OG.C2: post_opening_balance rejected after a normal transaction exists',
      v_err ILIKE '%saldo awal%' OR v_err ILIKE '%opening%' OR v_err ILIKE '%transaksi%',
      format('expected normal-txn rejection, got: %s', v_err)
    );
  END;
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- PART D: post_opening_balance FAILS when called by non-owner
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_owner_id   UUID;
  v_staff_id   UUID;
  v_org_id     UUID;
  v_cash_id    UUID;
  v_pay_id     UUID;
  v_rev_id     UUID;
  v_err        TEXT;
BEGIN
  -- Create org with staff (no perms for opening_balance by default)
  SELECT t.out_owner_user_id, t.out_staff_user_id, t.out_organization_id,
         t.out_cash_account_id, t.out_payable_account_id, t.out_revenue_account_id
    INTO v_owner_id, v_staff_id, v_org_id, v_cash_id, v_pay_id, v_rev_id
  FROM public._test_create_org_with_users('OPENING STAFF ORG', CURRENT_DATE) AS t;

  -- Impersonate staff
  PERFORM public._test_impersonate(v_staff_id);

  BEGIN
    PERFORM public.post_opening_balance(
      v_org_id, v_cash_id, 100000,
      'Staff coba buka saldo awal', CURRENT_DATE
    );
    PERFORM public._test_fail('OG.D1', 'staff should NOT be able to call post_opening_balance');
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    PERFORM public._test_assert(
      'OG.D1: post_opening_balance rejected non-owner staff',
      v_err ILIKE '%pemilik%' OR v_err ILIKE '%owner%' OR v_err ILIKE '%hak%' OR v_err ILIKE '%izin%',
      format('expected owner-permission error, got: %s', v_err)
    );
  END;
END $$;

-- Cleanup

DO $$ BEGIN RAISE NOTICE '=== Opening Balance Guard Tests Complete ==='; END $$;
