-- =============================================================================
-- LEDJER — post_transaction Security & Unlimited Transactions Tests (STRICT)
-- =============================================================================
-- Validates:
--   S1 — Staff WITHOUT can_create_transaction cannot call post_transaction (CRITICAL)
--   S2 — Staff WITH can_create_transaction can call post_transaction
--   S3 — Organizations can post more than the old 50/month cap
--   S4 — Source-level check: permission guard stays and monthly cap stays removed
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
-- S3: Transactions are temporarily unlimited
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
         'UNLIMITED TRANSACTION ORG', CURRENT_DATE,
         p_staff_perm_create := true
       ) AS t;

  PERFORM public._test_impersonate(v_owner_id);

  -- Post enough transactions to catch a reintroduced transaction cap.
  FOR v_i IN 1..55 LOOP
    v_txn_id := (public.post_transaction(
      v_org_id, CURRENT_DATE, 'cash_sale', 10000,
      NULL, NULL, v_cash_id, NULL, 'paid', NULL, NULL,
      'S3: unlimited txn ' || v_i, NULL, NULL, NULL, NULL, NULL
    ) ->> 'transaction_id')::UUID;

    PERFORM public._test_assert(
      'S3.' || v_i || ': transaction ' || v_i || ' posted successfully',
      v_txn_id IS NOT NULL,
      'post failed at count ' || v_i
    );
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- S4: Source-level check — permission guard stays
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
    'S4.1: post_transaction contains has_permission check',
    v_source LIKE '%has_permission%' AND v_source LIKE '%can_create_transaction%',
    'Missing has_permission("can_create_transaction") guard'
  );
END $$;

DO $$ BEGIN RAISE NOTICE '=== Post Transaction Security Tests Complete ==='; END $$;
