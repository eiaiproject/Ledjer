import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AuthContext } from "@/contexts/auth-context";
import type { AuthSession, AuthUser } from "@/lib/api/auth";
import { getMe, login, logout, register } from "@/lib/api/auth";
import { isApiError } from "@/lib/api/client";
import {
  saveOfflineSession,
  loadOfflineSession,
  clearOfflineSession,
  refreshOfflineSessionInBackground,
} from "@/lib/offline-auth";

/** Offline (Failed to fetch / TypeError) — selain itu diasumsikan ApiError. */
function isNetworkError(err: unknown): boolean {
  return (
    err instanceof TypeError ||
    (err instanceof Error && /Failed to fetch|NetworkError|network|Load failed/i.test(err.message))
  );
}

type InitialAuthResult =
  | { status: "online"; session: AuthSession | null; user: AuthUser | null }
  | { status: "offline"; session: AuthSession | null; user: AuthUser | null }
  | { status: "error"; error: Error };

/**
 * Boot auth: online-ok (sekaligus simpan sesi perangkat), fallback offline
 * dari sesi lokal terenkripsi, atau error (ApiError = sesi memang habis).
 */
async function resolveInitialAuth(): Promise<InitialAuthResult> {
  try {
    const { session, user } = await getMe();
    if (user) {
      void saveOfflineSession(user, session);
    }
    return { status: "online", session, user };
  } catch (err) {
    if (isApiError(err)) {
      return { status: "error", error: err instanceof Error ? err : new Error(String(err)) };
    }
    if (isNetworkError(err)) {
      const offline = await loadOfflineSession();
      if (offline?.user) {
        return { status: "offline", session: offline.session, user: offline.user };
      }
    }
    return { status: "error", error: err instanceof Error ? err : new Error(String(err)) };
  }
}

export function AuthProvider({ children }: Readonly<{ children: ReactNode }>) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<AuthSession | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function initAuth() {
      const result = await resolveInitialAuth();
      if (cancelled) return;
      if (result.status === "error") {
        setError(result.error);
      } else {
        setSession(result.session);
        setUser(result.user);
      }
      setLoading(false);
    }

    initAuth();

    // Refresh diam-diam saat kembali online (background, non-blocking)
    const handleOnline = () => {
      void refreshOfflineSessionInBackground(getMe).then(() => {
        // Setelah refresh, coba sinkronkan state bila masih pakai offline
        void getMe()
          .then(({ session: s, user: u }) => {
            if (cancelled) return;
            if (u) {
              setSession(s);
              setUser(u);
            }
          })
          .catch(() => {
            // Tetap offline — biarkan state lama
          });
      });
    };
    window.addEventListener("online", handleOnline);

    return () => {
      cancelled = true;
      window.removeEventListener("online", handleOnline);
    };
  }, [queryClient]);

  const signOut = useCallback(async () => {
    await logout();
    await clearOfflineSession();
    setSession(null);
    setUser(null);
    queryClient.clear();
  }, [queryClient]);

  const signIn = useCallback(async (email: string, password: string) => {
    await login(email, password);
    const next = await getMe();
    setSession(next.session);
    setUser(next.user);
    if (next.user) void saveOfflineSession(next.user, next.session);
  }, []);

  const signUp = useCallback(
    async (email: string, password: string, fullName: string, businessName: string) => {
      await register(email, password, fullName, businessName);
      const next = await getMe();
      setSession(next.session);
      setUser(next.user);
      if (next.user) void saveOfflineSession(next.user, next.session);
    },
    [],
  );

  const refreshSession = useCallback(async () => {
    try {
      const next = await getMe();
      setSession(next.session);
      setUser(next.user);
      if (next.user) void saveOfflineSession(next.user, next.session);
    } catch {
      // Offline — coba fallback ke sesi lokal
      const offline = await loadOfflineSession();
      if (offline?.user) {
        setSession(offline.session);
        setUser(offline.user);
      }
    }
  }, []);

  const value = useMemo(
    () => ({
      session,
      user,
      loading,
      error,
      signIn,
      signUp,
      signOut,
      refreshSession,
    }),
    [session, user, loading, error, signIn, signUp, signOut, refreshSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}