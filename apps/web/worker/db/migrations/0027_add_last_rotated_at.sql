-- Add last_rotated_at column to sessions table
-- This column was added to the session rotation logic in commit b827922
-- but the migration file was never created.

ALTER TABLE sessions ADD COLUMN last_rotated_at INTEGER;
