# ⚠️ Archive — NOT Applied

This directory contains **historical migration files** that are **no longer applied**
by `supabase db reset` or any migration tooling.

## Why do these files exist?

During early development, the schema went through many incremental changes. These
files have been consolidated into the single
[`00000000000000_baseline.sql`](../00000000000000_baseline.sql) baseline migration
and are kept here only for historical reference.

## Important rules

1. **Do NOT move** any file from this directory back to `supabase/migrations/`.
2. **Do NOT edit** these files — they are frozen history.
3. **`supabase db reset`** only applies `.sql` files directly in
   `supabase/migrations/` (not subdirectories), so this directory is safely ignored.
4. **`scripts/check-migration-naming.sh`** only validates files in the active
   migrations directory, not this archive.

If you need to reference historical schema changes, read the files here, but
**never resurrect them** into the active migration set.
