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
 * True bila response server boleh dianggap selesai (tak perlu retry).
 * 409 = konflik idempotensi (replay); 4xx permanen lain (kecuali 408/429)
 * dibuang agar outbox tidak macet; 5xx/jaringan → retry.
 */
function pushOutcome(res: Response, label: string): boolean {
  if (res.status === 409 || res.ok) return true;
  if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
    console.warn(`[sync] Push ditolak permanen (${res.status}), entri dibuang agar tidak loop: ${label}`);
    return true;
  }
  console.warn(`[sync] Push failed: ${res.status} ${res.statusText} (${label})`);
  return false;
}

/** Payload lama (sebelum items ikut disimpan) — rekonstruksi dari field tunggal. */
function legacyItemsFromPayload(payload: Record<string, unknown>): Array<{
  productId: string;
  quantity: number;
  unitPriceIdr?: number;
  unitCostIdr?: number;
}> | null {
  const productId = payload.productId;
  const quantityMilli = payload.quantityMilli;
  if (typeof productId !== "string" || typeof quantityMilli !== "number" || quantityMilli <= 0) return null;
  const quantity = quantityMilli / 1000;
  const item: { productId: string; quantity: number; unitPriceIdr?: number; unitCostIdr?: number } = { productId, quantity };
  if (typeof payload.unitCostMinor === "number") item.unitCostIdr = payload.unitCostMinor / 10_000;
  if (typeof payload.amountIdr === "number" && payload.amountIdr > 0) item.unitPriceIdr = payload.amountIdr / quantity;
  return [item];
}

/** Body POST /api/transactions dari payload outbox — server menghitung ulang WAC/HPP. */
function buildTransactionReplayBody(entry: OutboxPayload, payload: Record<string, unknown>): Record<string, unknown> {
  const stockLoss = payload.stockLoss === true;
  const body: Record<string, unknown> = {
    transactionType: stockLoss ? "stock_loss" : payload.transactionType,
    transactionDate: payload.transactionDate,
    description:
      typeof payload.description === "string" && payload.description
        ? payload.description
        : "Transaksi offline (via cepat)",
    idempotencyKey:
      typeof payload.opId === "string" && payload.opId.length >= 8 ? payload.opId : `outbox-${entry.id}`,
  };
  if (!stockLoss && typeof payload.cashAccountId === "string" && payload.cashAccountId) {
    body.cashAccountId = payload.cashAccountId;
  }
  if (typeof payload.counterAccountId === "string" && payload.counterAccountId) {
    body.counterAccountId = payload.counterAccountId;
  }
  if (typeof payload.amountIdr === "number" && payload.amountIdr > 0) {
    body.amountIdr = payload.amountIdr;
  }
  const items = Array.isArray(payload.items) ? payload.items : legacyItemsFromPayload(payload);
  if (items && items.length > 0) body.items = items;
  return body;
}

/**
 * Replay op transaksi lewat endpoint REST aslinya (POST /api/transactions atau
 * void), bukan op-log: server memvalidasi ulang dan menghitung WAC/HPP dari
 * state-nya sendiri, jadi buku server benar-benar menerima data offline.
 */
async function replayTransactionOp(entry: OutboxPayload, payload: Record<string, unknown>): Promise<boolean> {
  const label = `transaction ${entry.entityId}`;
  try {
    if (entry.opType === "update") {
      if (payload.status !== "voided") return true;
      const res = await fetch(`/api/transactions/${entry.entityId}/void`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ reason: typeof payload.reason === "string" ? payload.reason : null }),
      });
      return pushOutcome(res, label);
    }
    if (entry.opType === "delete") return true;
    const res = await fetch("/api/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(buildTransactionReplayBody(entry, payload)),
    });
    return pushOutcome(res, label);
  } catch (err) {
    console.warn("[sync] Replay error:", err);
    return false;
  }
}

/**
 * Op non-transaksi (akun/produk/pihak): ke op-log /api/sync dengan op_id dan
 * HLC stabil per entri outbox — retry tidak lagi membuat duplikat dan LWW
 * server memakai urutan kejadian lokal, bukan waktu push.
 */
async function pushSyncOpEntry(entry: OutboxPayload): Promise<boolean> {
  const methodMap: Record<string, string> = {
    create: "POST",
    update: "PATCH",
    delete: "DELETE",
  };
  const method = methodMap[entry.opType] ?? "POST";
  try {
    const res = await fetch(`/api/sync/${entry.entityType}/${entry.entityId}`, {
      method,
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        op_id: `outbox-${entry.id}`,
        hlc: `${entry.createdAt}-${String(entry.id).padStart(6, "0")}`,
        payload: entry.payload,
      }),
    });
    return pushOutcome(res, `${entry.entityType} ${entry.entityId}`);
  } catch (err) {
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
      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(entry.payload) as Record<string, unknown>;
      } catch {
        // Payload rusak permanen → buang agar tidak throw tiap interval.
        console.warn("[sync] Payload rusak, entri dibuang:", entry.id);
        syncedIds.push(entry.id);
        continue;
      }

      // Outbox di-replay berurutan agar LWW benar; paralel merusak urutan.
      const success = entry.entityType === "transaction"
        ? await replayTransactionOp(entry, payload) // NOSONAR:S9382 - replay berurutan agar LWW benar
        : await pushSyncOpEntry(entry); // NOSONAR:S9382 - push berurutan agar LWW benar

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

/** Jalankan outbox tanpa mengapung: rejection selalu ditampung ke status. */
function launchOutbox(db: Database, userId: string): void {
  processOutbox(db, userId).catch((err: unknown) => {
    updateStatus({
      running: false,
      lastError: err instanceof Error ? err : new Error(String(err)),
    });
  });
}

/**
 * Start background sync — panggil saat user login.
 * Sync setiap 5 detik (non-blocking).
 */
export function startSync(db: Database, userId: string): void {
  // Stop existing sync if any.
  stopSync();

  // Initial sync
  launchOutbox(db, userId);

  // Interval sync
  syncInterval = setInterval(() => {
    if (navigator.onLine) {
      launchOutbox(db, userId);
    }
  }, 5_000);

  // Also sync when coming back online.
  onlineHandler = () => {
    launchOutbox(db, userId);
  };
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

// ── Pull / Restore (Fase 5) ───────────────────────────────────────────

/**
 * Pull ops dari server (untuk sync antar-perangkat / restore device baru).
 * Dipanggil saat login Google di device baru: tarik snapshot/op-log → bangun ulang DB lokal.
 */
export async function pullRemoteOps(sinceHlc?: string): Promise<unknown[]> {
  try {
    const url = sinceHlc ? `/api/sync/pull?since=${encodeURIComponent(sinceHlc)}` : "/api/sync/pull";
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) return [];
    const data = (await res.json()) as { ops?: unknown[] };
    return data.ops ?? [];
  } catch {
    return [];
  }
}

/**
 * Restore device baru dari snapshot server.
 * Fetch /api/sync/snapshot lalu kembalikan ops untuk di-replay ke DB lokal.
 */
export async function fetchSnapshot(): Promise<{ user?: unknown; ops: unknown[] }> {
  try {
    const res = await fetch("/api/sync/snapshot", { credentials: "include" });
    if (!res.ok) return { ops: [] };
    const data = (await res.json()) as { user?: unknown; ops?: unknown[] };
    return { user: data.user, ops: data.ops ?? [] };
  } catch {
    return { ops: [] };
  }
}

/**
 * Buat snapshot per-user ke R2 (backup tipis).
 * Dipanggil manual atau on-demand; server daily backup sudah jalan via cron.
 */
export async function createSnapshot(): Promise<boolean> {
  try {
    const res = await fetch("/api/sync/snapshot", { method: "POST", credentials: "include" });
    return res.ok;
  } catch {
    return false;
  }
}
