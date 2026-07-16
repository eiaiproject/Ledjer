PRAGMA foreign_keys = ON;

-- P2-1: Drop unused account_mappings table (hardcoded account codes are the MVP design)
DROP TABLE IF EXISTS account_mappings;

-- P2-2: Drop unused export_jobs table (exports are synchronous, no queue yet)
DROP TABLE IF EXISTS export_jobs;

UPDATE app_metadata SET value = '7' WHERE key = 'schema.foundation';
