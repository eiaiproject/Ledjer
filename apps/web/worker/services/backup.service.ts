// ponytail: D1-to-R2 backup via SQL SELECT * from all core tables.
// Uses JSON serialization. Not a point-in-time snapshot (individual SELECTs
// are not wrapped in a transaction). Good enough for crash recovery and
// restore drill validation. Upgrade to D1 export API when available.

import { queryAll } from "../db/client";
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
