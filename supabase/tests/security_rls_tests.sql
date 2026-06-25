-- =============================================================================
-- LEDJER — Security & RLS Tests (STRICT)
-- =============================================================================
-- End-to-end RLS tests with:
--   - System tables: RLS enabled, no client-writable policies on financial tables
--   - SECURITY DEFINER RPCs own all financial mutations
--   - Org isolation enforced by is_org_member()
--   - Internal helper functions are NOT exposed to anon/authenticated
--
-- This file raises EXCEPTION on any failure (so psql exits non-zero).
-- Run AFTER all migrations are applied.
-- =============================================================================

-- Load strict helpers
\i supabase/tests/_test_helpers.sql

-- ═══════════════════════════════════════════════════════════════════
-- TEST 1: RLS enabled on all financial tables
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_rls_enabled BOOLEAN;
BEGIN
  SELECT relrowsecurity INTO v_rls_enabled
  FROM pg_class WHERE relname = 'transactions' AND relnamespace = 'public'::regnamespace;
  PERFORM public._test_assert('RLS enabled on transactions', v_rls_enabled = true,
    'transactions.relrowsecurity=' || COALESCE(v_rls_enabled::TEXT, 'NULL'));

  SELECT relrowsecurity INTO v_rls_enabled
  FROM pg_class WHERE relname = 'journal_entries' AND relnamespace = 'public'::regnamespace;
  PERFORM public._test_assert('RLS enabled on journal_entries', v_rls_enabled = true,
    'journal_entries.relrowsecurity=' || COALESCE(v_rls_enabled::TEXT, 'NULL'));

  SELECT relrowsecurity INTO v_rls_enabled
  FROM pg_class WHERE relname = 'journal_lines' AND relnamespace = 'public'::regnamespace;
  PERFORM public._test_assert('RLS enabled on journal_lines', v_rls_enabled = true,
    'journal_lines.relrowsecurity=' || COALESCE(v_rls_enabled::TEXT, 'NULL'));

  SELECT relrowsecurity INTO v_rls_enabled
  FROM pg_class WHERE relname = 'stock_movements' AND relnamespace = 'public'::regnamespace;
  PERFORM public._test_assert('RLS enabled on stock_movements', v_rls_enabled = true,
    'stock_movements.relrowsecurity=' || COALESCE(v_rls_enabled::TEXT, 'NULL'));

  SELECT relrowsecurity INTO v_rls_enabled
  FROM pg_class WHERE relname = 'audit_logs' AND relnamespace = 'public'::regnamespace;
  PERFORM public._test_assert('RLS enabled on audit_logs', v_rls_enabled = true,
    'audit_logs.relrowsecurity=' || COALESCE(v_rls_enabled::TEXT, 'NULL'));
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- TEST 2: No INSERT/UPDATE/DELETE policies on financial tables
-- Direct client writes must be rejected; mutations flow through RPCs only.
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'transactions'
    AND cmd IN ('INSERT', 'UPDATE', 'DELETE');
  PERFORM public._test_assert('No INSERT/UPDATE/DELETE policies on transactions',
    v_count = 0, 'Found ' || v_count || ' policies');

  SELECT COUNT(*) INTO v_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'journal_entries'
    AND cmd IN ('INSERT', 'UPDATE', 'DELETE');
  PERFORM public._test_assert('No INSERT/UPDATE/DELETE policies on journal_entries',
    v_count = 0, 'Found ' || v_count || ' policies');

  SELECT COUNT(*) INTO v_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'journal_lines'
    AND cmd IN ('INSERT', 'UPDATE', 'DELETE');
  PERFORM public._test_assert('No INSERT/UPDATE/DELETE policies on journal_lines',
    v_count = 0, 'Found ' || v_count || ' policies');

  -- stock_movements: must not allow INSERT/UPDATE/DELETE from authenticated clients.
  -- We accept either ZERO policies OR a single explicit deny-all (WITH CHECK (false)).
  SELECT COUNT(*) INTO v_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'stock_movements'
    AND cmd = 'INSERT';
  PERFORM public._test_assert(
    'stock_movements has no client INSERT policy (Option A or B)',
    v_count = 0 OR (v_count = 1 AND EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = 'stock_movements'
        AND cmd = 'INSERT'
        AND with_check = 'false'
    )),
    'Found ' || v_count || ' INSERT policies; expected 0 or 1 deny-all policy'
  );

  SELECT COUNT(*) INTO v_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'stock_movements'
    AND cmd IN ('UPDATE', 'DELETE');
  PERFORM public._test_assert(
    'stock_movements has no UPDATE/DELETE policy',
    v_count = 0,
    'Found ' || v_count || ' UPDATE/DELETE policies'
  );

  SELECT COUNT(*) INTO v_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'audit_logs'
    AND cmd IN ('INSERT', 'UPDATE', 'DELETE');
  PERFORM public._test_assert('No INSERT/UPDATE/DELETE policies on audit_logs',
    v_count = 0, 'Found ' || v_count || ' policies');
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- TEST 3: All critical financial RPCs are SECURITY DEFINER
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_secdef BOOLEAN;
BEGIN
  SELECT prosecdef INTO v_secdef
  FROM pg_proc
  WHERE proname = 'post_transaction'
    AND pronamespace = 'public'::regnamespace
    AND pronargs = 19
  LIMIT 1;
  PERFORM public._test_assert('post_transaction is SECURITY DEFINER',
    v_secdef = true, 'prosecdef=' || COALESCE(v_secdef::TEXT, 'NULL'));

  SELECT prosecdef INTO v_secdef
  FROM pg_proc
  WHERE proname = 'void_transaction'
    AND pronamespace = 'public'::regnamespace
  LIMIT 1;
  PERFORM public._test_assert('void_transaction is SECURITY DEFINER',
    v_secdef = true, 'prosecdef=' || COALESCE(v_secdef::TEXT, 'NULL'));

  SELECT prosecdef INTO v_secdef
  FROM pg_proc
  WHERE proname = 'post_opening_balance'
    AND pronamespace = 'public'::regnamespace
  LIMIT 1;
  PERFORM public._test_assert('post_opening_balance is SECURITY DEFINER',
    v_secdef = true, 'prosecdef=' || COALESCE(v_secdef::TEXT, 'NULL'));

  SELECT prosecdef INTO v_secdef
  FROM pg_proc
  WHERE proname = 'recalculate_product_average_cost'
    AND pronamespace = 'public'::regnamespace
  LIMIT 1;
  PERFORM public._test_assert('recalculate_product_average_cost is SECURITY DEFINER',
    v_secdef = true, 'prosecdef=' || COALESCE(v_secdef::TEXT, 'NULL'));

  SELECT prosecdef INTO v_secdef
  FROM pg_proc
  WHERE proname = 'record_stock_movement'
    AND pronamespace = 'public'::regnamespace
  LIMIT 1;
  PERFORM public._test_assert('record_stock_movement is SECURITY DEFINER',
    v_secdef = true, 'prosecdef=' || COALESCE(v_secdef::TEXT, 'NULL'));
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- TEST 4: Internal-only helpers NOT granted to anon/authenticated
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_granted_to_anon BOOLEAN;
  v_granted_to_auth BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.role_routine_grants
    WHERE routine_schema = 'public'
      AND routine_name = 'validate_product_sale_accounts'
      AND grantee = 'anon'
  ) INTO v_granted_to_anon;
  PERFORM public._test_assert(
    'validate_product_sale_accounts not granted to anon',
    NOT v_granted_to_anon, 'Anon should not be able to call internal validator');

  SELECT EXISTS (
    SELECT 1 FROM information_schema.role_routine_grants
    WHERE routine_schema = 'public'
      AND routine_name = 'validate_product_sale_accounts'
      AND grantee = 'authenticated'
  ) INTO v_granted_to_auth;
  PERFORM public._test_assert(
    'validate_product_sale_accounts not granted to authenticated',
    NOT v_granted_to_auth, 'Authenticated clients must not call internal validator');

  -- recalculate_product_average_cost is internal too
  SELECT EXISTS (
    SELECT 1 FROM information_schema.role_routine_grants
    WHERE routine_schema = 'public'
      AND routine_name = 'recalculate_product_average_cost'
      AND grantee = 'authenticated'
  ) INTO v_granted_to_auth;
  PERFORM public._test_assert(
    'recalculate_product_average_cost not granted to authenticated',
    NOT v_granted_to_auth, 'Internal cost recalc must not be a public RPC');
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- TEST 3b: All SECURITY DEFINER functions have explicit SET search_path
-- SECURITY DEFINER functions must hard-set search_path to prevent
-- attacker-controlled search_path values (e.g., via CREATE SCHEMA)
-- from redirecting unqualified name resolution to attacker tables.
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_missing_count INTEGER;
  v_missing_names TEXT;
BEGIN
  SELECT COUNT(*), COALESCE(string_agg(p.proname, ', ' ORDER BY p.proname), '')
    INTO v_missing_count, v_missing_names
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prosecdef = true
    AND p.prokind = 'f'
    AND COALESCE(p.proconfig::text, '') NOT LIKE '%search_path%';

  PERFORM public._test_assert(
    'All SECURITY DEFINER functions declare SET search_path',
    v_missing_count = 0,
    'Missing search_path on: ' || v_missing_names
  );
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- TEST 5: Org isolation in SELECT policies
-- Accept either `is_org_member(...)` (membership check) or
-- `has_permission(..., 'can_view_reports')` (permission-gated read).
-- Both predicates block cross-org reads; either is acceptable.
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_has_isolation BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'transactions'
      AND cmd = 'SELECT'
      AND (qual LIKE '%is_org_member%' OR qual LIKE '%has_permission%')
  ) INTO v_has_isolation;
  PERFORM public._test_assert('transactions SELECT enforces org isolation',
    v_has_isolation = true, 'expected is_org_member or has_permission in SELECT policy');

  SELECT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'journal_entries'
      AND cmd = 'SELECT'
      AND (qual LIKE '%is_org_member%' OR qual LIKE '%has_permission%')
  ) INTO v_has_isolation;
  PERFORM public._test_assert('journal_entries SELECT enforces org isolation',
    v_has_isolation = true, 'expected is_org_member or has_permission in SELECT policy');

  SELECT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'journal_lines'
      AND cmd = 'SELECT'
      AND (qual LIKE '%is_org_member%' OR qual LIKE '%has_permission%')
  ) INTO v_has_isolation;
  PERFORM public._test_assert('journal_lines SELECT enforces org isolation',
    v_has_isolation = true, 'expected is_org_member or has_permission in SELECT policy');
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
    WHERE proname = 'has_permission' AND pronamespace = 'public'::regnamespace
  ) INTO v_has_permission_exists;
  PERFORM public._test_assert('has_permission function exists',
    v_has_permission_exists = true, 'permission system required');
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- TEST 7: get_monthly_usage function privileges
-- Must NOT be callable by anon or PUBLIC; only authenticated.
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_granted_to_anon BOOLEAN;
  v_granted_to_public BOOLEAN;
  v_granted_to_auth BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.role_routine_grants
    WHERE routine_schema = 'public'
      AND routine_name = 'get_monthly_usage'
      AND grantee = 'anon'
  ) INTO v_granted_to_anon;
  PERFORM public._test_assert(
    'get_monthly_usage not granted to anon',
    NOT v_granted_to_anon, 'anon must not call get_monthly_usage');

  SELECT EXISTS (
    SELECT 1 FROM information_schema.role_routine_grants
    WHERE routine_schema = 'public'
      AND routine_name = 'get_monthly_usage'
      AND grantee = 'PUBLIC'
  ) INTO v_granted_to_public;
  PERFORM public._test_assert(
    'get_monthly_usage not granted to PUBLIC',
    NOT v_granted_to_public, 'PUBLIC must not call get_monthly_usage');

  SELECT EXISTS (
    SELECT 1 FROM information_schema.role_routine_grants
    WHERE routine_schema = 'public'
      AND routine_name = 'get_monthly_usage'
      AND grantee = 'authenticated'
  ) INTO v_granted_to_auth;
  PERFORM public._test_assert(
    'get_monthly_usage granted to authenticated',
    v_granted_to_auth, 'authenticated must be able to call get_monthly_usage');
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- Cleanup
-- ═══════════════════════════════════════════════════════════════════

DO $$ BEGIN RAISE NOTICE '=== Security & RLS Tests Complete ==='; END $$;
