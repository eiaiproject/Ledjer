-- ============================================================================
-- Harden record_login_attempt_pre_auth against anonymous abuse.
--
-- Changes:
--   1. Force success = FALSE (pre-auth attempts are always failures).
--   2. Cap email (320), user_agent (512), error_message (1024) lengths.
--   3. Add IP-based rate limit: max 20 attempts per IP per 5-minute window.
--   4. Add email-based rate limit: max 10 attempts per normalized email per 5-minute window.
--   5. Deny UPDATE/DELETE on login_attempts for anon/authenticated.
-- ============================================================================

-- Drop the old function with p_success parameter first
-- Use DO block to handle function signature properly
DO $$
BEGIN
  -- Try to drop all variants of the function
  DROP FUNCTION IF EXISTS "public"."record_login_attempt_pre_auth"("p_email" "text", "p_success" boolean);
  DROP FUNCTION IF EXISTS "public"."record_login_attempt_pre_auth"("p_email" "text", "p_success" boolean, "p_user_agent" "text");
  DROP FUNCTION IF EXISTS "public"."record_login_attempt_pre_auth"("p_email" "text", "p_success" boolean, "p_user_agent" "text", "p_error_message" "text");
EXCEPTION WHEN OTHERS THEN
  -- Ignore errors if function doesn't exist
  NULL;
END $$;

-- Create the hardened version without p_success (pre-auth attempts are always failures)
CREATE OR REPLACE FUNCTION "public"."record_login_attempt_pre_auth"(
  "p_email" "text",
  "p_user_agent" "text" DEFAULT NULL::"text",
  "p_error_message" "text" DEFAULT NULL::"text"
) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_ip INET;
  v_normalized_email TEXT;
  v_ip_attempts INTEGER;
  v_email_attempts INTEGER;
BEGIN
  -- Input validation: reject empty/null email
  IF p_email IS NULL OR length(trim(p_email)) = 0 THEN
    RAISE EXCEPTION 'Email is required';
  END IF;

  -- Normalize and cap lengths
  v_normalized_email := lower(trim(p_email));
  v_ip := inet_client_addr();

  -- Cap email to 320 chars (RFC 5321 max)
  IF length(v_normalized_email) > 320 THEN
    v_normalized_email := left(v_normalized_email, 320);
  END IF;

  -- Cap user_agent to 512 chars
  IF p_user_agent IS NOT NULL AND length(p_user_agent) > 512 THEN
    p_user_agent := left(p_user_agent, 512);
  END IF;

  -- Cap error_message to 1024 chars
  IF p_error_message IS NOT NULL AND length(p_error_message) > 1024 THEN
    p_error_message := left(p_error_message, 1024);
  END IF;

  -- Rate limit by IP: max 20 attempts per 5-minute window
  IF v_ip IS NOT NULL THEN
    SELECT COUNT(*)
    INTO v_ip_attempts
    FROM public.login_attempts
    WHERE ip_address = v_ip
      AND created_at > now() - INTERVAL '5 minutes';

    IF v_ip_attempts >= 20 THEN
      -- Silently drop to prevent flooding; legitimate users will still be rate-limited
      RAISE EXCEPTION 'Too many login attempts. Please try again later.';
    END IF;
  END IF;

  -- Rate limit by email: max 10 attempts per 5-minute window
  SELECT COUNT(*)
  INTO v_email_attempts
  FROM public.login_attempts
  WHERE email = v_normalized_email
    AND created_at > now() - INTERVAL '5 minutes';

  IF v_email_attempts >= 10 THEN
    RAISE EXCEPTION 'Too many login attempts for this email. Please try again later.';
  END IF;

  -- Insert with forced success = FALSE (pre-auth attempts are always failures)
  INSERT INTO public.login_attempts (email, success, ip_address, user_agent, error_message)
  VALUES (v_normalized_email, FALSE, v_ip, p_user_agent, p_error_message);

  -- Cleanup old records (keep 24 hours)
  DELETE FROM public.login_attempts
  WHERE created_at < now() - INTERVAL '24 hours';
END;
$$;

ALTER FUNCTION "public"."record_login_attempt_pre_auth"("p_email" "text", "p_user_agent" "text", "p_error_message" "text") OWNER TO "postgres";

-- Revoke old grants and set new ones using DO block for safety
DO $$
BEGIN
  -- Try to revoke old grants (may fail if old function was already dropped)
  BEGIN
    REVOKE ALL ON FUNCTION "public"."record_login_attempt_pre_auth"("p_email" "text", "p_success" boolean, "p_user_agent" "text", "p_error_message" "text") FROM "anon";
    REVOKE ALL ON FUNCTION "public"."record_login_attempt_pre_auth"("p_email" "text", "p_success" boolean, "p_user_agent" "text", "p_error_message" "text") FROM "authenticated";
  EXCEPTION WHEN OTHERS THEN
    NULL; -- Old function may not exist
  END;
END $$;

-- Grant the new 3-param signature to anon (for pre-auth login attempts)
GRANT ALL ON FUNCTION "public"."record_login_attempt_pre_auth"("p_email" "text", "p_user_agent" "text", "p_error_message" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."record_login_attempt_pre_auth"("p_email" "text", "p_user_agent" "text", "p_error_message" "text") TO "authenticated";

-- Revoke unnecessary privileges: anon/authenticated should NOT be able to update/delete login_attempts
REVOKE UPDATE ON TABLE "public"."login_attempts" FROM "anon";
REVOKE UPDATE ON TABLE "public"."login_attempts" FROM "authenticated";
REVOKE DELETE ON TABLE "public"."login_attempts" FROM "anon";
REVOKE DELETE ON TABLE "public"."login_attempts" FROM "authenticated";

-- Add a comment to document the security hardening
COMMENT ON FUNCTION "public"."record_login_attempt_pre_auth"("p_email" "text", "p_user_agent" "text", "p_error_message" "text") IS 'Records a failed pre-auth login attempt. Hardened: forces success=FALSE, caps input lengths, enforces IP+email rate limits.';
