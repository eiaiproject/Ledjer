-- 0012: samakan uniqueness op_id dengan dedup per-buku.
-- pushSyncOp mendedup (op_id, user_id), jadi UNIQUE global saja tidak cukup:
-- konflik lintas-buku harus jadi deduplicated, bukan 500.
CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_ops_user_op ON sync_ops(user_id, op_id);
