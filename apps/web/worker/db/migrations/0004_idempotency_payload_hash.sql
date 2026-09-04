-- Migration: 0004_idempotency_payload_hash.sql
-- Bind idempotency keys to their payload so a reused key with different
-- content is rejected instead of silently replaying the wrong transaction.
-- Existing rows keep NULL (treated as replayable for backward compatibility).

ALTER TABLE transactions ADD COLUMN idempotency_payload_hash TEXT;
