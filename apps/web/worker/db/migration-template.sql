-- ============================================================================
-- Migration Template — Ledjer SQL Migration Patterns
-- NOT a migration file. Reference for creating new migrations with consistent
-- column patterns, reducing duplication across migration files.
-- Satu akun = satu buku: scope column-nya user_id (lihat 0009_single_user.sql).
-- ============================================================================

PRAGMA foreign_keys = ON;

-- Pattern 1: Core audit columns (used in every book-scoped table)
-- id TEXT PRIMARY KEY,
-- user_id TEXT NOT NULL,
-- created_at INTEGER NOT NULL,
-- updated_at INTEGER NOT NULL,
-- FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE

-- Pattern 2: Standard index patterns (all prefixed by the scope column)
-- Unique constraint on (user_id, code):
--   CREATE UNIQUE INDEX IF NOT EXISTS idx_{table}_user_code ON {table}(user_id, code);
-- List by user:
--   CREATE INDEX IF NOT EXISTS idx_{table}_user ON {table}(user_id);
-- List by user + date:
--   CREATE INDEX IF NOT EXISTS idx_{table}_user_date ON {table}(user_id, {date_column});
-- List by user + status:
--   CREATE INDEX IF NOT EXISTS idx_{table}_user_status ON {table}(user_id, status);

-- Pattern 3: Soft-delete / active flag
-- is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
-- CREATE INDEX IF NOT EXISTS idx_{table}_user_active ON {table}(user_id, is_active);

-- Pattern 4: SQLite CHECK constraint with inline NOSONAR
-- status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')), -- NOSONAR: SQLite DDL can't use variables

-- Pattern 5: Journal lines CHECK constraint
-- CHECK (
--   (debit_idr > 0 AND credit_idr = 0)
--   OR (debit_idr = 0 AND credit_idr > 0)
-- ),

-- Pattern 6: Metadata bump (every migration)
-- UPDATE app_metadata SET value = '{version}' WHERE key = 'schema.foundation';
