-- =============================================================================
-- LEDJER — Fix handle_new_user search_path
-- =============================================================================
-- handle_new_user() is SECURITY DEFINER but was created without
-- SET search_path = public. The security_rls_tests.sql TEST 3b
-- (All SECURITY DEFINER functions declare SET search_path) fails
-- because of this. Add SET search_path = public to harden it.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.email, '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

NOTIFY pgrst, 'reload schema';

COMMIT;
