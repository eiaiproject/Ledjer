/**
 * Sync service — background sync dari local outbox ke server.
 *
 * Design (sesuai dokumen perencanaan Bagian 11):
 * - Op-log append-only: setiap perubahan di local DB dicatat ke sync_outbox.
 * - Sync jalan saat online, non-blocking.
 * - Server menerima merge (last-write-win atau operational transform).
 * - Sync interval: 5 detik saat aktif, pause saat offline.
 * - Jika server reject (conflict), data lokal tetap benar (local-first).
 */

import type { Database } from "@sqlite.org/sqlite-wasm";
import {
  getPendingOutbox,
  markOutboxSynced,
  cleanupSyncedOutbox,
  countPendingOutbox,
} from "./repos/outbox.repo";

// ── Types ────────────────────────────────────────────────────────

export interface SyncStatus {
  /** Whether sync is currently running. */
  running: boolean;
  /** Last successful sync timestamp. */
  lastSyncAt: number | null;
  /** Number of pending entries in outbox. */
  pendingCount: number;
  /** Last error (if any). */
  lastError: Error | null;
}

type SyncStatusListener = (status: SyncStatus) => void;

// ── Singleton ────────────────────────────────────────────────────

let syncInterval: ReturnType<typeof setInterval> | null = null;
let onlineHandler: (() => void) | null = null;
const statusListeners: Set<SyncStatusListener> = new Set();
let currentStatus: SyncStatus = {
  running: false,
  lastSyncAt: null,
  pendingCount: 0,
  lastError: null,
};

function notifyListeners() {
  for (const listener of statusListeners) {
    listener({ ...currentStatus });
  }
}

function updateStatus(patch: Partial<SyncStatus>) {
  currentStatus = { ...currentStatus, ...patch };
  notifyListeners();
}

// ── API push ─────────────────────────────────────────────────────

interface OutboxPayload {
  id: number;
  entityType: string;
  entityId: string;
  opType: string;
  payload: string;
  createdAt: number;
}

/**
 * Push single outbox entry ke server.
 * Returns true if successful, false if conflict (treat as synced — local is truth).
 */
async function pushToServer(entry: OutboxPayload): Promise<boolean> {
  const url = `/api/sync/${entry.entityType}/${entry.entityId}`;

  const methodMap: Record<string, string> = {
    create: "POST",
    update: "PATCH",
    delete: "DELETE",
  };

  const method = methodMap[entry.opType] ?? "POST";

  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: entry.payload,
      credentials: "include",
    });

    // 409 Conflict → treat as synced (local-first, server is backup)
    if (res.status === 409) {
      return true;
    }

    // 2xx → success
    if (res.ok) {
      return true;
    }

    // Other errors → will retry
    console.warn(`[sync] Push failed: ${res.status} ${res.statusText}`);
    return false;
  } catch (err) {
    // Network error → will retry
    console.warn("[sync] Push error:", err);
    return false;
  }
}

// ── Core sync loop ───────────────────────────────────────────────

/**
 * Process outbox — push pending entries ke server.
 * Dipanggil oleh interval timer atau manual trigger.
 */
async function processOutbox(db: Database, userId: string): Promise<void> {
  if (currentStatus.running) return; // Already syncing

  updateStatus({ running: true, lastError: null });

  try {
    const pending = getPendingOutbox(db, userId);

    if (pending.length === 0) {
      updateStatus({ running: false, pendingCount: 0 });
      return;
    }

    updateStatus({ pendingCount: pending.length });

    const syncedIds: number[] = [];

    for (const entry of pending) {
      const payload = JSON.parse(entry.payload);

      const success = await pushToServer({
        id: entry.id,
        entityType: entry.entityType,
        entityId: entry.entityId,
        opType: entry.opType,
        payload: JSON.stringify(payload),
        createdAt: entry.createdAt,
      });

      if (success) {
        syncedIds.push(entry.id);
      }
    }

    // Mark synced entries
    if (syncedIds.length > 0) {
      markOutboxSynced(db, syncedIds);
    }

    // Cleanup old synced entries (weekly)
    cleanupSyncedOutbox(db);

    const remaining = countPendingOutbox(db, userId);
    updateStatus({
      running: false,
      lastSyncAt: Date.now(),
      pendingCount: remaining,
    });
  } catch (err) {
    updateStatus({
      running: false,
      lastError: err instanceof Error ? err : new Error(String(err)),
    });
  }
}

// ── Public API ───────────────────────────────────────────────────

/**
 * Start background sync — panggil saat user login.
 * Sync setiap 5 detik (non-blocking).
 */
export function startSync(db: Database, userId: string): void {
  // Stop existing sync if any.
  stopSync();

  // Initial sync
  processOutbox(db, userId);

  // Interval sync
  syncInterval = setInterval(() => {
    if (navigator.onLine) {
      processOutbox(db, userId);
    }
  }, 5_000);

  // Also sync when coming back online.
  onlineHandler = () => processOutbox(db, userId);
  window.addEventListener("online", onlineHandler);
}

/**
 * Stop background sync — panggil saat user logout.
 */
export function stopSync(): void {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }

  if (onlineHandler) {
    window.removeEventListener("online", onlineHandler);
    onlineHandler = null;
  }

  updateStatus({ running: false });
}

/**
 * Trigger manual sync — panggil dari UI (pull-to-refresh, retry, dll).
 */
export async function triggerSync(db: Database, userId: string): Promise<void> {
  await processOutbox(db, userId);
}

/**
 * Subscribe to sync status changes.
 * Returns unsubscribe function.
 */
export function onSyncStatus(listener: SyncStatusListener): () => void {
  statusListeners.add(listener);
  // Emit current status immediately.
  listener({ ...currentStatus });
  return () => statusListeners.delete(listener);
}

/**
 * Get current sync status (snapshot).
 */
export function getSyncStatus(): SyncStatus {
  return { ...currentStatus };
}
