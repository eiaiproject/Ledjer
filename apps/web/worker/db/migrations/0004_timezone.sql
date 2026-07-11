PRAGMA foreign_keys = ON;

ALTER TABLE organizations ADD COLUMN timezone TEXT NOT NULL DEFAULT 'Asia/Jakarta';

UPDATE app_metadata SET value = '4' WHERE key = 'schema.foundation';
