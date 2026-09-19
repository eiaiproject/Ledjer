/**
 * Local-first database module — public API.
 *
 * Satu akun = satu buku = satu SQLite database di perangkat.
 * Database ini adalah SUMBER KEBENARAN; server hanya menopang
 * (backup, sync, identitas).
 */

// DB init + schema
export { initLocalDb, getLocalDbBackend, isOpfsAvailable, LOCAL_DB_FILENAME, _resetLocalDbForTesting } from "./local-db";
export type { LocalDbBackend } from "./local-db";

// React provider + hook
export { LocalDBProvider, useLocalDb, useLocalDbReady, useLocalDbBackend } from "./provider";
export * from "./repos";

// Sync service
export {
  startSync,
  stopSync,
  triggerSync,
  onSyncStatus,
  getSyncStatus,
} from "./sync";
export type { SyncStatus } from "./sync";
export { SyncProvider } from "./sync-provider";
