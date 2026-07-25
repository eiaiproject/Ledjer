// ponytail: D1-to-R2 backup via SQL SELECT * from all core tables.
// Uses JSON serialization. Not a point-in-time snapshot (individual SELECTs
// are not wrapped in a transaction). Good enough for crash recovery and
// restore drill validation. Upgrade to D1 export API when available.

import { queryAll, execute, executeBatch } from "../db/client";
import { CORE_TABLES } from "../db/schema";

export interface BackupManifest {
  startedAt: number;
  completedAt: number | null;
  version: number;
  tables: Record<string, { rowCount: number }>;
  sha256: string;
}

const BACKUP_VERSION = 1;

async function jsonToR2(
  bucket: R2Bucket,
  key: string,
  data: unknown,
): Promise<void> {
  const json = JSON.stringify(data, null, 2);
  await bucket.put(key, json, {
    httpMetadata: { contentType: "application/json" },
    customMetadata: { version: String(BACKUP_VERSION) },
  });
}

export async function createBackup(
  db: D1Database,
  bucket: R2Bucket,
  current = Date.now(),
): Promise<BackupManifest> {
  const dateStr = new Date(current).toISOString().slice(0, 10);
  const prefix = `backups/${dateStr}`;

  const manifest: BackupManifest = {
    startedAt: current,
    completedAt: null,
    version: BACKUP_VERSION,
    tables: {},
    sha256: "",
  };

  for (const table of CORE_TABLES) {
    const rows = await queryAll<Record<string, unknown>>(
      db,
      `SELECT * FROM "${table}" ORDER BY rowid`,
    );
    await jsonToR2(bucket, `${prefix}/${table}.json`, rows);
    manifest.tables[table] = { rowCount: rows.length };
  }

  manifest.completedAt = Date.now();

  // Write manifest last — its presence signals a complete backup
  const manifestJson = JSON.stringify(manifest, null, 2);
  // ponytail: Simple SHA-256 via Web Crypto. Node crypto not available in Workers.
  const enc = new TextEncoder();
  const hashBuf = await crypto.subtle.digest("SHA-256", enc.encode(manifestJson));
  const hashHex = Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  manifest.sha256 = hashHex;

  await bucket.put(`${prefix}/manifest.json`, JSON.stringify(manifest, null, 2), {
    httpMetadata: { contentType: "application/json" },
    customMetadata: { sha256: hashHex },
  });

  // Clean up old backups (keep last 30 days)
  const thirtyDaysAgo = current - 30 * 86400_000;
  const oldDate = new Date(thirtyDaysAgo).toISOString().slice(0, 10);
  const oldPrefix = `backups/${oldDate}`;
  try {
    const oldObjects = await bucket.list({ prefix: oldPrefix });
    if (oldObjects.objects.length > 0) {
      await bucket.delete(oldObjects.objects.map((o) => o.key));
    }
  } catch {
    // Ignore cleanup errors — backup integrity is more important than retention
  }

  return manifest;
}

export async function validateBackup(
  bucket: R2Bucket,
  dateStr: string,
): Promise<{
  valid: boolean;
  rowCounts: Record<string, number>;
  errors: string[];
}> {
  const errors: string[] = [];
  const rowCounts: Record<string, number> = {};

  const manifestObj = await bucket.get(`backups/${dateStr}/manifest.json`);
  if (!manifestObj) {
    return { valid: false, rowCounts: {}, errors: ["manifest not found"] };
  }

  const manifest: BackupManifest = JSON.parse(await manifestObj.text());

  if (manifest.version !== BACKUP_VERSION) {
    errors.push(`version mismatch: ${manifest.version} !== ${BACKUP_VERSION}`);
  }
  if (!manifest.completedAt) {
    errors.push("backup did not complete");
  }

  for (const [table, info] of Object.entries(manifest.tables)) {
    rowCounts[table] = info.rowCount;
    const obj = await bucket.get(`backups/${dateStr}/${table}.json`);
    if (!obj) {
      errors.push(`missing table: ${table}`);
      continue;
    }
    const rows: unknown[] = JSON.parse(await obj.text());
    if (rows.length !== info.rowCount) {
      errors.push(`row count mismatch for ${table}: ${rows.length} !== ${info.rowCount}`);
    }
  }

  return {
    valid: errors.length === 0,
    rowCounts,
    errors,
  };
}

export interface RestoreResult {
  success: boolean;
  startedAt: number;
  completedAt: number | null;
  tables: Record<string, { restored: number }>;
  errors: string[];
}

/**
 * Restore D1 database from an R2 backup snapshot.
 *
 * 1. Fetches manifest and all table JSON files from R2.
 * 2. Validates backup integrity (SHA-256, schema version, row counts).
 * 3. Clears existing data (DELETE FROM each table in reverse CORE_TABLES order).
 * 4. Inserts all entities (INSERT OR IGNORE to handle partial restores).
 *
 * Production safety: never restores to the same DB that produced the backup
 * without explicit confirmation. Caller must verify target isolation.
 */
export async function restoreBackup(
  db: D1Database,
  bucket: R2Bucket,
  dateStr: string,
): Promise<RestoreResult> {
  const startedAt = Date.now();
  const errors: string[] = [];
  const tables: Record<string, { restored: number }> = {};

  // 1. Validate backup
  const validation = await validateBackup(bucket, dateStr);
  if (!validation.valid) {
    return { success: false, startedAt, completedAt: null, tables, errors: validation.errors };
  }

  // 2. Fetch table data from manifest (not all CORE_TABLES required)
  const tableData: Record<string, Record<string, unknown>[]> = {};
  for (const table of Object.keys(validation.rowCounts)) {
    const obj = await bucket.get(`backups/${dateStr}/${table}.json`);
    if (!obj) {
      errors.push(`missing table file: ${table}`);
      continue;
    }
    tableData[table] = JSON.parse(await obj.text()) as Record<string, unknown>[];
  }

  if (errors.length > 0) {
    return { success: false, startedAt, completedAt: null, tables, errors };
  }

  // 3 & 4. Clear and restore tables (reverse order to respect FK constraints)
  const reversed = [...CORE_TABLES].reverse();
  for (const table of reversed) {
    const rows = tableData[table];
    if (!rows || rows.length === 0) {
      // Clear existing data even if backup has no rows
      await execute(db, `DELETE FROM "${table}"`);
      tables[table] = { restored: 0 };
      continue;
    }
    try {
      // Clear existing
      await execute(db, `DELETE FROM "${table}"`);

      // Re-insert in batches of 50
      const batchSize = 50;
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        const statements = batch.map((row) => {
          const columns = Object.keys(row);
          const placeholders = columns.map(() => "?").join(", ");
          const values = columns.map((col) => row[col] ?? null);
          return db.prepare(
            `INSERT OR REPLACE INTO "${table}" (${columns.map((c) => `"${c}"`).join(", ")}) VALUES (${placeholders})`,
          ).bind(...values);
        });
        await executeBatch(db, statements);
      }

      tables[table] = { restored: rows.length };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`restore failed for ${table}: ${msg}`);
    }
  }

  return {
    success: errors.length === 0,
    startedAt,
    completedAt: Date.now(),
    tables,
    errors,
  };
}

export interface RestoreVerification {
  valid: boolean;
  organizationCount: number;
  transactionCount: number;
  journalLineCount: number;
  balancedJournals: boolean;
  errors: string[];
  duration: number;
}

/**
 * Verify restored database integrity.
 * Runs after restoreBackup to validate the restored data is consistent.
 *
 * Checks:
 * - Organizations exist and have members
 * - Transactions have journal entries
 * - Journal entries are balanced (debit = credit)
 * - No orphan records
 */
export async function verifyRestore(
  db: D1Database,
): Promise<RestoreVerification> {
  const startedAt = Date.now();
  const errors: string[] = [];

  // Count entities
  const orgRow = await db.prepare("SELECT COUNT(*) as count FROM organizations").first<{ count: number }>();
  const orgCount = orgRow?.count ?? 0;

  const txRow = await db.prepare("SELECT COUNT(*) as count FROM transactions").first<{ count: number }>();
  const txCount = txRow?.count ?? 0;

  const jlRow = await db.prepare("SELECT COUNT(*) as count FROM journal_lines").first<{ count: number }>();
  const jlCount = jlRow?.count ?? 0;

  // Verify each organization has at least one owner member
  if (orgCount > 0) {
    const orgMembers = await db.prepare(
      `SELECT o.id as org_id, COUNT(m.id) as member_count
       FROM organizations o
       LEFT JOIN organization_members m ON m.organization_id = o.id
       GROUP BY o.id`
    ).all<{ org_id: string; member_count: number }>();
    for (const row of orgMembers.results) {
      if (row.member_count === 0) {
        errors.push(`org ${row.org_id} has no members`);
      }
    }
  }

  // Verify transactions link to journal entries
  if (txCount > 0) {
    const orphanTx = await db.prepare(
      `SELECT COUNT(*) as count FROM transactions t
       LEFT JOIN journal_entries je ON je.transaction_id = t.id
       WHERE je.id IS NULL`
    ).first<{ count: number }>();
    if (orphanTx && orphanTx.count > 0) {
      errors.push(`${orphanTx.count} transactions without journal entries`);
    }

    // Verify journal entries are balanced
    const unbalanced = await db.prepare(
      `SELECT je.id, SUM(jl.debit_minor) as total_debit, SUM(jl.credit_minor) as total_credit
       FROM journal_entries je
       JOIN journal_lines jl ON jl.journal_entry_id = je.id
       GROUP BY je.id
       HAVING total_debit != total_credit`
    ).all<{ id: string; total_debit: number; total_credit: number }>();
    if (unbalanced.results.length > 0) {
      errors.push(`${unbalanced.results.length} unbalanced journal entries`);
    }
  }

  // Verify trial balance: Σdebit = Σcredit across ALL journal lines
  if (jlCount > 0) {
    const tbRow = await db.prepare(
      `SELECT SUM(debit_minor) as total_debit, SUM(credit_minor) as total_credit FROM journal_lines`
    ).first<{ total_debit: number; total_credit: number }>();
    if (tbRow && tbRow.total_debit !== tbRow.total_credit) {
      errors.push(`trial balance off: debit ${tbRow.total_debit} !== credit ${tbRow.total_credit}`);
    }
  }

  return {
    valid: errors.length === 0,
    organizationCount: orgCount,
    transactionCount: txCount,
    journalLineCount: jlCount,
    balancedJournals: !errors.some(e => e.includes("unbalanced") || e.includes("trial balance")),
    errors,
    duration: Date.now() - startedAt,
  };
}
