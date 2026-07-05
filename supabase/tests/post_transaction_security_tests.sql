-- =============================================================================
-- LEDJER — post_transaction Security & Unlimited Free Transactions Tests (STRICT)
-- =============================================================================
-- Validates:
--   S1 — Staff WITHOUT can_create_transaction cannot call post_transaction (CRITICAL)
--   S2 — Staff WITH can_create_transaction can call post_transaction
--   S3 — Free plan can post more than the old 50/month quota
--   S4 — Monthly usage still counts only current-month transactions
--   S5 — Non-free plans remain unlimited for transactions
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
-- S3: Free plan transactions are temporarily unlimited
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

  -- Post more than the old 50/month quota; all should succeed.
  FOR v_i IN 1..55 LOOP
    v_txn_id := (public.post_transaction(
      v_org_id, CURRENT_DATE, 'cash_sale', 10000,
      NULL, NULL, v_cash_id, NULL, 'paid', NULL, NULL,
      'S3: unlimited free txn ' || v_i, NULL, NULL, NULL, NULL, NULL
    ) ->> 'transaction_id')::UUID;

    PERFORM public._test_assert(
      'S3.' || v_i || ': transaction ' || v_i || ' posted successfully',
      v_txn_id IS NOT NULL,
      'post failed at count ' || v_i
    );
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- S4: Monthly usage reports current-month transactions only
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
  v_usage      JSONB;
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

  v_usage := public.get_monthly_usage(v_org_id);
  PERFORM public._test_assert(
    'S4.2: usage count ignores previous-month transactions',
    (v_usage->>'count')::INTEGER = 1,
    format('expected count 1, got: %s', v_usage::text)
  );

  PERFORM public._test_assert(
    'S4.3: usage reports unlimited transaction policy',
    (v_usage ? 'limit') AND (v_usage ? 'remaining') AND (v_usage->>'is_unlimited')::BOOLEAN = true
      AND jsonb_typeof(v_usage->'limit') = 'null'
      AND jsonb_typeof(v_usage->'remaining') = 'null',
    format('unexpected usage shape: %s', v_usage::text)
  );
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- S5: Non-free plans remain unlimited for transactions
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
-- S6: Source-level check — permission guard stays, quota guard is removed
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
    'S6.2: post_transaction no longer blocks free plan at 50',
    v_source NOT ILIKE '%Batas 50 transaksi%'
      AND v_source NOT ILIKE '%Free plan limit reached%'
      AND v_source NOT ILIKE '%v_txn_count >= 50%',
    'Found old free-plan transaction quota guard'
  );

  PERFORM public._test_assert(
    'S6.3: post_transaction documents temporary unlimited transaction policy',
    v_source ILIKE '%Transaction posting is unlimited for every plan%',
    'Missing temporary unlimited transaction policy comment'
  );
END $$;

DO $$ BEGIN RAISE NOTICE '=== Post Transaction Security Tests Complete ==='; END $$;
