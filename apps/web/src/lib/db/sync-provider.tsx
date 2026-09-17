/**
 * SyncProvider — starts background sync when user is logged in.
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

import { useEffect } from "react";
import type { ReactNode } from "react";
import { useAuth } from "@/contexts/auth-context";
import { useLocalDb } from "./provider";
import { startSync, stopSync } from "./sync";

export function SyncProvider({ children }: Readonly<{ children: ReactNode }>) {
  const { user } = useAuth();
  const db = useLocalDb();

  useEffect(() => {
    if (user?.id && db) {
      startSync(db, user.id);
      return () => stopSync();
    }
  }, [user?.id, db]);

  return <>{children}</>;
}
