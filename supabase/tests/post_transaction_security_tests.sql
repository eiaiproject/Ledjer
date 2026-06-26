-- =============================================================================
-- LEDJER — post_transaction Security & Free Plan Limit Regression Tests (STRICT)
-- =============================================================================
-- Validates:
--   S1 — Staff WITHOUT can_create_transaction cannot call post_transaction (CRITICAL)
--   S2 — Staff WITH can_create_transaction can call post_transaction
--   S3 — Free plan 50/month limit enforced server-side
--   S4 — Transactions from previous months do NOT count toward current limit
--   S5 — Non-free plans are NOT blocked by free plan limit
--
-- STRICT MODE: every assertion uses _test_assert (RAISE EXCEPTION on FAIL).
-- ============================================================================

\i supabase/tests/_test_helpers.sql

-- ═══════════════════════════════════════════════════════════════════
-- S1: Staff WITHOUT can_create_transaction is rejected by post_transaction
-- This is the CRITICAL security fix — previously the check was missing.
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
  SELECT t.out_owner_user_id, t.out_staff_user_id, t.out_organization_id,
         t.out_cash_account_id, t.out_payable_account_id, t.out_revenue_account_id
    INTO v_owner_id, v_staff_id, v_org_id, v_cash_id, v_pay_id, v_rev_id
  FROM public._test_create_org_with_users(
         'SEC STAFF NO-CREATE ORG', CURRENT_DATE,
         p_staff_perm_create := false,
         p_staff_perm_reports := true,
         p_staff_perm_void := false
       ) AS t;

  PERFORM public._test_impersonate(v_staff_id);

  BEGIN
    PERFORM public.post_transaction(
      v_org_id, CURRENT_DATE, 'cash_sale', 50000,
      NULL, NULL, v_cash_id, NULL, 'paid', NULL, NULL,
      'S1: staff should be blocked', NULL, NULL, NULL, NULL, NULL
    );
    PERFORM public._test_fail('S1.1', 'staff without can_create_transaction called post_transaction successfully');
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    PERFORM public._test_assert(
      'S1.1: post_transaction rejected staff without can_create_transaction',
      v_err ILIKE '%izin%' OR v_err ILIKE '%permission%' OR v_err ILIKE '%hak%',
      format('expected permission error, got: %s', v_err)
    );
  END;

  -- Verify no transaction was created
  PERFORM public._test_assert(
    'S1.2: no transaction row inserted for blocked staff',
    NOT EXISTS (
      SELECT 1 FROM public.transactions
      WHERE organization_id = v_org_id AND description = 'S1: staff should be blocked'
    ),
    'unexpected transaction row present'
  );
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- S2: Staff WITH can_create_transaction CAN post
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_owner_id   UUID;
  v_staff_id   UUID;
  v_org_id     UUID;
  v_cash_id    UUID;
  v_pay_id     UUID;
  v_rev_id     UUID;
  v_txn_id     UUID;
BEGIN
  SELECT t.out_owner_user_id, t.out_staff_user_id, t.out_organization_id,
         t.out_cash_account_id, t.out_payable_account_id, t.out_revenue_account_id
    INTO v_owner_id, v_staff_id, v_org_id, v_cash_id, v_pay_id, v_rev_id
  FROM public._test_create_org_with_users(
         'SEC STAFF CREATE ORG', CURRENT_DATE,
         p_staff_perm_create := true,
         p_staff_perm_reports := true,
         p_staff_perm_void := false
       ) AS t;

  PERFORM public._test_impersonate(v_staff_id);

  v_txn_id := (public.post_transaction(
    v_org_id, CURRENT_DATE, 'cash_sale', 75000,
    NULL, NULL, v_cash_id, NULL, 'paid', NULL, NULL,
    'S2: staff with perm posts OK', NULL, NULL, NULL, NULL, NULL
  ) ->> 'transaction_id')::UUID;

  PERFORM public._test_assert(
    'S2.1: post_transaction succeeded for staff with can_create_transaction',
    v_txn_id IS NOT NULL,
    'no transaction_id returned'
  );

  PERFORM public._test_assert(
    'S2.2: transaction exists in DB',
    EXISTS (
      SELECT 1 FROM public.transactions
      WHERE id = v_txn_id AND organization_id = v_org_id
    ),
    'transaction row not found'
  );
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- S3: Free plan 50/month limit — block at 50
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_owner_id   UUID;
  v_staff_id   UUID;
  v_org_id     UUID;
  v_cash_id    UUID;
  v_pay_id     UUID;
  v_rev_id     UUID;
  v_i          INTEGER;
  v_err        TEXT;
  v_txn_id     UUID;
BEGIN
  SELECT t.out_owner_user_id, t.out_staff_user_id, t.out_organization_id,
         t.out_cash_account_id, t.out_payable_account_id, t.out_revenue_account_id
    INTO v_owner_id, v_staff_id, v_org_id, v_cash_id, v_pay_id, v_rev_id
  FROM public._test_create_org_with_users(
         'FREE LIMIT ORG', CURRENT_DATE,
         p_staff_perm_create := true
       ) AS t;

  -- Set org to free plan
  UPDATE public.organizations SET current_plan = 'free' WHERE id = v_org_id;

  PERFORM public._test_impersonate(v_owner_id);

  -- Post 49 transactions (should all succeed)
  FOR v_i IN 1..49 LOOP
    v_txn_id := (public.post_transaction(
      v_org_id, CURRENT_DATE, 'cash_sale', 10000,
      NULL, NULL, v_cash_id, NULL, 'paid', NULL, NULL,
      'S3: free limit txn ' || v_i, NULL, NULL, NULL, NULL, NULL
    ) ->> 'transaction_id')::UUID;

    PERFORM public._test_assert(
      'S3.' || v_i || ': transaction ' || v_i || ' posted successfully',
      v_txn_id IS NOT NULL,
      'post failed at count ' || v_i
    );
  END LOOP;

  -- 50th transaction should be BLOCKED
  BEGIN
    PERFORM public.post_transaction(
      v_org_id, CURRENT_DATE, 'cash_sale', 10000,
      NULL, NULL, v_cash_id, NULL, 'paid', NULL, NULL,
      'S3: this should be blocked', NULL, NULL, NULL, NULL, NULL
    );
    PERFORM public._test_fail('S3.50', '50th transaction on free plan was not blocked');
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    PERFORM public._test_assert(
      'S3.50: free plan blocks at 50 transactions',
      v_err ILIKE '%50%' OR v_err ILIKE '%batas%' OR v_err ILIKE '%limit%' OR v_err ILIKE '%tercapai%',
      format('expected limit error, got: %s', v_err)
    );
  END;

  -- Verify no 50th transaction was created
  PERFORM public._test_assert(
    'S3.51: no 50th transaction row exists',
    NOT EXISTS (
      SELECT 1 FROM public.transactions
      WHERE organization_id = v_org_id AND description = 'S3: this should be blocked'
    ),
    '50th transaction was inserted despite limit'
  );
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- S4: Previous month transactions do NOT count toward current limit
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_owner_id   UUID;
  v_staff_id   UUID;
  v_org_id     UUID;
  v_cash_id    UUID;
  v_pay_id     UUID;
  v_rev_id     UUID;
  v_txn_id     UUID;
  v_prev_month DATE;
BEGIN
  SELECT t.out_owner_user_id, t.out_staff_user_id, t.out_organization_id,
         t.out_cash_account_id, t.out_payable_account_id, t.out_revenue_account_id
    INTO v_owner_id, v_staff_id, v_org_id, v_cash_id, v_pay_id, v_rev_id
  FROM public._test_create_org_with_users(
         'FREE PREV MONTH ORG', (CURRENT_DATE - INTERVAL '60 days')::DATE,
         p_staff_perm_create := true
       ) AS t;

  -- Set org to free plan
  UPDATE public.organizations SET current_plan = 'free' WHERE id = v_org_id;

  v_prev_month := date_trunc('month', CURRENT_DATE)::DATE - 1;

  PERFORM public._test_impersonate(v_owner_id);

  -- Insert 49 transactions in the previous month directly (bypass RPC for speed)
  INSERT INTO public.transactions (
    organization_id, transaction_number, transaction_date,
    transaction_type, amount, status, posted_at, posted_by, created_by,
    description, created_at
  )
  SELECT
    v_org_id,
    'TX-PREV-' || g::TEXT,
    v_prev_month,
    'cash_sale',
    10000,
    'posted',
    now(),
    v_owner_id,
    v_owner_id,
    'S4: prev month txn ' || g,
    (date_trunc('month', CURRENT_DATE) - INTERVAL '1 day')::TIMESTAMPTZ
  FROM generate_series(1, 49) g;

  -- Now post in current month — should succeed (prev month doesn't count)
  v_txn_id := (public.post_transaction(
    v_org_id, CURRENT_DATE, 'cash_sale', 10000,
    NULL, NULL, v_cash_id, NULL, 'paid', NULL, NULL,
    'S4: current month txn after prev month fill', NULL, NULL, NULL, NULL, NULL
  ) ->> 'transaction_id')::UUID;

  PERFORM public._test_assert(
    'S4.1: current month txn succeeds despite 49 prev month txns',
    v_txn_id IS NOT NULL,
    'post_transaction blocked — previous month transactions are counting'
  );
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- S5: Non-free plans are NOT blocked by the free plan limit
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_owner_id   UUID;
  v_staff_id   UUID;
  v_org_id     UUID;
  v_cash_id    UUID;
  v_pay_id     UUID;
  v_rev_id     UUID;
  v_txn_id     UUID;
  v_i          INTEGER;
BEGIN
  SELECT t.out_owner_user_id, t.out_staff_user_id, t.out_organization_id,
         t.out_cash_account_id, t.out_payable_account_id, t.out_revenue_account_id
    INTO v_owner_id, v_staff_id, v_org_id, v_cash_id, v_pay_id, v_rev_id
  FROM public._test_create_org_with_users(
         'PAID PLAN ORG', CURRENT_DATE,
         p_staff_perm_create := true
       ) AS t;

  -- Set org to paid plan (bypass protect_organization_billing_columns trigger)
  ALTER TABLE public.organizations DISABLE TRIGGER protect_organization_billing_trigger;
  UPDATE public.organizations SET current_plan = 'solo' WHERE id = v_org_id;
  ALTER TABLE public.organizations ENABLE TRIGGER protect_organization_billing_trigger;

  PERFORM public._test_impersonate(v_owner_id);

  -- Post 55 transactions — all should succeed on solo plan
  FOR v_i IN 1..55 LOOP
    v_txn_id := (public.post_transaction(
      v_org_id, CURRENT_DATE, 'cash_sale', 10000,
      NULL, NULL, v_cash_id, NULL, 'paid', NULL, NULL,
      'S5: paid plan txn ' || v_i, NULL, NULL, NULL, NULL, NULL
    ) ->> 'transaction_id')::UUID;

    PERFORM public._test_assert(
      'S5.' || v_i || ': paid plan txn ' || v_i || ' succeeds',
      v_txn_id IS NOT NULL,
      'paid plan blocked at count ' || v_i
    );
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- S6: Source-level check — post_transaction contains can_create_transaction guard
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

  PERFORM public._test_assert(
    'S6.1: post_transaction contains has_permission check',
    v_source LIKE '%has_permission%' AND v_source LIKE '%can_create_transaction%',
    'Missing has_permission("can_create_transaction") guard'
  );

  PERFORM public._test_assert(
    'S6.2: post_transaction free limit uses 50',
    v_source LIKE '%>= 50%' OR v_source LIKE '%>= 50 %',
    'Free plan limit should be 50'
  );

  PERFORM public._test_assert(
    'S6.3: post_transaction monthly limit uses date_trunc month window',
    v_source LIKE '%date_trunc%month%',
    'Monthly limit must use date_trunc(month) window'
  );
END $$;

DO $$ BEGIN RAISE NOTICE '=== Post Transaction Security Tests Complete ==='; END $$;
