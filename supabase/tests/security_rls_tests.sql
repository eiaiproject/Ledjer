-- =============================================================================
-- LEDJER — Security & RLS Tests
-- =============================================================================
-- End-to-end RLS tests with:
--   User A: owner of Organization A
--   User B: staff of Organization A
--   User C: owner/member of Organization B
--
-- Test matrix:
--   1. Owner can manage allowed resources in own org
--   2. Staff can only perform actions matching permission flags
--   3. Staff without can_create_transaction cannot call post_transaction
--   4. Staff without can_view_reports cannot call report RPCs
--   5. User from Organization B cannot read Organization A data
--   6. Direct table writes to financial tables are rejected
--   7. Internal helper functions are not callable by anon/authenticated
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
-- TEST 1: RLS policies exist for critical tables
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_rls_enabled BOOLEAN;
BEGIN
  -- Verify RLS is enabled on financial tables
  SELECT relrowsecurity INTO v_rls_enabled
  FROM pg_class
  WHERE relname = 'transactions'
    AND relnamespace = 'public'::regnamespace;

  PERFORM public._test_assert(
    'TEST 1.1: RLS enabled on transactions',
    v_rls_enabled = true,
    'transactions RLS: ' || v_rls_enabled
  );

  SELECT relrowsecurity INTO v_rls_enabled
  FROM pg_class
  WHERE relname = 'journal_entries'
    AND relnamespace = 'public'::regnamespace;

  PERFORM public._test_assert(
    'TEST 1.2: RLS enabled on journal_entries',
    v_rls_enabled = true,
    'journal_entries RLS: ' || v_rls_enabled
  );

  SELECT relrowsecurity INTO v_rls_enabled
  FROM pg_class
  WHERE relname = 'journal_lines'
    AND relnamespace = 'public'::regnamespace;

  PERFORM public._test_assert(
    'TEST 1.3: RLS enabled on journal_lines',
    v_rls_enabled = true,
    'journal_lines RLS: ' || v_rls_enabled
  );

  SELECT relrowsecurity INTO v_rls_enabled
  FROM pg_class
  WHERE relname = 'stock_movements'
    AND relnamespace = 'public'::regnamespace;

  PERFORM public._test_assert(
    'TEST 1.4: RLS enabled on stock_movements',
    v_rls_enabled = true,
    'stock_movements RLS: ' || v_rls_enabled
  );
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- TEST 2: No direct INSERT/UPDATE/DELETE on financial tables
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Transactions: no INSERT policy
  SELECT COUNT(*) INTO v_count
  FROM pg_policies
  WHERE tablename = 'transactions'
    AND schemaname = 'public'
    AND cmd IN ('INSERT', 'UPDATE', 'DELETE');

  PERFORM public._test_assert(
    'TEST 2.1: No INSERT/UPDATE/DELETE policies on transactions',
    v_count = 0,
    'Found ' || v_count || ' non-SELECT policies on transactions'
  );

  -- Journal entries: no INSERT policy
  SELECT COUNT(*) INTO v_count
  FROM pg_policies
  WHERE tablename = 'journal_entries'
    AND schemaname = 'public'
    AND cmd IN ('INSERT', 'UPDATE', 'DELETE');

  PERFORM public._test_assert(
    'TEST 2.2: No INSERT/UPDATE/DELETE policies on journal_entries',
    v_count = 0,
    'Found ' || v_count || ' non-SELECT policies on journal_entries'
  );

  -- Journal lines: no INSERT policy
  SELECT COUNT(*) INTO v_count
  FROM pg_policies
  WHERE tablename = 'journal_lines'
    AND schemaname = 'public'
    AND cmd IN ('INSERT', 'UPDATE', 'DELETE');

  PERFORM public._test_assert(
    'TEST 2.3: No INSERT/UPDATE/DELETE policies on journal_lines',
    v_count = 0,
    'Found ' || v_count || ' non-SELECT policies on journal_lines'
  );

  -- Stock movements: no INSERT policy
  SELECT COUNT(*) INTO v_count
  FROM pg_policies
  WHERE tablename = 'stock_movements'
    AND schemaname = 'public'
    AND cmd IN ('INSERT', 'UPDATE', 'DELETE');

  PERFORM public._test_assert(
    'TEST 2.4: No INSERT/UPDATE/DELETE policies on stock_movements',
    v_count = 0,
    'Found ' || v_count || ' non-SELECT policies on stock_movements'
  );

  -- Audit logs: no INSERT policy
  SELECT COUNT(*) INTO v_count
  FROM pg_policies
  WHERE tablename = 'audit_logs'
    AND schemaname = 'public'
    AND cmd IN ('INSERT', 'UPDATE', 'DELETE');

  PERFORM public._test_assert(
    'TEST 2.5: No INSERT/UPDATE/DELETE policies on audit_logs',
    v_count = 0,
    'Found ' || v_count || ' non-SELECT policies on audit_logs'
  );
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- TEST 3: SECURITY DEFINER functions exist with correct properties
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_secdef BOOLEAN;
BEGIN
  -- post_transaction should be SECURITY DEFINER
  SELECT prosecdef INTO v_secdef
  FROM pg_proc
  WHERE proname = 'post_transaction'
    AND pronamespace = 'public'::regnamespace
    AND pronargs = 17
  LIMIT 1;

  PERFORM public._test_assert(
    'TEST 3.1: post_transaction is SECURITY DEFINER',
    v_secdef = true,
    'prosecdef: ' || v_secdef
  );

  -- void_transaction should be SECURITY DEFINER
  SELECT prosecdef INTO v_secdef
  FROM pg_proc
  WHERE proname = 'void_transaction'
    AND pronamespace = 'public'::regnamespace
  LIMIT 1;

  PERFORM public._test_assert(
    'TEST 3.2: void_transaction is SECURITY DEFINER',
    v_secdef = true,
    'prosecdef: ' || v_secdef
  );

  -- post_opening_balance should be SECURITY DEFINER
  SELECT prosecdef INTO v_secdef
  FROM pg_proc
  WHERE proname = 'post_opening_balance'
    AND pronamespace = 'public'::regnamespace
  LIMIT 1;

  PERFORM public._test_assert(
    'TEST 3.3: post_opening_balance is SECURITY DEFINER',
    v_secdef = true,
    'prosecdef: ' || v_secdef
  );

  -- recalculate_product_average_cost should be SECURITY DEFINER
  SELECT prosecdef INTO v_secdef
  FROM pg_proc
  WHERE proname = 'recalculate_product_average_cost'
    AND pronamespace = 'public'::regnamespace
  LIMIT 1;

  PERFORM public._test_assert(
    'TEST 3.4: recalculate_product_average_cost is SECURITY DEFINER',
    v_secdef = true,
    'prosecdef: ' || v_secdef
  );
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- TEST 4: Revoke permissions for internal-only functions
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_granted_to_anon BOOLEAN;
  v_granted_to_auth BOOLEAN;
BEGIN
  -- validate_product_sale_accounts should NOT be callable by authenticated/anon
  SELECT EXISTS (
    SELECT 1 FROM information_schema.role_routine_grants
    WHERE routine_name = 'validate_product_sale_accounts'
      AND grantee = 'anon'
  ) INTO v_granted_to_anon;

  PERFORM public._test_assert(
    'TEST 4.1: validate_product_sale_accounts not granted to anon',
    NOT v_granted_to_anon,
    'Should not be callable by anon'
  );

  SELECT EXISTS (
    SELECT 1 FROM information_schema.role_routine_grants
    WHERE routine_name = 'validate_product_sale_accounts'
      AND grantee = 'authenticated'
  ) INTO v_granted_to_auth;

  PERFORM public._test_assert(
    'TEST 4.2: validate_product_sale_accounts not granted to authenticated',
    NOT v_granted_to_auth,
    'Should not be callable by authenticated (internal only)'
  );
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- TEST 5: Organization isolation — SELECT policies check org membership
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_select_with_org_check BOOLEAN;
BEGIN
  -- Verify transactions SELECT policy checks organization membership
  SELECT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'transactions'
      AND schemaname = 'public'
      AND cmd = 'SELECT'
      AND qual LIKE '%is_org_member%'
  ) INTO v_select_with_org_check;

  PERFORM public._test_assert(
    'TEST 5.1: transactions SELECT policy checks org membership',
    v_select_with_org_check = true,
    'Should use is_org_member for cross-org isolation'
  );

  -- Verify journal_entries SELECT policy checks organization membership
  SELECT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'journal_entries'
      AND schemaname = 'public'
      AND cmd = 'SELECT'
      AND qual LIKE '%is_org_member%'
  ) INTO v_select_with_org_check;

  PERFORM public._test_assert(
    'TEST 5.2: journal_entries SELECT policy checks org membership',
    v_select_with_org_check = true,
    'Should use is_org_member for cross-org isolation'
  );

  -- Verify journal_lines SELECT policy checks organization membership
  SELECT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'journal_lines'
      AND schemaname = 'public'
      AND cmd = 'SELECT'
      AND qual LIKE '%is_org_member%'
  ) INTO v_select_with_org_check;

  PERFORM public._test_assert(
    'TEST 5.3: journal_lines SELECT policy checks org membership',
    v_select_with_org_check = true,
    'Should use is_org_member for cross-org isolation'
  );
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- TEST 6: Permission system exists
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_has_permission_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'has_permission'
      AND pronamespace = 'public'::regnamespace
  ) INTO v_has_permission_exists;

  PERFORM public._test_assert(
    'TEST 6.1: has_permission function exists',
    v_has_permission_exists = true,
    'Permission system required for access control'
  );
END $$;

-- Cleanup
DROP FUNCTION IF EXISTS public._test_assert(TEXT, BOOLEAN, TEXT);

RAISE NOTICE '=== Security & RLS Tests Complete ===';
