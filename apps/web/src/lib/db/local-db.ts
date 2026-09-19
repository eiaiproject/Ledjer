/**
 * Local SQLite database — sumber kebenaran di perangkat.
 *
 * Persistensi berlapis (pilih yang pertama tersedia):
 * 1. OPFS via dedicated worker (`OpfsDb`, bertahan antar-reload, kapasitas besar)
 * 2. `JsStorageDb('local')` (localStorage-backed, main thread)
 * 3. In-memory `:memory:` — fallback terakhir (Node test / storage diblokir)
 *
 * Struktur:
 * - initLocalDb() → mengembalikan DB handle yang sudah di-schema + seed.
 * - initLocalDb() idempotent: multiple calls return the same instance.
 * - DB di-close hanya saat test cleanup (tidak ada close publik).
 */

import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import type { Database } from "@sqlite.org/sqlite-wasm";
import { applyLocalSchema } from "./local-schema";
import { seedDefaultAccounts } from "./seed";

// DB handle singleton (ditetapkan sekali saat init).
let dbInstance: Database | null = null;

/** Nama file OPFS untuk buku lokal (satu akun = satu buku = satu file). */
export const LOCAL_DB_FILENAME = "file:ledjer.sqlite3?vfs=opfs";

/** Backend persistensi yang dipakai DB lokal: opfs > js-storage > memory. */
export type LocalDbBackend = "opfs" | "js-storage" | "memory";
let dbBackend: LocalDbBackend | null = null;

/** Backend yang dipakai init terakhir (null bila belum init). Untuk badge/offline UI. */
export function getLocalDbBackend(): LocalDbBackend | null {
  return dbBackend;
}

/** True bila OPFS VFS tersedia (butuh worker thread + COOP/COEP). */
export function isOpfsAvailable(sqlite3: {
  oo1?: { OpfsDb?: unknown };
  capi?: { sqlite3_vfs_find?: (name: string) => unknown };
}): boolean {
  try {
    if (typeof sqlite3.oo1?.OpfsDb === "function") return true;
    return !!sqlite3.capi?.sqlite3_vfs_find?.("opfs");
  } catch {
    return false;
  }
}
/**
 * Inisialisasi database lokal SQLite-WASM.
 *
 * Cascade: OPFS (`OpfsDb`, butuh worker + COOP/COEP) → `JsStorageDb('local')`
 * → `:memory:`. Deteksi via properti (bukan try/catch buta) agar error asli
 * tidak tertelan; tiap lapis hanya dicoba bila konstruktornya ada.
 *
 * @param userId — ID user yang sedang aktif (untuk seed CoA).
 * @returns Database handle yang sudah siap dipakai.
 */
export async function initLocalDb(userId?: string): Promise<Database> {
  if (dbInstance) return dbInstance;

  const sqlite3 = await sqlite3InitModule();
  const opened = openPersistentDb(sqlite3);

  // Apply schema (CREATE TABLE IF NOT EXISTS — idempotent).
  applyLocalSchema(opened.db);

  // Seed default CoA jika userId diberikan.
  if (userId) {
    seedCoA(opened.db, userId);
  }

  dbInstance = opened.db;
  dbBackend = opened.backend;
  return opened.db;
}

function openPersistentDb(sqlite3: {
  oo1: {
    DB: new (filename?: string, flags?: string) => Database;
    JsStorageDb?: new (opts?: { filename?: "local" | "session"; flags?: string }) => Database;
    OpfsDb?: new (filename: string, flags?: string) => Database;
  };
}): { db: Database; backend: LocalDbBackend } {
  const Opfs = sqlite3.oo1.OpfsDb;
  if (typeof Opfs === "function") {
    try {
      return { db: new Opfs(LOCAL_DB_FILENAME, "c"), backend: "opfs" };
    } catch {
      // OPFS belum siap (bukan worker / tanpa COOP-COEP) — lanjut ke lapis berikut.
    }
  }
  const JsStorage = sqlite3.oo1.JsStorageDb;
  if (typeof JsStorage === "function") {
    try {
      return { db: new JsStorage({ filename: "local" }), backend: "js-storage" };
    } catch {
      // Storage penuh / localStorage diblokir — fallback ke memori.
    }
  }
  return { db: new sqlite3.oo1.DB(":memory:", "ct"), backend: "memory" };
}

function seedCoA(db: Database, userId: string): void {
  const now = Date.now();

  // Insert user row jika belum ada — pakai bind agar aman dari injeksi.
  db.exec({
    sql: `INSERT OR IGNORE INTO users (id, email, full_name, business_name, status, created_at, updated_at)
          VALUES (?, '', '', '', 'active', ?, ?)`,
    bind: [userId, now, now],
  } as unknown as string);

  // Seed ledger settings.
  db.exec({
    sql: `INSERT OR IGNORE INTO ledger_settings (user_id, base_currency, rule_version)
          VALUES (?, 'IDR', 1)`,
    bind: [userId],
  } as unknown as string);

  // Seed 16 akun default via seed.ts (single source of truth).
  seedDefaultAccounts(db as unknown as { exec(sql: string): void }, userId, now);
}

/**
 * Hanya untuk testing — reset singleton agar test berikutnya bisa init ulang.
 * @internal
 */
export function _resetLocalDbForTesting(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
