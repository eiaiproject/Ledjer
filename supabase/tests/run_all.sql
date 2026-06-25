-- =============================================================================
-- LEDJER — SQL test runner (single source of truth for ordering)
-- =============================================================================
-- Run with:
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/run_all.sql
--
-- Paths are relative to the repository root (the directory you invoke psql
-- from). Load the shared helpers first so this runner is authoritative even if
-- an individual suite stops self-loading helpers later. Current suites still
-- self-load helpers and call _test_cleanup() at the end, so this file also fixes
-- the canonical order and makes a failure abort the whole run (psql -v
-- ON_ERROR_STOP=1 turns any RAISE EXCEPTION into a non-zero exit).
--
-- CI and the README must reference THIS file rather than re-listing the suites.
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

\echo '=== p0_critical_fix_tests.sql ==='
\i supabase/tests/p0_critical_fix_tests.sql

\echo '=== p0_p1_fix_regression_tests.sql ==='
\i supabase/tests/p0_p1_fix_regression_tests.sql

\echo '=== opening_balance_guard_tests.sql ==='
\i supabase/tests/opening_balance_guard_tests.sql

\echo '=== payable_behavior_tests.sql ==='
\i supabase/tests/payable_behavior_tests.sql

\echo '=== permission_matrix_tests.sql ==='
\i supabase/tests/permission_matrix_tests.sql

\echo '=== privilege_hardening_tests.sql ==='
\i supabase/tests/privilege_hardening_tests.sql

\echo '=== master_fix_regression_tests.sql ==='
\i supabase/tests/master_fix_regression_tests.sql

\echo ''
\echo '============================================'
\echo 'ALL SQL TEST SUITES PASSED'
\echo '============================================'
