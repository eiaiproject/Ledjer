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

export function AuthProvider({ children }: Readonly<{ children: ReactNode }>) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<AuthSession | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function initAuth() {
      try {
        const { session: s, user: u } = await getMe();
        if (cancelled) return;
        setSession(s);
        setUser(u);
        setLoading(false);
        // Online sukses → simpan sesi perangkat terenkripsi untuk akses offline
        if (u) {
          void saveOfflineSession(u, s);
        }
      } catch (err) {
        if (cancelled) return;
        // Offline (Failed to fetch / TypeError) → fallback ke sesi lokal terenkripsi.
        // ApiError (401/403/4xx) berarti sesi memang habis — jangan fallback, biarkan error.
        const isNetworkError =
          err instanceof TypeError ||
          (err instanceof Error && /Failed to fetch|NetworkError|network|Load failed/i.test(err.message));
        if (isApiError(err)) {
          setError(err instanceof Error ? err : new Error(String(err)));
          setLoading(false);
          return;
        }
        if (isNetworkError) {
          const offline = await loadOfflineSession();
          if (offline?.user) {
            setSession(offline.session);
            setUser(offline.user);
            setLoading(false);
            return;
          }
        }
        setError(err instanceof Error ? err : new Error(String(err)));
        setLoading(false);
      }
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