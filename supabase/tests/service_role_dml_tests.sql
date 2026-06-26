-- =============================================================================
-- LEDJER — service_role DML Privilege Regression Tests
-- =============================================================================
-- Verifies service_role can perform DML needed for E2E seed/cleanup.
-- Run AFTER migration 20260626000000_grant_service_role_dml.sql.
--
-- STRICT: RAISE EXCEPTION on any failure.
-- =============================================================================

\i supabase/tests/_test_helpers.sql

-- ═══════════════════════════════════════════════════════════════════
-- TEST 1: service_role has INSERT on organization_members
-- ═══════════════════════════════════════════════════════════════════
SELECT public._test_assert(
  'service_role has INSERT on organization_members',
  has_table_privilege('service_role', 'public.organization_members', 'INSERT')
);

-- ═══════════════════════════════════════════════════════════════════
-- TEST 2: service_role has SELECT on organizations
-- ═══════════════════════════════════════════════════════════════════
SELECT public._test_assert(
  'service_role has SELECT on organizations',
  has_table_privilege('service_role', 'public.organizations', 'SELECT')
);

-- ═══════════════════════════════════════════════════════════════════
-- TEST 3: service_role has INSERT on organizations
-- ═══════════════════════════════════════════════════════════════════
SELECT public._test_assert(
  'service_role has INSERT on organizations',
  has_table_privilege('service_role', 'public.organizations', 'INSERT')
);

-- ═══════════════════════════════════════════════════════════════════
-- TEST 4: service_role has UPDATE on organizations
-- ═══════════════════════════════════════════════════════════════════
SELECT public._test_assert(
  'service_role has UPDATE on organizations',
  has_table_privilege('service_role', 'public.organizations', 'UPDATE')
);

-- ═══════════════════════════════════════════════════════════════════
-- TEST 5: service_role has DELETE on organizations
-- ═══════════════════════════════════════════════════════════════════
SELECT public._test_assert(
  'service_role has DELETE on organizations',
  has_table_privilege('service_role', 'public.organizations', 'DELETE')
);

-- ═══════════════════════════════════════════════════════════════════
-- TEST 6: service_role has SELECT on profiles (needed for seed lookups)
-- ═══════════════════════════════════════════════════════════════════
SELECT public._test_assert(
  'service_role has SELECT on profiles',
  has_table_privilege('service_role', 'public.profiles', 'SELECT')
);

-- ═══════════════════════════════════════════════════════════════════
-- TEST 7: service_role has SELECT, INSERT, UPDATE, DELETE on accounts
-- ═══════════════════════════════════════════════════════════════════
SELECT public._test_assert(
  'service_role has SELECT on accounts',
  has_table_privilege('service_role', 'public.accounts', 'SELECT')
);
SELECT public._test_assert(
  'service_role has INSERT on accounts',
  has_table_privilege('service_role', 'public.accounts', 'INSERT')
);
SELECT public._test_assert(
  'service_role has UPDATE on accounts',
  has_table_privilege('service_role', 'public.accounts', 'UPDATE')
);
SELECT public._test_assert(
  'service_role has DELETE on accounts',
  has_table_privilege('service_role', 'public.accounts', 'DELETE')
);

-- Cleanup
SELECT public._test_cleanup();
