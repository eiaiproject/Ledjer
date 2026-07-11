import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AuthContext } from "@/contexts/auth-context";
import type { SignUpResult } from "@/contexts/auth-context";
import type { AuthSession, AuthUser } from "@/lib/api/auth";
import {
  getMe,
  login,
  logout,
  register,
  resendVerification,
} from "@/lib/api/auth";

export function AuthProvider({ children }: Readonly<{ children: ReactNode }>) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<AuthSession | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timeoutId = setTimeout(() => {
      // Fail-open: if getSession() doesn't resolve within 3 seconds,
      // treat as guest so public pages render immediately.
      if (!cancelled) {
        setLoading(false);
      }
    }, 3_000);

    getMe()
      .then(({ session, user }) => {
        if (cancelled) return;
        setSession(session);
        setUser(user);
        setLoading(false);
        clearTimeout(timeoutId);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err : new Error(String(err)));
        setLoading(false);
        clearTimeout(timeoutId);
      });

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [queryClient]);

  const signOut = useCallback(async () => {
    await logout();
    setSession(null);
    setUser(null);
    queryClient.clear();
  }, [queryClient]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      await login(email, password);
      const next = await getMe();
      setSession(next.session);
      setUser(next.user);
    },
    []
  );

  const signUp = useCallback(
    async (
      email: string,
      password: string,
      fullName: string
    ): Promise<SignUpResult> => {
      const data = await register(email, password, fullName);
      if (data.session) {
        const next = await getMe();
        setSession(next.session);
        setUser(next.user);
      }
      return {
        session: data.session,
        user: data.session
          ? {
              id: data.user.id,
              email: data.user.email,
              full_name: data.user.fullName,
              email_verified_at: null,
            }
          : null,
        needsEmailConfirmation: data.needsEmailConfirmation,
      };
    },
    []
  );

  const resendConfirmationEmail = useCallback(
    async (email: string) => {
      await resendVerification(email);
    },
    []
  );

  const value = useMemo(
    () => ({
      session,
      user,
      loading,
      error,
      signIn,
      signUp,
      resendConfirmationEmail,
      signOut,
    }),
    [session, user, loading, error, signIn, signUp, resendConfirmationEmail, signOut]
  );

  // Auth errors are exposed via context (error field) instead of blocking
  // render. ProtectedRoute and individual pages decide how to handle them.
  // Public pages render immediately without waiting for auth resolution.
  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
