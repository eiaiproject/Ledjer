-- Migration: 0005_session_token_grace.sql
-- Keep the rotated-out token hash briefly valid so parallel in-flight
-- requests that started with the old cookie are not logged out at the exact
-- 7-day rotation moment (one request rotates the hash while others that read
-- a moment later would otherwise 401 against a live session)
--
-- Lookups accept previous_token_hash only while previous_token_expires_at is
-- in the future (a short grace window). The hash is overwritten on the next
-- rotation and is inert after expiry, and revoked or expired sessions still
-- block it via the revoked_at and expires_at checks in the session lookup

ALTER TABLE sessions ADD COLUMN previous_token_hash TEXT;
ALTER TABLE sessions ADD COLUMN previous_token_expires_at INTEGER;
