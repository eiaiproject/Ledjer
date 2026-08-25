PRAGMA foreign_keys = ON;

-- Bug fix: a race between two concurrent voids (different idempotency keys)
-- could create TWO reversal transactions for one original (seen in prod:
-- TRX-052 had TRX-053 and TRX-054). Enforce one posted reversal per original.
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_one_reversal_per_original
  ON transactions (organization_id, original_transaction_id)
  WHERE original_transaction_id IS NOT NULL;
