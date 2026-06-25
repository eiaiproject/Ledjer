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

-- ═══════════════════════════════════════════════════════════════════
-- PART E: post_opening_balance supports AR (1200), AP (2100) and equity
--         (Modal 3100), each balanced against Saldo Awal (3200), and the
--         resulting balance sheet ties out (P2-1).
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_owner_id   UUID;
  v_staff_id   UUID;
  v_org_id     UUID;
  v_cash_id    UUID;
  v_pay_id     UUID;
  v_rev_id     UUID;

  v_ar_id      UUID;
  v_ap_id      UUID;
  v_modal_id   UUID;

  v_total_assets      NUMERIC;
  v_total_liabilities NUMERIC;
  v_total_equity      NUMERIC;
  v_unbalanced        INTEGER;
BEGIN
  SELECT t.out_owner_user_id, t.out_staff_user_id, t.out_organization_id,
         t.out_cash_account_id, t.out_payable_account_id, t.out_revenue_account_id
    INTO v_owner_id, v_staff_id, v_org_id, v_cash_id, v_pay_id, v_rev_id
  FROM public._test_create_org_with_users('OPENING AR-AP-EQUITY ORG', CURRENT_DATE) AS t;

  PERFORM public._test_impersonate(v_owner_id);

  SELECT id INTO v_ar_id    FROM public.accounts WHERE organization_id = v_org_id AND code = 1200 AND is_active = true;
  SELECT id INTO v_ap_id    FROM public.accounts WHERE organization_id = v_org_id AND code = 2100 AND is_active = true;
  SELECT id INTO v_modal_id FROM public.accounts WHERE organization_id = v_org_id AND code = 3100 AND is_active = true;

  IF v_ar_id IS NULL OR v_ap_id IS NULL OR v_modal_id IS NULL THEN
    PERFORM public._test_fail('SETUP.E', 'default AR(1200)/AP(2100)/Modal(3100) accounts missing');
  END IF;

  -- Opening cash, AR, AP and equity, all while org is still in_progress.
  PERFORM public.post_opening_balance(v_org_id, v_cash_id,  1000000, 'Saldo awal kas',     CURRENT_DATE);

  -- E1: opening AR posts a balanced journal
  PERFORM public.post_opening_balance(v_org_id, v_ar_id,     500000, 'Saldo awal piutang', CURRENT_DATE);
  PERFORM public._test_assert_eq_numeric(
    'OG.E1: AR (1200) balance = 500,000 after opening receivable',
    public.get_account_balance(v_ar_id, NULL), 500000);

  -- E2: opening AP posts a balanced journal (liability, normal credit)
  PERFORM public.post_opening_balance(v_org_id, v_ap_id,     300000, 'Saldo awal utang',   CURRENT_DATE);
  PERFORM public._test_assert_eq_numeric(
    'OG.E2: AP (2100) balance = 300,000 after opening payable',
    public.get_account_balance(v_ap_id, NULL), 300000);

  -- E3: opening equity (Modal 3100) posts a balanced journal
  PERFORM public.post_opening_balance(v_org_id, v_modal_id,  200000, 'Saldo awal modal',   CURRENT_DATE);
  PERFORM public._test_assert_eq_numeric(
    'OG.E3: Modal (3100) balance = 200,000 after opening equity',
    public.get_account_balance(v_modal_id, NULL), 200000);

  -- E4: every opening journal entry balances (Σdebit = Σcredit, penny-exact)
  SELECT COUNT(*) INTO v_unbalanced
  FROM (
    SELECT jl.journal_entry_id
    FROM public.journal_lines jl
    JOIN public.journal_entries je ON je.id = jl.journal_entry_id
    WHERE jl.organization_id = v_org_id AND je.status = 'posted'
    GROUP BY jl.journal_entry_id
    HAVING ABS(COALESCE(SUM(jl.debit), 0) - COALESCE(SUM(jl.credit), 0)) <> 0
  ) unbalanced_entries;

  PERFORM public._test_assert(
    'OG.E4: all opening journal entries balance',
    v_unbalanced = 0,
    format('%s unbalanced journal entries found', v_unbalanced)
  );

  -- E5: balance sheet ties out — assets = liabilities + equity
  SELECT COALESCE(SUM(jl.debit - jl.credit), 0) INTO v_total_assets
  FROM public.journal_lines jl
  JOIN public.accounts a ON a.id = jl.account_id
  JOIN public.journal_entries je ON je.id = jl.journal_entry_id
  WHERE jl.organization_id = v_org_id AND a.account_type = 'asset' AND je.status = 'posted';

  SELECT COALESCE(SUM(jl.credit - jl.debit), 0) INTO v_total_liabilities
  FROM public.journal_lines jl
  JOIN public.accounts a ON a.id = jl.account_id
  JOIN public.journal_entries je ON je.id = jl.journal_entry_id
  WHERE jl.organization_id = v_org_id AND a.account_type = 'liability' AND je.status = 'posted';

  SELECT COALESCE(SUM(jl.credit - jl.debit), 0) INTO v_total_equity
  FROM public.journal_lines jl
  JOIN public.accounts a ON a.id = jl.account_id
  JOIN public.journal_entries je ON je.id = jl.journal_entry_id
  WHERE jl.organization_id = v_org_id AND a.account_type = 'equity' AND je.status = 'posted';

  PERFORM public._test_assert_eq_numeric(
    'OG.E5: balance sheet ties out (assets = liabilities + equity)',
    v_total_assets, v_total_liabilities + v_total_equity);

  -- Sanity: assets = 1,000,000 cash + 500,000 AR = 1,500,000
  PERFORM public._test_assert_eq_numeric(
    'OG.E6: total assets = 1,500,000', v_total_assets, 1500000);
END $$;

-- Cleanup

DO $$ BEGIN RAISE NOTICE '=== Opening Balance Guard Tests Complete ==='; END $$;
