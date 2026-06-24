-- Migration: Security Enhancements (T4.1, T4.4)
-- Date: 2026-07-19
-- Purpose:
--   1. Rate limiting table for server-side enforcement
--   2. Login attempt tracking
--   3. Security event logging functions
--
-- Constraints: Additive only (C1).

BEGIN;

-- 1. Rate limiting table (for server-side enforcement)
CREATE TABLE IF NOT EXISTS rate_limits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  identifier TEXT NOT NULL, -- email, IP, user_id, etc.
  action TEXT NOT NULL, -- 'login', 'invite', 'transaction', etc.
  attempts INTEGER DEFAULT 1,
  window_start TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(identifier, action, window_start)
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_lookup ON rate_limits(identifier, action, window_start);

-- 2. Login attempts tracking
CREATE TABLE IF NOT EXISTS login_attempts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  success BOOLEAN NOT NULL DEFAULT false,
  ip_address INET,
  user_agent TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON login_attempts(email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON login_attempts(ip_address, created_at DESC);

-- 3. Function to check rate limit (server-side)
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_identifier TEXT,
  p_action TEXT,
  p_max_attempts INTEGER DEFAULT 5,
  p_window_seconds INTEGER DEFAULT 300
)
RETURNS BOOLEAN AS $$
DECLARE
  v_count INTEGER;
  v_window_start TIMESTAMPTZ;
BEGIN
  v_window_start = NOW() - (p_window_seconds || ' seconds')::INTERVAL;
  
  SELECT COUNT(*) INTO v_count
  FROM rate_limits
  WHERE identifier = p_identifier
    AND action = p_action
    AND window_start > v_window_start;
  
  IF v_count >= p_max_attempts THEN
    RETURN false;
  END IF;
  
  -- Record this attempt
  INSERT INTO rate_limits (identifier, action, attempts, window_start)
  VALUES (p_identifier, p_action, 1, NOW())
  ON CONFLICT (identifier, action, window_start)
  DO UPDATE SET attempts = rate_limits.attempts + 1;
  
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Function to record login attempt
CREATE OR REPLACE FUNCTION public.record_login_attempt(
  p_email TEXT,
  p_success BOOLEAN,
  p_ip_address INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_error_message TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO login_attempts (email, success, ip_address, user_agent, error_message)
  VALUES (p_email, p_success, p_ip_address, p_user_agent, p_error_message);
  
  -- Clean up old attempts (older than 24 hours)
  DELETE FROM login_attempts
  WHERE created_at < NOW() - INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Function to check if email is locked due to failed attempts
CREATE OR REPLACE FUNCTION public.is_email_rate_limited(
  p_email TEXT,
  p_max_attempts INTEGER DEFAULT 5,
  p_lockout_minutes INTEGER DEFAULT 15
)
RETURNS BOOLEAN AS $$
DECLARE
  v_failed_count INTEGER;
  v_window_start TIMESTAMPTZ;
BEGIN
  v_window_start = NOW() - (p_lockout_minutes || ' minutes')::INTERVAL;
  
  SELECT COUNT(*) INTO v_failed_count
  FROM login_attempts
  WHERE email = p_email
    AND success = false
    AND created_at > v_window_start;
  
  RETURN v_failed_count >= p_max_attempts;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Enhanced audit logging function with security context
CREATE OR REPLACE FUNCTION public.log_security_event(
  p_organization_id UUID,
  p_user_id UUID,
  p_action TEXT,
  p_resource_type TEXT DEFAULT NULL,
  p_resource_id TEXT DEFAULT NULL,
  p_details JSONB DEFAULT NULL,
  p_ip_address INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO audit_logs (
    organization_id, actor_user_id, action, entity_type, entity_id, 
    after_data
  ) VALUES (
    p_organization_id, p_user_id, p_action, p_resource_type, p_resource_id,
    p_details
  ) RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT SELECT ON rate_limits TO authenticated;
GRANT SELECT ON login_attempts TO authenticated;
GRANT EXECUTE ON FUNCTION check_rate_limit TO authenticated;
GRANT EXECUTE ON FUNCTION record_login_attempt TO authenticated;
GRANT EXECUTE ON FUNCTION is_email_rate_limited TO authenticated;
GRANT EXECUTE ON FUNCTION log_security_event TO authenticated;

-- 7. RLS policies for new tables
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;

-- Rate limits: users can only see their organization's limits
CREATE POLICY "org_rate_limits_select" ON rate_limits
  FOR SELECT USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

-- Login attempts: only system can insert (via SECURITY DEFINER functions)
CREATE POLICY "system_login_attempts_insert" ON login_attempts
  FOR INSERT WITH CHECK (true);

-- Allow reading own login attempts
CREATE POLICY "user_own_login_attempts" ON login_attempts
  FOR SELECT USING (
    email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );

COMMIT;
