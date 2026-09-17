/**
 * Sync outbox repository — append-only log for changes not yet synced.
 *
 * Setiap write ke tabel bisnis (accounts, transactions, products, parties)
 * juga append baris ke sync_outbox. Background sync service akan memproses
 * outbox saat online.
 */

import type { Database } from "@sqlite.org/sqlite-wasm";

export type OutboxOpType = "create" | "update" | "delete";

export interface OutboxEntry {
  id: number;
  userId: string;
  entityType: string;
  entityId: string;
  opType: OutboxOpType;
  payload: string;
  createdAt: number;
  syncedAt: number | null;
}

/** Map a raw row array to an OutboxEntry object. */
function rowToEntry(row: unknown[]): OutboxEntry {
  return {
    id: Number(row[0]),
    userId: String(row[1]),
    entityType: String(row[2]),
    entityId: String(row[3]),
    opType: String(row[4]) as OutboxOpType,
    payload: String(row[5]),
    createdAt: Number(row[6]),
    syncedAt: row[7] as number | null,
  };
}

/**
 * Append entry ke sync_outbox.
 * Dipanggil SETELAH write ke tabel bisnis — never before.
 */
export function appendOutbox(
  db: Database,
  userId: string,
  entityType: string,
  entityId: string,
  opType: OutboxOpType,
  payload: Record<string, unknown>,
): void {
  const now = Date.now();
  db.exec({
    sql: `INSERT INTO sync_outbox (user_id, entity_type, entity_id, op_type, payload, created_at)
          VALUES (?, ?, ?, ?, ?, ?)`,
    bind: [userId, entityType, entityId, opType, JSON.stringify(payload), now],
  });
}

/**
 * Ambil semua entri outbox yang belum di-sync.
 * Dipanggil oleh sync service.
 */
export function getPendingOutbox(db: Database, userId: string): OutboxEntry[] {
  const stmt = db.prepare(
    `SELECT id, user_id, entity_type, entity_id, op_type, payload, created_at, synced_at
     FROM sync_outbox WHERE user_id = ? AND synced_at IS NULL ORDER BY id ASC`,
  );
  stmt.bind([userId]);
  const results: OutboxEntry[] = [];
  while (stmt.step()) {
    results.push(rowToEntry(stmt.get([])));
  }
  stmt.finalize();
  return results;
}

/**
 * Tandai entri outbox sebagai sudah di-sync.
 */
export function markOutboxSynced(db: Database, entryIds: number[]): void {
  if (entryIds.length === 0) return;
  const now = Date.now();
  const placeholders = entryIds.map(() => "?").join(",");
  db.exec({
    sql: `UPDATE sync_outbox SET synced_at = ? WHERE id IN (${placeholders})`,
    bind: [now, ...entryIds],
  });
}

/**
 * Hapus entri outbox yang sudah di-sync (GC, opsional).
 */
export function cleanupSyncedOutbox(
  db: Database,
  olderThanMs: number = 7 * 24 * 60 * 60 * 1000,
): void {
  const cutoff = Date.now() - olderThanMs;
  db.exec({
    sql: `DELETE FROM sync_outbox WHERE synced_at IS NOT NULL AND synced_at < ?`,
    bind: [cutoff],
  });
}

/**
 * Hitung jumlah entri outbox yang belum di-sync.
 */
export function countPendingOutbox(db: Database, userId: string): number {
  const stmt = db.prepare(
    `SELECT COUNT(*) FROM sync_outbox WHERE user_id = ? AND synced_at IS NULL`,
  );
  stmt.bind([userId]);
  let count = 0;
  if (stmt.step()) {
    count = Number(stmt.get([])[0]);
  }
  stmt.finalize();
  return count;
}
