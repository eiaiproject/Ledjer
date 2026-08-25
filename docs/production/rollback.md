# Rollback

## Worker Rollback

```bash
# List recent versions
npx wrangler versions list

# Roll back to a specific version
npx wrangler rollback --version-id <id>

# Roll back to the last stable version
npx wrangler rollback
```

### Automated rollback (CI/CD)

The `auto-deploy.yml` workflow runs a smoke check after deploy.
If smoke fails, the deploy is marked as failed - automated rollback
is NOT yet implemented (manual only).

**To add automated rollback:**

1. Add `npx wrangler rollback --version-id <previous-version>` to CI.
2. Map previous version ID from deployment artifacts.
3. Add approval gate for rollback in production.

## Database Rollback

D1 uses forward-only migrations. No rollback.

### If a migration has a bug

1. Write a new forward-only migration that reverses the change
   (e.g., add back a dropped column, restore data from backup).
2. Test on staging first.
3. Apply to production via `pnpm --filter web db:migrations:apply:remote`.

### If data is corrupted

1. Restore from backup (see [backup-and-restore.md](backup-and-restore.md)).
2. Re-apply migrations from the backup point forward.

## Rollback Safety

- Never roll back a migration by deleting it.
- Never modify an existing migration.
- Always write a forward-only fix.
