-- ============================================================================
-- Migration Template — Ledjer SQL Migration Patterns
-- NOT a migration file. Reference for creating new migrations with consistent
-- column patterns, reducing duplication across migration files.
-- ============================================================================

PRAGMA foreign_keys = ON;

-- ────────────────────────────────────────────────────────────────────────────
-- Pattern 1: Core audit columns (used in every table)
-- ────────────────────────────────────────────────────────────────────────────
-- id TEXT PRIMARY KEY,
-- organization_id TEXT NOT NULL,
-- created_at INTEGER NOT NULL,
-- updated_at INTEGER NOT NULL,
-- FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE

-- ────────────────────────────────────────────────────────────────────────────
-- Pattern 2: Entity with creator tracking (most data tables)
-- ────────────────────────────────────────────────────────────────────────────
-- created_by TEXT NOT NULL,
-- FOREIGN KEY (created_by) REFERENCES users(id)

-- ────────────────────────────────────────────────────────────────────────────
-- Pattern 3: Standard index patterns
-- ────────────────────────────────────────────────────────────────────────────
-- Unique constraint on (organization_id, code):
--   CREATE UNIQUE INDEX IF NOT EXISTS idx_{table}_org_code ON {table}(organization_id, code);
-- List by org:
--   CREATE INDEX IF NOT EXISTS idx_{table}_org ON {table}(organization_id);
-- List by org + date:
--   CREATE INDEX IF NOT EXISTS idx_{table}_org_date ON {table}(organization_id, {date_column});
-- List by org + status:
--   CREATE INDEX IF NOT EXISTS idx_{table}_org_status ON {table}(organization_id, status);

-- ────────────────────────────────────────────────────────────────────────────
-- Pattern 4: Soft-delete / active flag
-- ────────────────────────────────────────────────────────────────────────────
-- is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
-- CREATE INDEX IF NOT EXISTS idx_{table}_org_active ON {table}(organization_id, is_active);

-- ────────────────────────────────────────────────────────────────────────────
-- Pattern 5: SQLite CHECK constraint with inline NOSONAR
-- ────────────────────────────────────────────────────────────────────────────
-- status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')), -- NOSONAR: SQLite DDL can't use variables

-- ────────────────────────────────────────────────────────────────────────────
-- Pattern 6: Counter table upsert
-- ────────────────────────────────────────────────────────────────────────────
-- INSERT INTO organization_document_counters (organization_id, counter_name, current_value, updated_at)
-- VALUES (?, ?, ?, ?)
-- ON CONFLICT(organization_id, counter_name) DO UPDATE SET current_value = ?, updated_at = ?

-- ────────────────────────────────────────────────────────────────────────────
-- Pattern 7: Journal lines CHECK constraint
-- ────────────────────────────────────────────────────────────────────────────
-- CHECK (
--   (debit_minor > 0 AND credit_minor = 0)
--   OR (debit_minor = 0 AND credit_minor > 0)
-- ),

-- ────────────────────────────────────────────────────────────────────────────
-- Pattern 8: Metadata bump (every migration)
-- ────────────────────────────────────────────────────────────────────────────
-- UPDATE app_metadata SET value = '{version}' WHERE key = 'schema.foundation';
