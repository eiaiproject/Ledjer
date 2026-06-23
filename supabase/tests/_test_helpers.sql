-- =============================================================================
-- LEDJER — Shared SQL Test Helpers
-- =============================================================================
-- Strict test harness used by every test file:
--   PASS → RAISE NOTICE (visible in CI logs)
--   FAIL → RAISE EXCEPTION (non-zero exit, fails the run)
--
-- This file is meant to be loaded by every test script that needs assertions.
-- It is intentionally NOT loaded by migration files (see p0 critical fix
-- migration for rationale).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- _test_assert: Strict assertion
--
-- Pass:  RAISE NOTICE 'PASS: ...'
-- Fail:  RAISE EXCEPTION 'TEST FAILURE: ...'
--
-- Never emits WARNING only; WARNING can be silenced by clients and was the
-- root cause of false-green runs.
-- ---------------------------------------------------------------------------
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
    RAISE EXCEPTION
      'TEST FAILURE: % %. Run this test against the expected state.',
      p_test_name,
      CASE WHEN p_detail IS NOT NULL THEN ' [' || p_detail || ']' ELSE '' END;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- _test_assert_eq_numeric: Strict numeric equality with tolerance.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._test_assert_eq_numeric(
  p_test_name TEXT,
  p_actual NUMERIC,
  p_expected NUMERIC,
  p_tolerance NUMERIC DEFAULT 0.01
)
RETURNS VOID AS $$
DECLARE
  v_diff NUMERIC;
BEGIN
  v_diff := ABS(COALESCE(p_actual, 0) - COALESCE(p_expected, 0));
  IF v_diff <= p_tolerance THEN
    RAISE NOTICE 'PASS: % (actual=%, expected=%)', p_test_name, p_actual, p_expected;
  ELSE
    RAISE EXCEPTION
      'TEST FAILURE: % — expected %, got % (diff=%)',
      p_test_name, p_expected, p_actual, v_diff;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- _test_fail: Manually fail a test with a custom message.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._test_fail(
  p_test_name TEXT,
  p_detail TEXT
)
RETURNS VOID AS $$
BEGIN
  RAISE EXCEPTION 'TEST FAILURE: % — %', p_test_name, COALESCE(p_detail, '(no detail)');
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- _test_cleanup: Drop helper functions when tests complete.
-- Each test file calls this at the end.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._test_cleanup()
RETURNS VOID AS $$
BEGIN
  DROP FUNCTION IF EXISTS public._test_assert(TEXT, BOOLEAN, TEXT);
  DROP FUNCTION IF EXISTS public._test_assert_eq_numeric(TEXT, NUMERIC, NUMERIC, NUMERIC);
  DROP FUNCTION IF EXISTS public._test_fail(TEXT, TEXT);
  DROP FUNCTION IF EXISTS public._test_cleanup();
EXCEPTION WHEN OTHERS THEN
  -- Best-effort cleanup; do not fail tests on cleanup errors.
  RAISE NOTICE 'Cleanup warning: %', SQLERRM;
END;
$$ LANGUAGE plpgsql;