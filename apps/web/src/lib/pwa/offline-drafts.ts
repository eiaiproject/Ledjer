// P4.3 Offline Drafts Service
// Uses IndexedDB to store transaction drafts when offline and sync when back online.
// Never allows duplicate posting: drafts are marked as 'synced' after successful post.

const DB_NAME = 'ledjer-offline';
const DB_VERSION = 1;
const STORE_NAME = 'drafts';

interface OfflineDraft {
  id: string;
  organizationId: string;
  type: 'transaction' | 'invoice' | 'journal';
  data: Record<string, unknown>;
  status: 'pending' | 'syncing' | 'synced' | 'failed';
  error?: string;
  createdAt: number;
  updatedAt: number;
  idempotencyKey: string;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
  });
}

// ── CRUD Operations ─────────────────────────────────────────────

export async function saveDraft(draft: Omit<OfflineDraft, 'id' | 'createdAt' | 'updatedAt' | 'idempotencyKey'>): Promise<OfflineDraft> {
  const db = await openDB();
  const id = crypto.randomUUID();
  const now = Date.now();
  const idempotencyKey = `offline-${id}-${now}`;

  const entry: OfflineDraft = {
    ...draft,
    id,
    idempotencyKey,
    createdAt: now,
    updatedAt: now,
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.add(entry);

    request.onsuccess = () => {
      tx.oncomplete = () => {
        db.close();
        // Register background sync
        registerSync();
        resolve(entry);
      };
    };
    request.onerror = () => {
      db.close();
      reject(request.error ?? new Error('IndexedDB error'));
    };
  });
}

export async function getDraft(id: string): Promise<OfflineDraft | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onsuccess = () => {
      db.close();
      resolve(request.result || null);
    };
    request.onerror = () => {
      db.close();
      reject(request.error ?? new Error('IndexedDB error'));
    };
  });
}

export async function listDrafts(status?: 'pending' | 'syncing' | 'synced' | 'failed'): Promise<OfflineDraft[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    let request: IDBRequest;

    if (status) {
      const index = store.index('status');
      request = index.getAll(status);
    } else {
      request = store.getAll();
    }

    request.onsuccess = () => {
      db.close();
      resolve(request.result || []);
    };
    request.onerror = () => {
      db.close();
      reject(request.error ?? new Error('IndexedDB error'));
    };
  });
}

export async function updateDraftStatus(
  id: string,
  status: OfflineDraft['status'],
  error?: string,
): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const getRequest = store.get(id);

    getRequest.onsuccess = () => {
      const draft = getRequest.result;
      if (!draft) {
        db.close();
        resolve();
        return;
      }

      draft.status = status;
      draft.updatedAt = Date.now();
      if (error) draft.error = error;

      const putRequest = store.put(draft);
      // NOSONAR typescript:S2004 — IndexedDB uses callback API; nesting is unavoidable
      putRequest.onsuccess = () => {
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
      };
      putRequest.onerror = () => {
        db.close();
        reject(putRequest.error ?? new Error('IndexedDB error'));
      };
    };

    getRequest.onerror = () => {
      db.close();
      reject(getRequest.error ?? new Error('IndexedDB error'));
    };
  });
}

export async function deleteDraft(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => {
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
    };
    request.onerror = () => {
      db.close();
      reject(request.error ?? new Error('IndexedDB error'));
    };
  });
}

export async function getPendingDraftCount(): Promise<number> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('status');
    const request = index.count('pending');

    request.onsuccess = () => {
      db.close();
      resolve(request.result);
    };
    request.onerror = () => {
      db.close();
      reject(request.error ?? new Error('IndexedDB error'));
    };
  });
}

// ── Sync ─────────────────────────────────────────────────────────

async function registerSync() {
  if ('serviceWorker' in navigator && 'SyncManager' in window) {
    try {
      const registration = await navigator.serviceWorker.ready;
      await (registration as unknown as { sync: { register: (tag: string) => Promise<void> } }).sync.register('sync-drafts');
    } catch {
      // Background sync not available — will sync on next online event
    }
  }
}

/**
 * Sync all pending drafts. Called when coming back online.
 */
export async function syncPendingDrafts(): Promise<{ synced: number; failed: number; errors: string[] }> {
  const drafts = await listDrafts('pending');
  let synced = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const draft of drafts) {
    try {
      await updateDraftStatus(draft.id, 'syncing');

      // Post via API with idempotency key
      const response = await fetch(getApiUrl(draft.type), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': draft.idempotencyKey,
        },
        body: JSON.stringify(draft.data),
      });

      if (response.ok) {
        await updateDraftStatus(draft.id, 'synced');
        synced++;
      } else {
        const errBody = await response.json().catch(() => ({}));
        const errMsg = (errBody as { error?: { message?: string } }).error?.message || `HTTP ${response.status}`;
        await updateDraftStatus(draft.id, 'failed', errMsg);
        errors.push(errMsg);
        failed++;
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      await updateDraftStatus(draft.id, 'failed', errMsg);
      errors.push(errMsg);
      failed++;
    }
  }

  return { synced, failed, errors };
}

function getApiUrl(type: OfflineDraft['type']): string {
  switch (type) {
    case 'transaction': return '/api/transactions';
    case 'invoice': return '/api/invoices';
    case 'journal': return '/api/manual-journals';
  }
}

// ── Online/Offline listener ──────────────────────────────────────

export function setupOfflineSync() {
  const handleOnline = () => {
    syncPendingDrafts().then((result) => {
      if (result.synced > 0 || result.failed > 0) {
        console.log(`Offline sync: ${result.synced} synced, ${result.failed} failed`);
      }
    });
  };

  window.addEventListener('online', handleOnline);

  // Also listen for service worker messages
  navigator.serviceWorker?.addEventListener('message', (event) => {
    if (event.data?.type === 'SYNC_DRAFTS') {
      handleOnline();
    }
  });

  // Cleanup
  return () => {
    window.removeEventListener('online', handleOnline);
  };
}
