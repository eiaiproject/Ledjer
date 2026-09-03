import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AuthContext } from "@/contexts/auth-context";
import type { AuthSession, AuthUser } from "@/lib/api/auth";
import { getMe, login, logout, register } from "@/lib/api/auth";

export function AuthProvider({ children }: Readonly<{ children: ReactNode }>) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<AuthSession | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    getMe()
      .then(({ session, user }) => {
        if (cancelled) return;
        setSession(session);
        setUser(user);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err : new Error(String(err)));
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [queryClient]);

  const signOut = useCallback(async () => {
    await logout();
    setSession(null);
    setUser(null);
    queryClient.clear();
  }, [queryClient]);

  const signIn = useCallback(async (email: string, password: string) => {
    await login(email, password);
    const next = await getMe();
    setSession(next.session);
    setUser(next.user);
  }, []);

  const signUp = useCallback(
    async (email: string, password: string, fullName: string, organizationName: string) => {
      await register(email, password, fullName, organizationName);
      const next = await getMe();
      setSession(next.session);
      setUser(next.user);
    },
    [],
  );

  const refreshSession = useCallback(async () => {
    const next = await getMe();
    setSession(next.session);
    setUser(next.user);
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