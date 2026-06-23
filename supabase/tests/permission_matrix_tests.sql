-- =============================================================================
-- LEDJER — Permission Matrix & Cross-Org RLS Tests (STRICT, behavioral)
-- =============================================================================
-- Behavioral tests that prove:
--   1. Staff permissions (can_create_transaction, can_view_reports,
--      can_void_transaction) are enforced server-side.
--   2. Cross-org isolation blocks SELECT, INSERT-via-RPC, and report RPCs
--      from a user who belongs only to Org B from reading or writing Org A's
--      data.
--
-- These tests do NOT inspect pg_policies; they actually call RPCs as
-- authenticated users and observe whether the expected success/failure
-- occurs. If someone weakens an RPC permission check, the test will fail.
--
-- STRICT MODE: every assertion uses _test_assert (RAISE EXCEPTION on FAIL).
-- ============================================================================

\i supabase/tests/_test_helpers.sql

-- ═══════════════════════════════════════════════════════════════════
-- TEST 1: Staff WITHOUT can_create_transaction cannot post a transaction
--         (Permission flag is server-side enforced.)
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
         'PERM STAFF NO-CREATE ORG', CURRENT_DATE,
         p_staff_perm_create := false,
         p_staff_perm_reports := true,
         p_staff_perm_void := false
       ) AS t;

  IF v_cash_id IS NULL THEN
    PERFORM public._test_fail('SETUP.P1', 'cash account missing');
  END IF;

  PERFORM public._test_impersonate(v_staff_id);

  BEGIN
    PERFORM public.post_transaction(
      v_org_id, CURRENT_DATE, 'cash_sale', 100000,
      NULL, NULL, v_cash_id, NULL, 'paid', NULL, NULL,
      'Staff tidak boleh post', NULL, NULL, NULL, NULL, NULL
    );
    PERFORM public._test_fail('PM1.1', 'staff without create permission posted a transaction');
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    PERFORM public._test_assert(
      'PM1.1: post_transaction rejected staff without can_create_transaction',
      v_err ILIKE '%izin%' OR v_err ILIKE '%permission%' OR v_err ILIKE '%hak%',
      format('expected permission error, got: %s', v_err)
    );
  END;

  -- Verify nothing was inserted (zero rows for this org/cash_sale/desc).
  PERFORM public._test_assert(
    'PM1.2: no transaction was inserted for the failed staff post',
    NOT EXISTS (
      SELECT 1 FROM public.transactions
      WHERE organization_id = v_org_id
        AND description = 'Staff tidak boleh post'
    ),
    'unexpected transaction row present'
  );
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- TEST 2: Staff WITH can_create_transaction CAN post a transaction
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
         'PERM STAFF CREATE ORG', CURRENT_DATE,
         p_staff_perm_create := true,
         p_staff_perm_reports := true,
         p_staff_perm_void := false
       ) AS t;

  PERFORM public._test_impersonate(v_staff_id);

  v_txn_id := (public.post_transaction(
    v_org_id, CURRENT_DATE, 'cash_sale', 50000,
    NULL, NULL, v_cash_id, NULL, 'paid', NULL, NULL,
    'Staff boleh post (ada izin)', NULL, NULL, NULL, NULL, NULL
  ) ->> 'transaction_id')::UUID;

  PERFORM public._test_assert(
    'PM2.1: post_transaction succeeded for staff with can_create_transaction',
    v_txn_id IS NOT NULL,
    'no transaction_id returned'
  );

  PERFORM public._test_assert(
    'PM2.2: the staff-posted transaction is stored in DB',
    EXISTS (
      SELECT 1 FROM public.transactions
      WHERE id = v_txn_id AND organization_id = v_org_id
    ),
    'transaction row not found'
  );
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- TEST 3: Staff WITHOUT can_view_reports cannot call get_trial_balance
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
         'PERM STAFF NO-REPORT ORG', CURRENT_DATE,
         p_staff_perm_create := true,
         p_staff_perm_reports := false,
         p_staff_perm_void := false
       ) AS t;

  PERFORM public._test_impersonate(v_staff_id);

  BEGIN
    PERFORM public.get_trial_balance(v_org_id, NULL);
    PERFORM public._test_fail('PM3.1', 'staff without can_view_reports called get_trial_balance');
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    PERFORM public._test_assert(
      'PM3.1: get_trial_balance rejected staff without can_view_reports',
      v_err ILIKE '%izin%' OR v_err ILIKE '%permission%' OR v_err ILIKE '%hak%',
      format('expected permission error, got: %s', v_err)
    );
  END;
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- TEST 4: Staff WITHOUT can_void_transaction cannot void a transaction
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
  v_err        TEXT;
BEGIN
  SELECT t.out_owner_user_id, t.out_staff_user_id, t.out_organization_id,
         t.out_cash_account_id, t.out_payable_account_id, t.out_revenue_account_id
    INTO v_owner_id, v_staff_id, v_org_id, v_cash_id, v_pay_id, v_rev_id
  FROM public._test_create_org_with_users(
         'PERM STAFF NO-VOID ORG', CURRENT_DATE,
         p_staff_perm_create := true,
         p_staff_perm_reports := true,
         p_staff_perm_void := false
       ) AS t;

  -- Owner posts a transaction first.
  PERFORM public._test_impersonate(v_owner_id);
  v_txn_id := (public.post_transaction(
    v_org_id, CURRENT_DATE, 'cash_sale', 75000,
    NULL, NULL, v_cash_id, NULL, 'paid', NULL, NULL,
    'Owner post untuk void test', NULL, NULL, NULL, NULL, NULL
  ) ->> 'transaction_id')::UUID;

  -- Now staff (no void perm) tries to void.
  PERFORM public._test_impersonate(v_staff_id);

  BEGIN
    PERFORM public.void_transaction(v_org_id, v_txn_id, 'Staff coba void', CURRENT_DATE);
    PERFORM public._test_fail('PM4.1', 'staff without can_void_transaction voided a transaction');
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    PERFORM public._test_assert(
      'PM4.1: void_transaction rejected staff without can_void_transaction',
      v_err ILIKE '%izin%' OR v_err ILIKE '%permission%' OR v_err ILIKE '%hak%',
      format('expected permission error, got: %s', v_err)
    );
  END;
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- TEST 5: Cross-org isolation — User C (org B owner) cannot read or
--         write Org A's data
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  -- Org A (the protected one)
  v_a_owner    UUID;
  v_a_staff    UUID;
  v_a_org      UUID;
  v_a_cash     UUID;
  v_a_pay      UUID;
  v_a_rev      UUID;

  -- User C: owner of Org B (separate from Org A)
  v_c_owner    UUID;
  v_c_staff    UUID;
  v_c_org      UUID;
  v_c_cash     UUID;
  v_c_pay      UUID;
  v_c_rev      UUID;

  v_count      INTEGER;
  v_err        TEXT;
BEGIN
  -- Org A
  SELECT t.out_owner_user_id, t.out_staff_user_id, t.out_organization_id,
         t.out_cash_account_id, t.out_payable_account_id, t.out_revenue_account_id
    INTO v_a_owner, v_a_staff, v_a_org, v_a_cash, v_a_pay, v_a_rev
  FROM public._test_create_org_with_users('ISOLATION ORG A', CURRENT_DATE) AS t;

  -- Org B (separate, with its own owner — that owner is User C)
  SELECT t.out_owner_user_id, t.out_staff_user_id, t.out_organization_id,
         t.out_cash_account_id, t.out_payable_account_id, t.out_revenue_account_id
    INTO v_c_owner, v_c_staff, v_c_org, v_c_cash, v_c_pay, v_c_rev
  FROM public._test_create_org_with_users('ISOLATION ORG B', CURRENT_DATE) AS t;

  IF v_a_cash IS NULL OR v_c_cash IS NULL THEN
    PERFORM public._test_fail('SETUP.P5', 'cash accounts missing in either org');
  END IF;

  -- Org A owner posts a private transaction.
  PERFORM public._test_impersonate(v_a_owner);
  PERFORM public.post_transaction(
    v_a_org, CURRENT_DATE, 'cash_sale', 999999,
    NULL, NULL, v_a_cash, NULL, 'paid', NULL, NULL,
    'Org A private data', NULL, NULL, NULL, NULL, NULL
  );

  -- Impersonate User C (only belongs to Org B)
  PERFORM public._test_impersonate(v_c_owner);

  -- ── 5.1: User C cannot see Org A's transactions via SELECT
  BEGIN
    SET LOCAL ROLE authenticated;
    SELECT COUNT(*) INTO v_count
    FROM public.transactions
    WHERE organization_id = v_a_org;
    RESET ROLE;
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
    v_count := 0;
  END;

  PERFORM public._test_assert(
    'PM5.1: cross-org SELECT blocked by RLS (User C sees 0 Org A transactions)',
    v_count = 0,
    format('User C unexpectedly saw %s Org A transactions', v_count)
  );

  -- ── 5.2: User C cannot post_transaction in Org A (no membership)
  BEGIN
    PERFORM public.post_transaction(
      v_a_org, CURRENT_DATE, 'cash_sale', 50000,
      NULL, NULL, v_a_cash, NULL, 'paid', NULL, NULL,
      'Cross-org post (should fail)', NULL, NULL, NULL, NULL, NULL
    );
    PERFORM public._test_fail('PM5.2', 'cross-org post_transaction succeeded');
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    PERFORM public._test_assert(
      'PM5.2: post_transaction rejected cross-org call (no membership)',
      v_err ILIKE '%bukan anggota%' OR v_err ILIKE '%not a member%' OR v_err ILIKE '%authentication%' OR v_err ILIKE '%autentikasi%',
      format('expected membership error, got: %s', v_err)
    );
  END;

  -- ── 5.3: User C cannot run a report RPC for Org A
  BEGIN
    PERFORM public.get_trial_balance(v_a_org, NULL);
    PERFORM public._test_fail('PM5.3', 'cross-org get_trial_balance succeeded');
  EXCEPTION WHEN OTHERS THEN
    v_err := SQLERRM;
    PERFORM public._test_assert(
      'PM5.3: get_trial_balance rejected cross-org call (no membership)',
      v_err ILIKE '%permission%' OR v_err ILIKE '%izin%' OR v_err ILIKE '%hak%',
      format('expected permission error, got: %s', v_err)
    );
  END;

  -- ── 5.4: Org A's private transaction is still intact
  PERFORM public._test_impersonate(v_a_owner);
  PERFORM public._test_assert(
    'PM5.4: Org A private transaction is intact after cross-org attempts',
    EXISTS (
      SELECT 1 FROM public.transactions
      WHERE organization_id = v_a_org
        AND description = 'Org A private data'
        AND amount = 999999
    ),
    'Org A private transaction missing or altered'
  );
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- TEST 6: Cross-org direct INSERT blocked (financial tables are RPC-only)
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_a_owner    UUID;
  v_a_staff    UUID;
  v_a_org      UUID;
  v_a_cash     UUID;
  v_a_pay      UUID;
  v_a_rev      UUID;

  v_c_owner    UUID;
  v_c_staff    UUID;
  v_c_org      UUID;
  v_c_cash     UUID;
  v_c_pay      UUID;
  v_c_rev      UUID;

  v_txn_no     TEXT := 'TX-XORG-' || substr(md5(random()::text), 1, 8);
  v_inserted   BOOLEAN := false;
  v_sqlstate   TEXT;
  v_sqlerrm    TEXT;
BEGIN
  SELECT t.out_owner_user_id, t.out_staff_user_id, t.out_organization_id,
         t.out_cash_account_id, t.out_payable_account_id, t.out_revenue_account_id
    INTO v_a_owner, v_a_staff, v_a_org, v_a_cash, v_a_pay, v_a_rev
  FROM public._test_create_org_with_users('DIRECT INSERT ORG A', CURRENT_DATE) AS t;

  SELECT t.out_owner_user_id, t.out_staff_user_id, t.out_organization_id,
         t.out_cash_account_id, t.out_payable_account_id, t.out_revenue_account_id
    INTO v_c_owner, v_c_staff, v_c_org, v_c_cash, v_c_pay, v_c_rev
  FROM public._test_create_org_with_users('DIRECT INSERT ORG B', CURRENT_DATE) AS t;

  PERFORM public._test_impersonate(v_c_owner);

  -- Impersonate cross-org and try to insert a fully-valid row.
  BEGIN
    SET LOCAL ROLE authenticated;
    INSERT INTO public.transactions (
      organization_id, transaction_number, transaction_date,
      transaction_type, amount, description, status,
      posted_at, posted_by, created_by
    )
    VALUES (
      v_a_org, v_txn_no, CURRENT_DATE,
      'cash_sale', 1, 'cross-org direct insert', 'posted',
      now(), v_c_owner, v_c_owner
    );
    v_inserted := true;
    RESET ROLE;
  EXCEPTION WHEN OTHERS THEN
    v_sqlstate := SQLSTATE;
    v_sqlerrm  := SQLERRM;
    RESET ROLE;
    v_inserted := false;
  END;

  PERFORM public._test_assert(
    'PM6.1: cross-org direct INSERT into transactions is rejected',
    NOT v_inserted,
    format('insert unexpectedly succeeded; SQLSTATE=%s, SQLERRM=%s',
           COALESCE(v_sqlstate, 'NULL'), COALESCE(v_sqlerrm, 'NULL'))
  );

  -- The failure must be an RLS/permission failure, NOT a NOT NULL or FK failure.
  PERFORM public._test_assert(
    'PM6.2: cross-org direct INSERT failure is RLS/permission-related',
    v_sqlstate IN ('42501', 'P0001') OR v_sqlerrm ILIKE '%row-level security%' OR v_sqlerrm ILIKE '%policy%' OR v_sqlerrm ILIKE '%permission%',
    format('unexpected SQLSTATE=%s, SQLERRM=%s', COALESCE(v_sqlstate, 'NULL'), COALESCE(v_sqlerrm, 'NULL'))
  );

  -- Verify no row was inserted.
  PERFORM public._test_assert(
    'PM6.3: no cross-org transaction row in Org A',
    NOT EXISTS (SELECT 1 FROM public.transactions WHERE transaction_number = v_txn_no),
    'cross-org row leaked'
  );
END $$;

-- Cleanup
SELECT public._test_cleanup();

DO $$ BEGIN RAISE NOTICE '=== Permission Matrix Tests Complete ==='; END $$;
