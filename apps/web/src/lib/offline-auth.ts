/**
 * Offline auth — authenticate once, then offline.
 * Simpan sesi perangkat lokal terenkripsi di device, pakai saat offline.
 *
 * Alur:
 * 1. Login pertama wajib online (Google OAuth / email). getMe() sukses → saveOfflineSession()
 * 2. Pemakaian harian offline → loadOfflineSession() dipakai sebagai fallback bila fetch gagal (network error)
 * 3. Saat kembali online → refresh diam-diam di background (fetch getMe → save lagi)
 *
 * Penyimpanan:
 * - IndexedDB store `ledjer-offline` objectStore `kv` key `offline_session`
 * - Fallback ke localStorage `ledjer:offline_session` bila IndexedDB tidak ada (jsdom/test)
 * - Enkripsi AES-GCM 256 bila crypto.subtle tersedia; fallback base64 bila tidak
 */

import type { AuthSession, AuthUser } from "@/lib/api/auth";

export interface OfflineSessionData {
  user: AuthUser;
  session: AuthSession | null;
  savedAt: number;
  /** Versi format untuk migrasi */
  v: 1;
}

const IDB_NAME = "ledjer-offline";
const IDB_STORE = "kv";
const IDB_KEY = "offline_session";
const LS_KEY = "ledjer:offline_session";
const DEVICE_KEY_STORAGE = "ledjer:offline_device_key";

// ── Helpers: base64 ───────────────────────────────────────────────

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCodePoint(b);
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.codePointAt(i) ?? 0;
  return bytes;
}

// ── Crypto: AES-GCM ───────────────────────────────────────────────

async function getDeviceKeyBytes(): Promise<Uint8Array> {
  // Cari di localStorage dulu (persist antar reload)
  try {
    const stored = localStorage.getItem(DEVICE_KEY_STORAGE);
    if (stored) return base64ToBytes(stored);
  } catch {
    // localStorage tidak ada — lanjut generate
  }
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  try {
    localStorage.setItem(DEVICE_KEY_STORAGE, bytesToBase64(bytes));
  } catch {
    // Gagal simpan — tetap pakai bytes in-memory untuk sesi ini
  }
  return bytes;
}

async function getAesKey(): Promise<CryptoKey | null> {
  if (!globalThis.crypto?.subtle) return null;
  try {
    const raw = await getDeviceKeyBytes();
    return await crypto.subtle.importKey("raw", raw as unknown as BufferSource, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
  } catch {
    return null;
  }
}

async function encryptString(plain: string): Promise<string> {
  const key = await getAesKey();
  if (!key) {
    // Fallback: base64 plain (obfuscation, tetap lebih baik dari cleartext)
    return `b64:${btoa(plain)}`;
  }
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const encoded = new TextEncoder().encode(plain);
  const cipherBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as unknown as BufferSource }, key, encoded as unknown as BufferSource);
  const cipherBytes = new Uint8Array(cipherBuf);
  // Format: v1.iv.cipher (base64)
  return `v1.${bytesToBase64(iv)}.${bytesToBase64(cipherBytes)}`;
}

async function decryptString(stored: string): Promise<string | null> {
  if (stored.startsWith("b64:")) {
    try {
      return atob(stored.slice(4));
    } catch {
      return null;
    }
  }
  if (!stored.startsWith("v1.")) return null;
  const parts = stored.split(".");
  if (parts.length !== 3) return null;
  const key = await getAesKey();
  if (!key) return null;
  try {
    const iv = base64ToBytes(parts[1]);
    const cipher = base64ToBytes(parts[2]);
    const plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv as unknown as BufferSource }, key, cipher as unknown as BufferSource);
    return new TextDecoder().decode(plainBuf as ArrayBuffer);
  } catch {
    return null;
  }
}

// ── IndexedDB helpers ─────────────────────────────────────────────

function openIdb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(IDB_STORE)) {
          req.result.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbSet(key: string, value: string): Promise<boolean> {
  const db = await openIdb();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(value, key);
      tx.oncomplete = () => {
        db.close();
        resolve(true);
      };
      tx.onerror = () => {
        db.close();
        resolve(false);
      };
    } catch {
      db.close();
      resolve(false);
    }
  });
}

async function idbGet(key: string): Promise<string | null> {
  const db = await openIdb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => {
        db.close();
        resolve((req.result as string | undefined) ?? null);
      };
      req.onerror = () => {
        db.close();
        resolve(null);
      };
    } catch {
      db.close();
      resolve(null);
    }
  });
}

async function idbDel(key: string): Promise<void> {
  const db = await openIdb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).delete(key);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    } catch {
      db.close();
      resolve();
    }
  });
}

// ── Public API ────────────────────────────────────────────────────

/**
 * Simpan sesi offline terenkripsi. Dipanggil setelah getMe() sukses saat online.
 */
export async function saveOfflineSession(user: AuthUser, session: AuthSession | null): Promise<void> {
  const data: OfflineSessionData = { user, session, savedAt: Date.now(), v: 1 };
  const json = JSON.stringify(data);
  const encrypted = await encryptString(json);

  // Coba IDB dulu, fallback LS
  const ok = await idbSet(IDB_KEY, encrypted);
  if (!ok) {
    try {
      localStorage.setItem(LS_KEY, encrypted);
    } catch {
      // storage penuh / diblokir — simpan gagal, offline akan fallback ke memory saja
    }
  }
}

/**
 * Muat sesi offline terenkripsi. Dipakai sebagai fallback saat fetch /api/auth/me gagal karena offline.
 * Return null bila belum pernah login online atau data korup.
 */
export async function loadOfflineSession(): Promise<OfflineSessionData | null> {
  // IDB dulu
  let encrypted: string | null = await idbGet(IDB_KEY);
  // Fallback LS
  if (!encrypted) {
    try {
      encrypted = localStorage.getItem(LS_KEY);
    } catch {
      encrypted = null;
    }
  }
  if (!encrypted) return null;

  const json = await decryptString(encrypted);
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as OfflineSessionData;
    if (!parsed.user?.id) return null;
    // Expiry check: sesi absolut 14 hari, tapi offline tetap boleh buka (hanya warning)
    // Kita tidak reject, hanya kembalikan data apa adanya — UI tetap jalan offline.
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Hapus sesi offline (dipanggil saat logout).
 */
export async function clearOfflineSession(): Promise<void> {
  await idbDel(IDB_KEY);
  try {
    localStorage.removeItem(LS_KEY);
  } catch {
    // ignore
  }
}

/**
 * Cek apakah ada sesi offline tersimpan.
 */
export async function hasOfflineSession(): Promise<boolean> {
  const data = await loadOfflineSession();
  return data !== null;
}

/**
 * Refresh diam-diam saat online: fetch ulang getMe lalu simpan kembali.
 * Dipanggil dari event `online` di background, jangan blokir UI.
 */
export async function refreshOfflineSessionInBackground(fetcher: () => Promise<{ user: AuthUser | null; session: AuthSession | null }>): Promise<void> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  try {
    const { user, session } = await fetcher();
    if (user) {
      await saveOfflineSession(user, session);
    }
  } catch {
    // Network error / offline — biarkan offline session lama tetap dipakai
  }
}
