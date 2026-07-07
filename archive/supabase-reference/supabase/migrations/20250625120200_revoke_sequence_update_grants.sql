-- ============================================================================
-- Remove unnecessary default sequence UPDATE grants for anon/authenticated.
--
-- SECURITY DEFINER RPCs run as the function owner (postgres), so anon and
-- authenticated roles should never need to update sequences directly.
-- These grants are a Supabase default that we tighten for defense-in-depth.
--
-- If a future migration or feature requires sequence UPDATE for a specific
-- role, add it explicitly with a GRANT on that specific sequence.
-- ============================================================================

-- Revoke default UPDATE on sequences from anon and authenticated
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE UPDATE ON SEQUENCES FROM "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE UPDATE ON SEQUENCES FROM "authenticated";

-- Note: service_role retains UPDATE on sequences (for admin operations)
-- and postgres retains ALL on sequences (for migrations/setup).
