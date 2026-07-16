PRAGMA foreign_keys = ON;

-- Generic rate-limit bucket table for non-login endpoints
CREATE TABLE IF NOT EXISTS rate_limits (
  id TEXT PRIMARY KEY,
  bucket_key TEXT NOT NULL,  -- e.g. "register:203.0.113.42" or "password-reset:user@example.com"
  endpoint TEXT NOT NULL,    -- "register", "password_reset", "email_verify"
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_bucket ON rate_limits(bucket_key, created_at);
CREATE INDEX IF NOT EXISTS idx_rate_limits_endpoint ON rate_limits(endpoint, created_at);

UPDATE app_metadata SET value = '6' WHERE key = 'schema.foundation';
