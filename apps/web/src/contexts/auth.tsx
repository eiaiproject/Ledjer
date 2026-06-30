import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { AuthContext, type SignUpResult } from "@/contexts/auth-context";
import { supabase } from "@/lib/supabase";
import { getSafeRedirectPath } from "@/lib/redirect";

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
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

    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        if (cancelled) return;
        setSession(session);
        setLoading(false);
        clearTimeout(timeoutId);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err : new Error(String(err)));
        setLoading(false);
        clearTimeout(timeoutId);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      try {
        setSession(session);
        if (event === "SIGNED_OUT") {
          queryClient.clear();
        }
      } catch (err) {
        console.error("Auth state change handler error:", err);
      }
    });

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
  }, [queryClient]);

  const signOut = async () => {
    await supabase.auth.signOut();
    queryClient.clear();
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
  };

  const signUp = async (
    email: string,
    password: string,
    fullName: string,
    redirectTo?: string
  ): Promise<SignUpResult> => {
    const safeRedirect = getSafeRedirectPath(redirectTo, "/onboarding");
    const callbackUrl = new URL("/auth/callback", window.location.origin);
    if (safeRedirect !== "/onboarding") {
      callbackUrl.searchParams.set("redirect", safeRedirect);
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
        // Pin the verification link to our callback page so we can show a
        // branded success state and route the user to onboarding.
        emailRedirectTo: callbackUrl.toString(),
      },
    });
    if (error) throw error;
    return {
      session: data.session,
      user: data.user,
      // When email confirmations are enabled, Supabase returns a user but
      // no session until the user verifies their email.
      needsEmailConfirmation: !!data.user && !data.session,
    };
  };

  const resendConfirmationEmail = async (email: string) => {
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
    });
    if (error) throw error;
  };

  // Auth errors are exposed via context (error field) instead of blocking
  // render. ProtectedRoute and individual pages decide how to handle them.
  // Public pages render immediately without waiting for auth resolution.
  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        loading,
        error,
        signIn,
        signUp,
        resendConfirmationEmail,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
