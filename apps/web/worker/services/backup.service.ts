// ponytail: D1-to-R2 backup via SQL SELECT * from all core tables.
// Uses JSON serialization. Not a point-in-time snapshot (individual SELECTs
// are not wrapped in a transaction). Good enough for crash recovery and
// restore drill validation. Upgrade to D1 export API when available.

import { queryAll, executeBatch } from "../db/client";
import { sha256Hex } from "../auth/tokens";
import { CORE_TABLES } from "../db/schema";

export interface BackupManifest {
  startedAt: number;
  completedAt: number | null;
  version: number;
  tables: Record<string, { rowCount: number }>;
  sha256: string;
}

const BACKUP_VERSION = 1;

/** Stable hash input for a manifest: everything except the sha itself. */
export function manifestHashPayload(manifest: Pick<BackupManifest, "version" | "startedAt" | "completedAt" | "tables">): string {
  return JSON.stringify({
    version: manifest.version,
    startedAt: manifest.startedAt,
    completedAt: manifest.completedAt,
    tables: manifest.tables,
  });
}

export async function manifestSha256(
  manifest: Pick<BackupManifest, "version" | "startedAt" | "completedAt" | "tables">,
): Promise<string> {
  return sha256Hex(manifestHashPayload(manifest));
}

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

  let totalRows = 0;

  for (const table of CORE_TABLES) {
    const rows = await queryAll<Record<string, unknown>>(
      db,
      `SELECT * FROM "${table}" ORDER BY rowid`,
    );
    await jsonToR2(bucket, `${prefix}/${table}.json`, rows);
    manifest.tables[table] = { rowCount: rows.length };
    totalRows += rows.length;
  }

  if (totalRows > 1_000_000) {
    (manifest as unknown as Record<string, unknown>).size_warning = `Backup has ${totalRows} total rows, which may impact restore performance`;
  }

  manifest.completedAt = Date.now();
  (manifest as unknown as Record<string, unknown>).consistency_warning = true;

  // Hash covers the stable payload only (never the sha field itself), so the
  // post-write re-read below recomputes the identical digest.
  manifest.sha256 = await manifestSha256(manifest);

  await bucket.put(`${prefix}/manifest.json`, JSON.stringify(manifest, null, 2), {
    httpMetadata: { contentType: "application/json" },
    customMetadata: { sha256: manifest.sha256 },
  });

  // Post-write verification: recompute the digest over the stored payload
  // and warn only on a genuine mismatch.
  const writtenObj = await bucket.get(`${prefix}/manifest.json`);
  if (writtenObj) {
    const writtenManifest = JSON.parse(await writtenObj.text()) as BackupManifest;
    const recomputed = await manifestSha256(writtenManifest);
    if (recomputed !== writtenManifest.sha256) {
      (manifest as unknown as Record<string, unknown>).integrity_warning = "SHA-256 mismatch after write";
    }
  }

  await cleanupOldBackups(bucket, current);

  return manifest;
}

/** Remove backups older than 30 days (retensi minimal 14 hari per PRD §17.1).
 *  Lists the whole backups/ prefix so a missed cron run cannot strand old
 *  snapshots forever (previously only the exact 30-day-old date was swept). */
async function cleanupOldBackups(bucket: R2Bucket, current: number): Promise<void> {
  const cutoff = new Date(current - 30 * 86_400_000).toISOString().slice(0, 10);
  try {
    const listed = await bucket.list({ prefix: "backups/" });
    const stale = new Set<string>();
    for (const obj of listed.objects) {
      const match = /^backups\/(\d{4}-\d{2}-\d{2})\//.exec(obj.key);
      if (match && match[1] < cutoff) stale.add(`backups/${match[1]}`);
    }
    for (const prefix of stale) {
      const oldObjects = await bucket.list({ prefix });
      if (oldObjects.objects.length > 0) {
        await bucket.delete(oldObjects.objects.map((o) => o.key));
      }
    }
  } catch {
    // Ignore cleanup errors
  }
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

/** Max statements per D1 batch during restore (bounds Worker memory). */
export const RESTORE_BATCH_SIZE = 200;

export interface RestoreResult {
  success: boolean;
  startedAt: number;
  completedAt: number | null;
  tables: Record<string, { restored: number }>;
  errors: string[];
  warnings: string[];
}

/**
 * Restore D1 database from an R2 backup snapshot.
 *
 * 1. Fetches manifest and all table JSON files from R2.
 * 2. Validates backup integrity (version, row counts).
 * 3. Clears existing data (children first, reverse CORE_TABLES order).
 * 4. Inserts all entities (parents first, CORE_TABLES order) to satisfy FKs.
 */
export async function restoreBackup(
  db: D1Database,
  bucket: R2Bucket,
  dateStr: string,
): Promise<RestoreResult> {
  const startedAt = Date.now();
  const errors: string[] = [];
  const tables: Record<string, { restored: number }> = {};
  const warnings: string[] = [];

  const validation = await validateBackup(bucket, dateStr);
  if (!validation.valid) {
    return { success: false, startedAt, completedAt: null, tables, errors: validation.errors, warnings: [] };
  }

  const existingWarnings = await checkForExistingData(db);
  warnings.push(...existingWarnings);

  const tableData = await fetchTableDataFromBackup(bucket, dateStr, validation.rowCounts, errors);
  if (errors.length > 0) {
    return { success: false, startedAt, completedAt: null, tables, errors, warnings };
  }

  try {
    const allStatements: D1PreparedStatement[] = [];
    // Delete children first so FK constraints hold.
    const reversed = [...CORE_TABLES].reverse();
    for (const table of reversed) {
      const rows = tableData[table];
      if (!rows) {
        tables[table] = { restored: 0 };
        continue;
      }
      allStatements.push(db.prepare(`DELETE FROM "${table}"`) /* no-org-scope */);
    }
    // Insert parents first (CORE_TABLES order) so FK constraints hold.
    for (const table of CORE_TABLES) {
      const rows = tableData[table];
      if (!rows) {
        tables[table] = { restored: 0 };
        continue;
      }
      for (const row of rows) {
        const columns = Object.keys(row);
        const quoted = columns.map((c) => `"${c}"`).join(", ");
        const placeholders = columns.map(() => "?").join(", ");
        const values = columns.map((col) => row[col] ?? null);
        allStatements.push(
          db.prepare(
            `INSERT OR REPLACE INTO "${table}" (${quoted}) VALUES (${placeholders})`,
          ).bind(...values),
        );
      }
      tables[table] = { restored: rows.length };
    }

    // Bounded batches: a large org would otherwise exceed D1 batch limits
    // and Worker memory with a single giant batch.
    for (let i = 0; i < allStatements.length; i += RESTORE_BATCH_SIZE) {
      await executeBatch(db, allStatements.slice(i, i + RESTORE_BATCH_SIZE));
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`restore failed: ${msg}`);
  }

  return {
    success: errors.length === 0,
    startedAt,
    completedAt: errors.length === 0 ? Date.now() : null,
    tables,
    errors,
    warnings,
  };
}

async function checkForExistingData(db: D1Database): Promise<string[]> {
  const existingOrg = await db
    .prepare("SELECT COUNT(*) as count FROM organizations")
    .first<{ count: number }>();
  if (existingOrg && existingOrg.count > 0) {
    return [`target database has ${existingOrg.count} organizations; restore may overwrite existing data`];
  }
  return [];
}

async function fetchTableDataFromBackup(
  bucket: R2Bucket,
  dateStr: string,
  rowCounts: Record<string, number>,
  errors: string[],
): Promise<Record<string, Record<string, unknown>[]>> {
  const tableData: Record<string, Record<string, unknown>[]> = {};
  for (const table of Object.keys(rowCounts)) {
    const obj = await bucket.get(`backups/${dateStr}/${table}.json`);
    if (!obj) {
      errors.push(`missing table file: ${table}`);
      continue;
    }
    tableData[table] = JSON.parse(await obj.text()) as Record<string, unknown>[];
  }
  return tableData;
}

export interface RestoreVerification {
  valid: boolean;
  organizationCount: number;
  transactionCount: number;
  journalLineCount: number;
  balancedJournals: boolean;
  schemaValid: boolean;
  errors: string[];
  duration: number;
}

/**
 * Verify restored database integrity.
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

  const { orgCount, txCount, jlCount } = await countEntities(db);

  const schemaValid = await verifySchemaIntegrity(db, errors);
  await verifyOrgMembers(db, orgCount, errors);
  await verifyTransactionLinksAndBalance(db, txCount, errors);
  await verifyTrialBalance(db, jlCount, errors);

  return {
    valid: errors.length === 0,
    organizationCount: orgCount,
    transactionCount: txCount,
    journalLineCount: jlCount,
    balancedJournals: !errors.some((e) => e.includes("unbalanced") || e.includes("trial balance")),
    schemaValid,
    errors,
    duration: Date.now() - startedAt,
  };
}

async function countEntities(db: D1Database): Promise<{
  orgCount: number;
  txCount: number;
  jlCount: number;
}> {
  const orgRow = await db.prepare("SELECT COUNT(*) as count FROM organizations").first<{ count: number }>();
  const txRow = await db.prepare("SELECT COUNT(*) as count FROM transactions").first<{ count: number }>();
  const jlRow = await db.prepare("SELECT COUNT(*) as count FROM journal_lines").first<{ count: number }>();
  return {
    orgCount: orgRow?.count ?? 0,
    txCount: txRow?.count ?? 0,
    jlCount: jlRow?.count ?? 0,
  };
}

async function verifySchemaIntegrity(db: D1Database, errors: string[]): Promise<boolean> {
  let valid = true;
  for (const table of CORE_TABLES) {
    try {
      const row = await db.prepare(`SELECT COUNT(*) as count FROM "${table}"`).first<{ count: number }>();
      if (row === null) { valid = false; errors.push(`table missing: ${table}`); }
    } catch {
      valid = false;
      errors.push(`table missing or inaccessible: ${table}`);
    }
  }
  return valid;
}

async function verifyOrgMembers(db: D1Database, orgCount: number, errors: string[]): Promise<void> {
  if (orgCount === 0) return;
  const orgMembers = await db.prepare(
    `SELECT o.id as org_id, COUNT(m.user_id) as member_count
     FROM organizations o
     LEFT JOIN memberships m ON m.organization_id = o.id
     GROUP BY o.id`,
  ).all<{ org_id: string; member_count: number }>();
  for (const row of orgMembers.results) {
    if (row.member_count === 0) {
      errors.push(`org ${row.org_id} has no members`);
    }
  }
}

async function verifyTransactionLinksAndBalance(
  db: D1Database,
  txCount: number,
  errors: string[],
): Promise<void> {
  if (txCount === 0) return;

  const orphanTx = await db.prepare(
    `SELECT COUNT(*) as count FROM transactions t
     LEFT JOIN journal_entries je ON je.transaction_id = t.id
     WHERE je.id IS NULL`,
  ).first<{ count: number }>();
  if (orphanTx && orphanTx.count > 0) {
    errors.push(`${orphanTx.count} transactions without journal entries`);
  }

  const unbalanced = await db.prepare(
    `SELECT je.id, SUM(jl.debit_idr) as total_debit, SUM(jl.credit_idr) as total_credit
     FROM journal_entries je
     JOIN journal_lines jl ON jl.journal_entry_id = je.id
     GROUP BY je.id
     HAVING total_debit != total_credit`,
  ).all<{ id: string; total_debit: number; total_credit: number }>();
  if (unbalanced.results.length > 0) {
    errors.push(`${unbalanced.results.length} unbalanced journal entries`);
  }
}

async function verifyTrialBalance(db: D1Database, jlCount: number, errors: string[]): Promise<void> {
  if (jlCount === 0) return;
  const tbRow = await db.prepare(
    `SELECT SUM(debit_idr) as total_debit, SUM(credit_idr) as total_credit FROM journal_lines`,
  ).first<{ total_debit: number; total_credit: number }>();
  if (tbRow && tbRow.total_debit !== tbRow.total_credit) {
    errors.push(`trial balance off: debit ${tbRow.total_debit} !== credit ${tbRow.total_credit}`);
  }
}

// ---------------------------------------------------------------------------
// Restore Drill
// ---------------------------------------------------------------------------

export interface DrillReport {
  date: string;
  backupExists: boolean;
  backupComplete: boolean;
  backupVersion: number;
  tableCount: number;
  totalRows: number;
  valid: boolean;
  errors: string[];
  duration: number;
  checkedAt: number;
}

/** Validate backup integrity without restoring to a live DB (offline). */
export async function runRestoreDrill(
  bucket: R2Bucket,
): Promise<DrillReport> {
  const startedAt = Date.now();
  const errors: string[] = [];

  const latest = await findLatestBackup(bucket);
  if (!latest) {
    return {
      date: "none", backupExists: false, backupComplete: false, backupVersion: 0,
      tableCount: 0, totalRows: 0, valid: false,
      errors: ["no backups found"],
      duration: Date.now() - startedAt, checkedAt: startedAt,
    };
  }

  const dateStr = latest;

  const validation = await validateBackup(bucket, dateStr);
  if (!validation.valid) {
    return {
      date: dateStr, backupExists: true, backupComplete: false, backupVersion: 0,
      tableCount: Object.keys(validation.rowCounts).length, totalRows: 0, valid: false,
      errors: validation.errors,
      duration: Date.now() - startedAt, checkedAt: startedAt,
    };
  }

  const totalRows = Object.values(validation.rowCounts).reduce((s, c) => s + c, 0);
  const tableCount = Object.keys(validation.rowCounts).length;

  const { backupVersion, backupComplete } = await runOfflineAccountingChecks(
    bucket, dateStr, errors,
  );

  return {
    date: dateStr,
    backupExists: true,
    backupComplete,
    backupVersion,
    tableCount,
    totalRows,
    valid: errors.length === 0,
    errors,
    duration: Date.now() - startedAt,
    checkedAt: startedAt,
  };
}

async function findLatestBackup(bucket: R2Bucket): Promise<string | null> {
  const backupList = await bucket.list({ prefix: "backups/" });
  const manifestKeys = backupList.objects
    .filter((o) => o.key.endsWith("/manifest.json"))
    .map((o) => o.key.replace("/manifest.json", "").replace("backups/", ""))
    .sort((a, b) => b.localeCompare(a));
  return manifestKeys.length > 0 ? manifestKeys[0] : null;
}

async function runOfflineAccountingChecks(
  bucket: R2Bucket,
  dateStr: string,
  errors: string[],
): Promise<{ backupVersion: number; backupComplete: boolean }> {
  let backupVersion = 0;
  let backupComplete = false;

  try {
    const manifestObj = await bucket.get(`backups/${dateStr}/manifest.json`);
    if (!manifestObj) {
      return { backupVersion: 0, backupComplete: false };
    }
    const manifest: BackupManifest = JSON.parse(await manifestObj.text());
    backupVersion = manifest.version;
    backupComplete = !!manifest.completedAt;

    await checkTransactionIntegrity(bucket, dateStr, errors);
    await checkJournalBalance(bucket, dateStr, errors);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(`offline validation error: ${msg}`);
  }

  return { backupVersion, backupComplete };
}

async function checkTransactionIntegrity(
  bucket: R2Bucket,
  dateStr: string,
  errors: string[],
): Promise<void> {
  const txObj = await bucket.get(`backups/${dateStr}/transactions.json`);
  if (!txObj) return;

  const transactions: { id: string; organization_id: string }[] = JSON.parse(await txObj.text());
  if (transactions.length === 0) return;

  const jeObj = await bucket.get(`backups/${dateStr}/journal_entries.json`);
  if (!jeObj) return;

  const entries: { id: string; transaction_id: string }[] = JSON.parse(await jeObj.text());
  const orphanTx = transactions.filter(
    (tx) => !entries.some((je) => je.transaction_id === tx.id),
  );
  if (orphanTx.length > 0) {
    errors.push(`${orphanTx.length} transactions without journal entries in backup`);
  }
}

async function checkJournalBalance(
  bucket: R2Bucket,
  dateStr: string,
  errors: string[],
): Promise<void> {
  const jlObj = await bucket.get(`backups/${dateStr}/journal_lines.json`);
  if (!jlObj) return;

  const journalLines: { journal_entry_id: string; debit_idr?: number; credit_idr?: number }[] =
    JSON.parse(await jlObj.text());
  const linesByEntry: Record<string, { debit: number; credit: number }> = {};
  for (const line of journalLines) {
    if (!linesByEntry[line.journal_entry_id]) {
      linesByEntry[line.journal_entry_id] = { debit: 0, credit: 0 };
    }
    linesByEntry[line.journal_entry_id].debit += line.debit_idr ?? 0;
    linesByEntry[line.journal_entry_id].credit += line.credit_idr ?? 0;
  }
  const unbalancedEntries = Object.entries(linesByEntry)
    .filter(([, v]) => v.debit !== v.credit);
  if (unbalancedEntries.length > 0) {
    errors.push(`${unbalancedEntries.length} unbalanced journal entries in backup`);
  }
}