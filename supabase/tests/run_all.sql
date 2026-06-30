-- =============================================================================
-- LEDJER — SQL test runner (single source of truth for ordering)
-- =============================================================================
-- Run with:
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/run_all.sql
--
-- Paths are relative to the repository root (the directory you invoke psql
-- from). Load the shared helpers first so this runner is authoritative even if
-- an individual suite stops self-loading helpers later. Some suites still
-- self-load helpers and call _test_cleanup() at the end; others rely on the
-- final cleanup assertion below. This file fixes the canonical order and makes
-- a failure abort the whole run (psql -v ON_ERROR_STOP=1 turns any RAISE
-- EXCEPTION into a non-zero exit).
--
-- CI and the README must reference THIS file rather than re-listing the suites.
--
-- ╔════════════════════════════════════════════════════════════════════════════╗
-- ║  WARNING: NEVER run this file against production or any persistent      ║
-- ║  hosted database.  Tests create test users in auth.users, insert        ║
-- ║  disposable organizations, and may revoke/grant privileges.  Run only   ║
-- ║  against a disposable local Supabase stack created by:                  ║
-- ║    supabase start --workdir .                                           ║
-- ║    supabase db reset --workdir . --no-seed                              ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝
-- =============================================================================

\echo '=== _test_helpers.sql ==='
\i supabase/tests/_test_helpers.sql

\echo '=== security_rls_tests.sql ==='
\i supabase/tests/security_rls_tests.sql

\echo '=== golden_scenario_tests.sql ==='
\i supabase/tests/golden_scenario_tests.sql

\echo '=== inventory_golden_tests.sql ==='
\i supabase/tests/inventory_golden_tests.sql

\echo '=== accounting_regression_tests.sql ==='
\i supabase/tests/accounting_regression_tests.sql

\echo '=== opening_balance_guard_tests.sql ==='
\i supabase/tests/opening_balance_guard_tests.sql

\echo '=== payable_behavior_tests.sql ==='
\i supabase/tests/payable_behavior_tests.sql

\echo '=== partial_payment_regression_tests.sql ==='
\i supabase/tests/partial_payment_regression_tests.sql

\echo '=== permission_matrix_tests.sql ==='
\i supabase/tests/permission_matrix_tests.sql

\echo '=== privilege_hardening_tests.sql ==='
\i supabase/tests/privilege_hardening_tests.sql

\echo '=== stage4_production_tests.sql ==='
\i supabase/tests/stage4_production_tests.sql

\echo '=== service_role_dml_tests.sql ==='
\i supabase/tests/service_role_dml_tests.sql

\echo '=== post_transaction_security_tests.sql ==='
\i supabase/tests/post_transaction_security_tests.sql

-- ═══════════════════════════════════════════════════════════════════
-- FINAL REVOKE: Ensure no _test_* functions leak to anon/authenticated.
-- Test files may CREATE functions after _test_helpers.sql revocation.
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  fn RECORD;
BEGIN
  FOR fn IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname LIKE '_test_%'
  LOOP
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.' || quote_ident(fn.proname) || '(' || fn.args || ') FROM PUBLIC, anon, authenticated';
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- DROP: Remove all _test_* helper functions.
-- Individual suites no longer self-clean; run_all.sql owns cleanup.
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  fn RECORD;
BEGIN
  FOR fn IN
    SELECT p.proname || '(' ||
           pg_get_function_identity_arguments(p.oid) || ')' AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname LIKE '_test_%'
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS public.' || fn.sig || ' CASCADE';
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- FINAL CLEANUP: Drop all _test_* functions created during this run.
-- If any remain, the test harness itself has leaked and the run
-- should fail.
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_remaining INTEGER;
  v_names TEXT;
BEGIN
  SELECT COUNT(*), COALESCE(string_agg(p.proname, ', ' ORDER BY p.proname), '')
    INTO v_remaining, v_names
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
    AND p.proname LIKE '_test_%';

  IF v_remaining > 0 THEN
    RAISE EXCEPTION
      'TEST HARNESS LEAK: % _test_* function(s) remain after run_all.sql: %',
      v_remaining, v_names;
  END IF;

  RAISE NOTICE 'PASS: no _test_* functions remain after run_all.sql';
END $$;

\echo ''
\echo '============================================'
\echo 'ALL SQL TEST SUITES PASSED'
\echo '============================================'
