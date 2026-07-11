PRAGMA foreign_keys = ON;

ALTER TABLE accounts ADD COLUMN account_subtype TEXT;

UPDATE app_metadata SET value = '5' WHERE key = 'schema.foundation';
