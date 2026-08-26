PRAGMA foreign_keys = ON;

-- Bug fix: a race between two concurrent voids (different idempotency keys)
-- could create TWO reversal transactions for one original (seen in prod:
-- TRX-052 had TRX-053 and TRX-054). Enforce one posted reversal per original.

-- Demote duplicate posted reversals first so the unique index can be built:
-- for each (organization_id, original_transaction_id) keep the OLDEST posted
-- reversal and void the newer ones, together with their journal entries.
UPDATE transactions SET
  status = 'voided', -- NOSONAR
  voided_at = unixepoch() * 1000,
  void_reason = 'auto: duplicate reversal demoted by migration 0033',
  updated_at = unixepoch() * 1000
WHERE status = 'posted' -- NOSONAR
  AND id IN (
    SELECT t.id FROM transactions t
    JOIN transactions keep ON
      keep.organization_id = t.organization_id
      AND keep.original_transaction_id = t.original_transaction_id
      AND keep.status = 'posted' -- NOSONAR
      AND (keep.created_at < t.created_at
           OR (keep.created_at = t.created_at AND keep.id < t.id))
    WHERE t.status = 'posted' AND t.original_transaction_id IS NOT NULL -- NOSONAR
  );

UPDATE journal_entries SET
  status = 'voided', -- NOSONAR
  updated_at = unixepoch() * 1000
WHERE status = 'posted' -- NOSONAR
  AND transaction_id IN (
    SELECT id FROM transactions
    WHERE status = 'voided' -- NOSONAR
      AND void_reason = 'auto: duplicate reversal demoted by migration 0033'
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_one_reversal_per_original
  ON transactions (organization_id, original_transaction_id)
  WHERE original_transaction_id IS NOT NULL AND status = 'posted'; -- NOSONAR
