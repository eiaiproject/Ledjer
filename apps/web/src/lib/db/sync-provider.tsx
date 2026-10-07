/**
 * SyncProvider — starts background sync when user is logged in, and refreshes
 * server-backed queries once queued offline ops have been replayed.
 *
 * Usage:
 *   <AuthProvider>
 *     <LocalDBProvider>
 *       <SyncProvider>
 *         <App />
 *       </SyncProvider>
 *     </LocalDBProvider>
 *   </AuthProvider>
 */

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth-context";
import { useLocalDb } from "./provider";
import { onSyncStatus, startSync, stopSync } from "./sync";

export function SyncProvider({ children }: Readonly<{ children: ReactNode }>) {
  const { user } = useAuth();
  const db = useLocalDb();
  const queryClient = useQueryClient();
  const pendingRef = useRef(0);

  useEffect(() => {
    if (user?.id && db) {
      startSync(db, user.id);
      return () => stopSync();
    }
  }, [user?.id, db]);

  // Replay offline selesai (pending turun ke 0 tanpa error) → data server
  // berubah, jadi query yang di-cache perlu di-refresh.
  useEffect(() => {
    return onSyncStatus((status) => {
      const wasPending = pendingRef.current > 0;
      pendingRef.current = status.pendingCount;
      if (wasPending && status.pendingCount === 0 && !status.lastError) {
        queryClient.invalidateQueries();
      }
    });
  }, [queryClient]);

  return <>{children}</>;
}
