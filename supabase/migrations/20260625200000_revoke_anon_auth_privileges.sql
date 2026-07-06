-- =============================================================================
-- LEDJER — Revoke broad default privileges from anon/authenticated
-- =============================================================================
-- Principle: anon/authenticated should have ONLY the minimum privileges
-- required for the frontend to function.  Everything else is revoked.
--
-- Strategy:
--   1. Revoke EXECUTE on ALL public functions from PUBLIC, anon, authenticated.
--   2. Re-grant ONLY intended RPCs.
--   3. Revoke broad DML on financial tables from anon/authenticated.
--   4. Grant only SELECT on non-financial tables needed by RLS policies.
--   5. Revoke all default privileges for future objects.
-- =============================================================================

-- ═══════════════════════════════════════════════════════════════════
-- STEP 1: Revoke EXECUTE on ALL public functions from PUBLIC, anon, authenticated
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  fn RECORD;
BEGIN
  FOR fn IN
    SELECT
      p.proname,
      pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
  LOOP
    BEGIN
      EXECUTE format(
        'REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC, anon, authenticated',
        fn.proname, fn.args
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Warning revoking EXECUTE on %(%): %', fn.proname, fn.args, SQLERRM;
    END;
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- STEP 2: Re-grant ONLY intended RPCs
-- ═══════════════════════════════════════════════════════════════════

-- ── Pre-auth functions (anon) ─────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.is_org_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_org_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_login_attempt_pre_auth(text, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, text, integer, integer) TO anon;
GRANT EXECUTE ON FUNCTION public.is_email_rate_limited(text, integer, integer) TO anon;

-- ── Post-auth RPCs (authenticated only) ──────────────────────────
GRANT EXECUTE ON FUNCTION public.post_transaction(uuid, date, text, numeric, uuid, text, uuid, uuid, text, numeric, date, text, text, uuid, numeric, numeric, uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.void_transaction(uuid, uuid, text, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_opening_balance(uuid, uuid, numeric, text, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_organization_with_opening_balances(text, business_type, date, text, numeric, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.invite_staff(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_staff(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_staff_permissions(uuid, uuid, boolean, boolean, boolean, boolean, boolean, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rename_account(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_balance_sheet(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_profit_loss(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_trial_balance(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_general_ledger(uuid, uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_summary(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_monthly_summary(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_account_balance(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_product_info(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_email_rate_limited(text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_login_attempt(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_login_attempt_pre_auth(text, text, text) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════
-- STEP 3: Revoke broad DML on financial tables
-- ═══════════════════════════════════════════════════════════════════
REVOKE ALL ON TABLE public.transactions FROM anon, authenticated;
REVOKE ALL ON TABLE public.journal_entries FROM anon, authenticated;
REVOKE ALL ON TABLE public.journal_lines FROM anon, authenticated;
REVOKE ALL ON TABLE public.stock_movements FROM anon, authenticated;
REVOKE ALL ON TABLE public.audit_logs FROM anon, authenticated;
REVOKE ALL ON TABLE public.rate_limits FROM anon, authenticated;
REVOKE ALL ON TABLE public.login_attempts FROM anon, authenticated;
REVOKE ALL ON TABLE public.general_ledger FROM anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════
-- STEP 4: Grant only SELECT on tables needed by RLS policies / frontend
-- ═══════════════════════════════════════════════════════════════════
-- Non-financial tables: profiles (needed for user profile display)
GRANT SELECT ON TABLE public.profiles TO authenticated;

-- Financial tables: SELECT only (RLS policies gate access)
GRANT SELECT ON TABLE public.transactions TO authenticated;
GRANT SELECT ON TABLE public.journal_entries TO authenticated;
GRANT SELECT ON TABLE public.journal_lines TO authenticated;
GRANT SELECT ON TABLE public.stock_movements TO authenticated;
GRANT SELECT ON TABLE public.audit_logs TO authenticated;
GRANT SELECT ON TABLE public.general_ledger TO authenticated;

-- Account/product tables: SELECT (needed for dropdowns, reports)
GRANT SELECT ON TABLE public.accounts TO authenticated;
GRANT SELECT ON TABLE public.account_mappings TO authenticated;
GRANT SELECT ON TABLE public.products TO authenticated;
GRANT SELECT ON TABLE public.parties TO authenticated;
GRANT SELECT ON TABLE public.attachments TO authenticated;
GRANT SELECT ON TABLE public.organizations TO authenticated;
GRANT SELECT ON TABLE public.organization_members TO authenticated;

-- ═══════════════════════════════════════════════════════════════════
-- STEP 5: Revoke all default privileges for future objects
-- ═══════════════════════════════════════════════════════════════════
-- Revoke from postgres default ACLs.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM anon, authenticated;

-- supabase_admin default ACLs require supabase_admin role.
-- Use a DO block with SET ROLE to elevate.
DO $$
BEGIN
  -- Only attempt if we can assume supabase_admin
  BEGIN
    SET ROLE supabase_admin;
    ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
      REVOKE ALL ON TABLES FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
      REVOKE ALL ON SEQUENCES FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
      REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
    RESET ROLE;
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
    RAISE NOTICE 'Could not alter supabase_admin defaults (insufficient privilege), skipping';
  END;
END $$;

-- service_role retains full access (for migrations, SECURITY DEFINER, admin)
-- postgres retains ALL (for migrations/setup)
