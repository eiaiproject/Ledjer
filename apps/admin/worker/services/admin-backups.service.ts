import { queryAll } from "../db/client";
import { CORE_TABLES } from "../db/schema";

const BACKUP_VERSION = 1;

export interface BackupSummary {
  date: string;
  completed: boolean;
  tableCount: number;
  totalRows: number;
  version: number;
  sha256: string;
  startedAt: number;
  completedAt: number | null;
  sizeWarning?: string;
  consistencyWarning?: boolean;
}

export async function listBackups(bucket: R2Bucket): Promise<BackupSummary[]> {
  const listed = await bucket.list({ prefix: "backups/" });
  const manifests = listed.objects.filter((o) => o.key.endsWith("/manifest.json"));
  const summaries: BackupSummary[] = [];

  for (const manifestObj of manifests) {
    const date = manifestObj.key.replace("backups/", "").replace("/manifest.json", "");
    try {
      const obj = await bucket.get(manifestObj.key);
      if (!obj) continue;
      const manifest = JSON.parse(await obj.text()) as Record<string, unknown>;
      const tables = (manifest.tables ?? {}) as Record<string, { rowCount: number }>;
      summaries.push({
        date,
        completed: !!manifest.completedAt,
        tableCount: Object.keys(tables).length,
        totalRows: Object.values(tables).reduce((s, t) => s + (t.rowCount ?? 0), 0),
        version: (manifest.version as number) ?? BACKUP_VERSION,
        sha256: (manifest.sha256 as string) ?? "",
        startedAt: (manifest.startedAt as number) ?? 0,
        completedAt: (manifest.completedAt as number | null) ?? null,
        sizeWarning: manifest.size_warning as string | undefined,
        consistencyWarning: manifest.consistency_warning as boolean | undefined,
      });
    } catch {
      // Skip unreadable manifests
    }
  }

  return summaries.sort((a, b) => b.date.localeCompare(a.date));
}

export interface BackupDetail extends BackupSummary {
  tables: Record<string, { rowCount: number }>;
  errors: string[];
  valid: boolean;
}

export async function getBackupDetail(
  bucket: R2Bucket,
  date: string,
): Promise<BackupDetail> {
  const manifestObj = await bucket.get(`backups/${date}/manifest.json`);
  if (!manifestObj) {
    return {
      date, completed: false, tableCount: 0, totalRows: 0, version: 0,
      sha256: "", startedAt: 0, completedAt: null, tables: {}, errors: ["manifest not found"], valid: false,
    };
  }

  const manifest = JSON.parse(await manifestObj.text()) as {
    startedAt: number; completedAt: number | null; version: number;
    tables: Record<string, { rowCount: number }>; sha256: string;
    size_warning?: string; consistency_warning?: boolean;
  };

  // Validate each table file exists with matching row count.
  const errors: string[] = [];
  for (const [table, info] of Object.entries(manifest.tables)) {
    const obj = await bucket.get(`backups/${date}/${table}.json`);
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
    date,
    completed: !!manifest.completedAt,
    tableCount: Object.keys(manifest.tables).length,
    totalRows: Object.values(manifest.tables).reduce((s, t) => s + t.rowCount, 0),
    version: manifest.version,
    sha256: manifest.sha256,
    startedAt: manifest.startedAt,
    completedAt: manifest.completedAt,
    sizeWarning: manifest.size_warning,
    consistencyWarning: manifest.consistency_warning,
    tables: manifest.tables,
    errors,
    valid: errors.length === 0 && !!manifest.completedAt,
  };
}

/**
 * Trigger a manual backup of the full D1 database to R2, then run a restore
 * drill against the freshly written snapshot. Same format as the scheduled
 * backup in the main worker (backups/YYYY-MM-DD/…).
 */
export async function triggerBackup(
  db: D1Database,
  bucket: R2Bucket,
): Promise<{ summary: BackupSummary; drill: DrillReport }> {
  const summary = await createBackup(db, bucket);
  const drill = await runRestoreDrill(bucket, summary.date);
  return { summary, drill };
}

export interface DrillReport {
  date: string;
  backupExists: boolean;
  valid: boolean;
  errors: string[];
  tableCount: number;
  totalRows: number;
  checkedAt: number;
}

/** Validate the latest (or a specific) backup offline - never touches a live DB. */
export async function runRestoreDrill(bucket: R2Bucket, date?: string): Promise<DrillReport> {
  const checkedAt = Date.now();
  const targetDate = date ?? (await findLatestBackupDate(bucket));
  if (!targetDate) {
    return { date: "none", backupExists: false, valid: false, errors: ["no backups found"], tableCount: 0, totalRows: 0, checkedAt };
  }

  const detail = await getBackupDetail(bucket, targetDate);
  return {
    date: targetDate,
    backupExists: true,
    valid: detail.valid,
    errors: detail.errors,
    tableCount: detail.tableCount,
    totalRows: detail.totalRows,
    checkedAt,
  };
}

async function findLatestBackupDate(bucket: R2Bucket): Promise<string | null> {
  const listed = await bucket.list({ prefix: "backups/" });
  const dates = listed.objects
    .filter((o) => o.key.endsWith("/manifest.json"))
    .map((o) => o.key.replace("backups/", "").replace("/manifest.json", ""))
    .sort((a, b) => b.localeCompare(a));
  return dates.length > 0 ? dates[0] : null;
}

async function createBackup(db: D1Database, bucket: R2Bucket): Promise<BackupSummary> {
  const startedAt = Date.now();
  const dateStr = new Date(startedAt).toISOString().slice(0, 10);
  const prefix = `backups/${dateStr}`;

  const tables: Record<string, { rowCount: number }> = {};
  for (const table of CORE_TABLES) {
    const rows = await queryAll<Record<string, unknown>>(db, `SELECT * FROM "${table}" ORDER BY rowid`);
    await bucket.put(`${prefix}/${table}.json`, JSON.stringify(rows, null, 2), {
      httpMetadata: { contentType: "application/json" },
    });
    tables[table] = { rowCount: rows.length };
  }

  const manifest = {
    startedAt,
    completedAt: Date.now(),
    version: BACKUP_VERSION,
    tables,
    sha256: "",
  };
  const manifestJson = JSON.stringify(manifest, null, 2);
  const enc = new TextEncoder();
  const hashBuf = await crypto.subtle.digest("SHA-256", enc.encode(manifestJson));
  const hashHex = Array.from(new Uint8Array(hashBuf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  manifest.sha256 = hashHex;

  await bucket.put(`${prefix}/manifest.json`, JSON.stringify(manifest, null, 2), {
    httpMetadata: { contentType: "application/json" },
    customMetadata: { sha256: hashHex },
  });

  return {
    date: dateStr,
    completed: true,
    tableCount: Object.keys(tables).length,
    totalRows: Object.values(tables).reduce((s, t) => s + t.rowCount, 0),
    version: BACKUP_VERSION,
    sha256: hashHex,
    startedAt,
    completedAt: manifest.completedAt,
  };
}
