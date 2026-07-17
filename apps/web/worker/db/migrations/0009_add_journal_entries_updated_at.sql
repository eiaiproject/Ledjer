-- Add updated_at to journal_entries for void reversal tracking.
-- The void transaction code updates journal_entries SET status='voided', updated_at=?
-- but the column was missing from the original schema.

ALTER TABLE journal_entries ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;
