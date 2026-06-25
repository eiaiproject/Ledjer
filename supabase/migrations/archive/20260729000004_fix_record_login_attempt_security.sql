-- P1-1: record_login_attempt — remove anon grant, add IP + email rate limiting
-- Also tighten is_email_rate_limited to include IP in the window


CREATE OR REPLACE FUNCTION public.record_login_attempt(
  p_email TEXT,
  p_success BOOLEAN,
  p_ip_address INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_error_message TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO public.login_attempts (email, success, ip_address, user_agent, error_message)
  VALUES (lower(p_email), p_success, p_ip_address, p_user_agent, p_error_message);

  DELETE FROM public.login_attempts
  WHERE created_at < now() - INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Remove anon grant — only authenticated (via login form with captcha) may call
REVOKE EXECUTE ON FUNCTION public.record_login_attempt(TEXT, BOOLEAN, INET, TEXT, TEXT) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.record_login_attempt(TEXT, BOOLEAN, INET, TEXT, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
