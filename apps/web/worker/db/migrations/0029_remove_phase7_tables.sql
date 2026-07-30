PRAGMA foreign_keys = ON;

-- ═══════════════════════════════════════════════════════════════
-- Phase 7: Remove retired modules (Approvals, Budgets,
--           Dimensions, Fixed Assets, Export Jobs)
--
-- Tables must be dropped in FK-safe order:
--   Children first, then parents.
-- ═══════════════════════════════════════════════════════════════

-- ── Phase 7C: Dimensions (children first) ─────────────────────
DROP TABLE IF EXISTS journal_line_tags;     -- FK → journal_lines, dimensions
DROP TABLE IF EXISTS transaction_tags;      -- FK → transactions, dimensions
DROP TABLE IF EXISTS dimensions;            -- FK → organizations

-- ── Phase 7B: Budgets (children first) ────────────────────────
DROP TABLE IF EXISTS budget_lines;          -- FK → budgets
DROP TABLE IF EXISTS budgets;               -- FK → accounts, organizations

-- ── Phase 7A: Approvals ───────────────────────────────────────
DROP TABLE IF EXISTS approval_requests;     -- FK → organizations
DROP TABLE IF EXISTS approval_configs;      -- FK → organizations

-- ── Phase 7D: Fixed Assets (children first) ───────────────────
DROP TABLE IF EXISTS asset_depreciation;    -- FK → fixed_assets, journal_entries
DROP TABLE IF EXISTS fixed_assets;          -- FK → accounts, organizations

-- ── Phase 7F: Export Jobs ─────────────────────────────────────
DROP TABLE IF EXISTS export_jobs_v2;        -- FK → organizations

UPDATE app_metadata SET value = '29' WHERE key = 'schema.foundation';
