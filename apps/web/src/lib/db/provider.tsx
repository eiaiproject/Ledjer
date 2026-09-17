/**
 * LocalDBProvider — React context untuk SQLite-WASM database.
 *
 * Satu akun = satu buku = satu DB handle.
 * DB diinisialisasi saat user login (lazy) dan di-close saat logout.
 *
 * Provider ini menggabungkan init + schema + seed dalam satu efek,
 * lalu menyediakan DB handle ke subtree via useLocalDb().
 */
/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { Database } from "@sqlite.org/sqlite-wasm";
import { useAuth } from "@/contexts/auth-context";
import { getLocalDbBackend, initLocalDb, type LocalDbBackend } from "./local-db";

interface LocalDBContextValue {
  db: Database | null;
  ready: boolean;
  error: Error | null;
  backend: LocalDbBackend | null;
}

const LocalDBContext = createContext<LocalDBContextValue>({
  db: null,
  ready: false,
  error: null,
  backend: null,
});
/**
 * Hook untuk mendapatkan DB handle lokal.
 * Mengembalikan null jika belum siap (user belum login / belum init).
 */
export function useLocalDb(): Database | null {
  return useContext(LocalDBContext).db;
}

/**
 * Hook untuk status kesiapan DB.
 */
export function useLocalDbReady(): boolean {
  return useContext(LocalDBContext).ready;
}

/**
 * Hook untuk backend persistensi DB lokal (opfs > js-storage > memory).
 */
export function useLocalDbBackend(): LocalDbBackend | null {
  return useContext(LocalDBContext).backend;
}
/**
 * Provider — wrap app tree, init SQLite-WASM saat user login.
 *
 * Design:
 * - Lazy init: DB hanya diinisialisasi saat user sudah login.
 * - Singleton: Multiple renders tidak double-init.
 * - Cleanup: DB di-close saat user logout (state reset).
 * - Error boundary: Jika WASM gagal load, error ditangkap.
 */
export function LocalDBProvider({ children }: Readonly<{ children: ReactNode }>) {
  const { user } = useAuth();
  const [db, setDb] = useState<Database | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [ready, setReady] = useState(false);
  const [backend, setBackend] = useState<LocalDbBackend | null>(null);

  useEffect(() => {
    if (!user?.id) {
      // User logged out — reset state. Singleton DB tetap hidup di modul
      // local-db.ts; close hanya saat _resetLocalDbForTesting (test).
      // Hindari db.close() di sini agar OPFS handle tidak invalid untuk
      // sesi berikutnya (initLocalDb singleton).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDb(null);
      setReady(false);
      setBackend(null);
      setError(null);
      return;
    }

    let cancelled = false;

    async function initDb() {
      try {
        // initLocalDb: cascade OPFS → JsStorageDb → memori.
        // Schema + seed CoA ditangani di dalamnya — jangan diduplikasi di sini.
        const database = await initLocalDb(user!.id);

        if (!cancelled) {
          setDb(database);
          setReady(true);
          setError(null);
          setBackend(getLocalDbBackend());
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)));
          setReady(false);
        }
      }
    }

    initDb();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const value = useMemo(
    () => ({ db, ready, error, backend }),
    [db, ready, error, backend],
  );

  return (
    <LocalDBContext.Provider value={value}>
      {children}
    </LocalDBContext.Provider>
  );
}
