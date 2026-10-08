/**
 * Sync service — server sisi tipis untuk local-first.
 * Op-log append-only + dedup op_id + LWW by HLC untuk mutable entities.
 */

import { execute, queryAll, queryFirst } from "../db/client";
import { badRequest } from "../http/errors";

export interface SyncOp {
  op_id: string;
  user_id: string;
  device_id: string | null;
  entity_type: string;
  entity_id: string;
  op_type: "create" | "update" | "delete";
  payload: string;
  hlc: string;
  created_at: number;
}

/** Entity yang mutable → LWW by HLC. Immutable (transactions) → dedup op_id saja. */
const MUTABLE_ENTITIES = new Set(["account", "product", "party", "ledger_settings", "user"]);

/**
 * Push single op — dedup op_id, LWW untuk mutable.
 * Return { stored: boolean, reason?: string }
 */
export async function pushSyncOp(
  db: D1Database,
  op: SyncOp,
): Promise<{ stored: boolean; reason?: string }> {
  // Validasi batas agar satu request tidak bisa bloat D1.
  if (!op.entity_type || op.entity_type.length > 64) {
    throw badRequest("invalid_entity_type", "Tipe entity tidak valid.");
  }
  if (!op.entity_id || op.entity_id.length > 160) {
    throw badRequest("invalid_entity_id", "ID entity tidak valid.");
  }
  if (op.payload.length > 100_000) {
    throw badRequest("payload_too_large", "Payload sync terlalu besar.");
  }
  // Dedup op_id scoped per-user agar satu user tidak bisa memblokir op_id user lain.
  const existing = await queryFirst<{ op_id: string }>(
    db,
    "SELECT op_id FROM sync_ops WHERE op_id = ? AND user_id = ?",
    [op.op_id, op.user_id],
  );
  if (existing) {
    return { stored: false, reason: "duplicate_op_id" };
  }

  // LWW untuk mutable: cek HLC terbaru untuk entity yang sama
  if (MUTABLE_ENTITIES.has(op.entity_type)) {
    const last = await queryFirst<{ hlc: string }>(
      db,
      "SELECT hlc FROM sync_ops WHERE user_id = ? AND entity_type = ? AND entity_id = ? ORDER BY hlc DESC LIMIT 1",
      [op.user_id, op.entity_type, op.entity_id],
    );
    if (last && op.hlc <= last.hlc) {
      return { stored: false, reason: "stale_hlc" };
    }
  }

  try {
    await execute(
      db,
      `INSERT INTO sync_ops (op_id, user_id, device_id, entity_type, entity_id, op_type, payload, hlc, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [op.op_id, op.user_id, op.device_id, op.entity_type, op.entity_id, op.op_type, op.payload, op.hlc, op.created_at],
    );
  } catch (err) {
    // Balap constraint (UNIQUE user_id+op_id, termasuk squat lintas-buku):
    // perlakukan sebagai duplikat per-buku, bukan 500.
    if (err instanceof Error && /unique|constraint/i.test(err.message)) {
      return { stored: false, reason: "duplicate_op_id" };
    }
    throw err;
  }

  return { stored: true };
}

/**
 * Pull ops sejak HLC tertentu (untuk sync antar-perangkat).
 * Jika since tidak ada, kembalikan semua (untuk restore device baru).
 */
export async function pullSyncOps(
  db: D1Database,
  userId: string,
  sinceHlc?: string,
  limit = 100,
): Promise<SyncOp[]> {
  if (sinceHlc) {
    return queryAll<SyncOp>(
      db,
      "SELECT * FROM sync_ops WHERE user_id = ? AND hlc > ? ORDER BY hlc ASC LIMIT ?",
      [userId, sinceHlc, limit],
    );
  }
  return queryAll<SyncOp>(
    db,
    "SELECT * FROM sync_ops WHERE user_id = ? ORDER BY hlc ASC LIMIT ?",
    [userId, limit],
  );
}

/**
 * List ops untuk snapshot per-user (backup tipis).
 * Dipakai untuk restore cepat di device baru: login Google → tarik snapshot/op-log → bangun ulang DB lokal.
 */
export async function getUserSnapshotOps(
  db: D1Database,
  userId: string,
): Promise<SyncOp[]> {
  return queryAll<SyncOp>(db, "SELECT * FROM sync_ops WHERE user_id = ? ORDER BY hlc ASC", [userId]);
}

/**
 * Buat snapshot per-user ke R2 (tipis): upload JSON ops + metadata.
 * Key: snapshots/<userId>/<date>.json
 */
export async function createUserSnapshot(
  db: D1Database,
  bucket: R2Bucket,
  userId: string,
): Promise<{ key: string; opCount: number }> {
  const ops = await getUserSnapshotOps(db, userId);
  const dateStr = new Date().toISOString().slice(0, 10);
  const key = `snapshots/${userId}/${dateStr}.json`;
  const body = JSON.stringify({ userId, dateStr, opCount: ops.length, ops }, null, 2);
  await bucket.put(key, body, {
    httpMetadata: { contentType: "application/json" },
  });
  return { key, opCount: ops.length };
}

/**
 * Device registry — upsert last_seen untuk offline session.
 */
export async function upsertDevice(
  db: D1Database,
  userId: string,
  deviceId: string,
  deviceName?: string,
): Promise<void> {
  const now = Date.now();
  // Cegah lintas-user overwrite: device milik user lain tidak boleh di-update.
  const owner = await queryFirst<{ user_id: string }>(db, "SELECT user_id FROM sync_devices WHERE id = ?", [deviceId]);
  if (owner && owner.user_id !== userId) {
    throw badRequest("device_conflict", "Perangkat sudah terdaftar untuk pengguna lain.");
  }
  await execute(
    db,
    `INSERT INTO sync_devices (id, user_id, token_hash, device_name, created_at, last_seen)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET last_seen = excluded.last_seen, device_name = COALESCE(excluded.device_name, device_name)`,
    [deviceId, userId, deviceId, deviceName ?? null, now, now],
  );
}
