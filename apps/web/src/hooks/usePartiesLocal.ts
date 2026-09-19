/**
 * usePartiesLocal — local-first parties hook.
 */

import { useQuery } from "@tanstack/react-query";
import { useBook } from "@/hooks/useBook";
import { useLocalDb } from "@/lib/db/provider";
import { getAllParties, getPartyById } from "@/lib/db/repos";
import type { Party } from "@/lib/db/repos";

export function usePartiesLocal() {
  const { userId, ready: bookReady } = useBook();
  const db = useLocalDb();
  const ready = bookReady && db !== null;

  return useQuery<Party[]>({
    queryKey: ["parties-local", userId],
    queryFn: () => {
      if (!db || !userId) throw new Error("Local DB not ready");
      return getAllParties(db, userId);
    },
    enabled: ready,
    staleTime: Infinity,
  });
}

export function usePartyLocal(partyId: string | undefined) {
  const { ready: bookReady } = useBook();
  const db = useLocalDb();
  const ready = bookReady && db !== null && !!partyId;

  return useQuery<Party | null>({
    queryKey: ["party-local", partyId],
    queryFn: () => {
      if (!db || !partyId) throw new Error("Local DB not ready");
      return getPartyById(db, partyId);
    },
    enabled: ready,
    staleTime: Infinity,
  });
}
