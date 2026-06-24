-- P1: Restore pre-auth login attempt tracking for failed logins.
--
-- Problem: 20260729_000004 revoked anon access to record_login_attempt,
-- but login.tsx calls it before authentication on both success/failure.
-- Failed login attempts (anon caller) were silently failing →
-- is_email_rate_limited could not enforce lockout.
--
-- Solution: Create record_login_attempt_pre_auth as SECURITY DEFINER
-- callable by anon with strict input validation. The original
-- record_login_attempt stays authenticated-only for post-login audit.

BEGIN;

CREATE OR REPLACE FUNCTION public.record_login_attempt_pre_auth(
  p_email TEXT,
  p_success BOOLEAN,
  p_user_agent TEXT DEFAULT NULL,
  p_error_message TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  -- Input validation: reject empty/null email, normalize
  IF p_email IS NULL OR length(trim(p_email)) = 0 THEN
    RAISE EXCEPTION 'Email is required';
  END IF;

  INSERT INTO public.login_attempts (email, success, ip_address, user_agent, error_message)
  VALUES (lower(trim(p_email)), p_success, inet_client_addr(), p_user_agent, p_error_message);

  -- Cleanup old records
  DELETE FROM public.login_attempts
  WHERE created_at < now() - INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Allow anon to call only the pre-auth variant
REVOKE EXECUTE ON FUNCTION public.record_login_attempt_pre_auth(
  TEXT, BOOLEAN, TEXT, TEXT
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.record_login_attempt_pre_auth(
  TEXT, BOOLEAN, TEXT, TEXT
) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
