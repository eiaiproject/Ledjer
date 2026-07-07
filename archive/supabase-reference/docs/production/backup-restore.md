# Production Backup & Restore

Last updated: 2026-06-27

## Backup Scope

| Component | Backup Method | Frequency |
|-----------|---------------|-----------|
| PostgreSQL database | Supabase automatic backups | Daily (7 days retention on Pro) |
| Auth users | Included in database backup | Daily |
| Storage buckets | Supabase Storage backups | Daily |
| Edge Functions | Git repository | On deploy |
| Frontend | Git + hosting platform | On deploy |

## RPO/RTO Targets

| Metric | Target | Notes |
|--------|--------|-------|
| **RPO** (Recovery Point Objective) | 24 hours | Based on daily Supabase backups |
| **RTO** (Recovery Time Objective) | 1 hour | Time to restore from backup |

## Supabase Backup Tiers

| Plan | Daily Backups | PITR (Point-in-Time Recovery) | Cost |
|------|---------------|-------------------------------|------|
| Free | 7 days | No | $0 |
| Pro | 7 days | Yes (7 days) | $25/mo |
| Team | 14 days | Yes (14 days) | $599/mo |

**Recommendation:** Pro plan minimum for production with accounting data.

## Backup Verification

### Monthly Drill Checklist

1. **Trigger manual backup**
   - Supabase dashboard → Database → Backups → Create backup

2. **Restore to temporary project**
   - Create new Supabase project (or use branch)
   - Restore from backup
   - Verify restore completes

3. **Data integrity checks**
   ```sql
   -- Row counts for key tables
   SELECT 'organizations' as tbl, count(*) FROM organizations
   UNION ALL SELECT 'transactions', count(*) FROM transactions
   UNION ALL SELECT 'journal_entries', count(*) FROM journal_entries
   UNION ALL SELECT 'journal_lines', count(*) FROM journal_lines
   UNION ALL SELECT 'accounts', count(*) FROM accounts
   UNION ALL SELECT 'audit_logs', count(*) FROM audit_logs;

   -- Check for orphaned records
   SELECT count(*) FROM journal_lines jl
   WHERE NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.id = jl.journal_entry_id);

   -- Verify accounting balance
   SELECT abs(sum(debit) - sum(credit)) as imbalance
   FROM journal_lines jl
   JOIN journal_entries je ON je.id = jl.journal_entry_id
   WHERE je.status = 'posted';
   ```

4. **Verify RLS still works**
   - Test with authenticated role
   - Verify org isolation

5. **Document drill results**
   - Date of drill
   - Restore time
   - Any issues found
   - Sign-off by operator

## Emergency Restore Procedure

### ⚠️ WARNING: This is destructive. Only use when data is compromised.

1. **Stop all writes**
   - Disable frontend access (maintenance mode or DNS change)
   - This prevents new data during restore

2. **Assess damage**
   - Check audit_logs for recent changes
   - Identify scope of corruption/loss
   - Determine restore point

3. **Create current backup (if possible)**
   ```bash
   # Even corrupt data may be useful for forensics
   supabase db dump --db-url $DB_URL > pre_restore_$(date +%Y%m%d_%H%M%S).sql
   ```

4. **Restore from backup**
   - Supabase dashboard → Database → Backups → Restore
   - Select appropriate backup point

5. **Post-restore verification**
   - Run data integrity checks (see above)
   - Verify RLS policies
   - Test authentication
   - Test transaction posting
   - Verify reports render correctly

6. **Re-enable access**
   - Remove maintenance mode
   - Monitor for issues

7. **Communicate**
   - Notify affected users
   - Document what happened and what was restored

## Access Control for Restore

| Action | Required Access |
|--------|-----------------|
| View backups | Supabase dashboard access |
| Trigger manual backup | Owner/Admin of Supabase project |
| Restore from backup | Owner of Supabase project |
| Modify production database | Service role key + SQL console |

## Accounting Data Consistency

After any restore, verify:

1. **Double-entry integrity**: All journal entries balance (debit = credit)
2. **Transaction numbering**: No gaps or duplicates
3. **Running balances**: Correct per account
4. **Stock quantities**: Match stock_movements
5. **Audit log continuity**: No missing entries for recent operations

```sql
-- Quick consistency check
DO $$
DECLARE
  v_imbalance NUMERIC;
  v_txn_count INTEGER;
  v_je_count INTEGER;
BEGIN
  SELECT abs(sum(debit) - sum(credit)) INTO v_imbalance
  FROM journal_lines jl
  JOIN journal_entries je ON je.id = jl.journal_entry_id
  WHERE je.status = 'posted';

  IF v_imbalance > 0.01 THEN
    RAISE WARNING 'Journal imbalance detected: %', v_imbalance;
  END IF;

  SELECT count(*) INTO v_txn_count FROM transactions WHERE status = 'posted';
  SELECT count(*) INTO v_je_count FROM journal_entries WHERE status = 'posted';

  RAISE NOTICE 'Posted transactions: %, Posted journal entries: %', v_txn_count, v_je_count;
END $$;
```

## Communication During Data Incident

1. **Immediate** (within 15 min): Internal team notification
2. **30 min**: Status page update if available
3. **1 hour**: Email to affected users (if data integrity at risk)
4. **Post-incident**: Detailed communication with root cause and actions taken
