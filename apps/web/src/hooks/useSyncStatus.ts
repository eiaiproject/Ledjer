/**
 * useSyncStatus — hook to subscribe to sync status changes.
 *
 * Displays sync indicator in the UI (pending count, last sync time, errors).
 */

import { useEffect, useState } from "react";
import { onSyncStatus, getSyncStatus } from "@/lib/db/sync";
import type { SyncStatus } from "@/lib/db/sync";

export function useSyncStatus(): SyncStatus {
  const [status, setStatus] = useState<SyncStatus>(getSyncStatus);

  useEffect(() => {
    return onSyncStatus(setStatus);
  }, []);

  return status;
}
