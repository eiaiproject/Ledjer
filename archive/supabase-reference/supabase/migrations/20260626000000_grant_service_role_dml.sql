-- =============================================================================
-- LEDJER — Grant service_role DML privileges for E2E seed/cleanup
-- =============================================================================
-- The prior privilege hardening revoked too much from service_role, causing
-- E2E seed to fail on INSERT into organization_members and other tables.
-- This migration restores the DML privileges service_role needs for
-- test seeding and cleanup without weakening RLS for anon/authenticated.
--
-- Idempotent: re-running is safe.
-- =============================================================================

-- Grant DML on all existing public tables
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;

-- Grant sequence usage needed for INSERT with auto-increment PKs
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Future tables created by postgres will also get DML for service_role
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO service_role;
