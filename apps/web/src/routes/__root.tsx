import { Navigate, Outlet, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "@/contexts/auth-context";
import { buildRedirectSearch, getSafeRedirectPath } from "@/lib/redirect";

export function ProtectedRoute() {
  const { session, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex ledger-min-dvh items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!session) {
    const redirectPath = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to={`/login?${buildRedirectSearch(redirectPath)}`} replace />;
  }

  return <Outlet />;
}

export function PublicRoute({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const location = useLocation();

  // PublicRoute does NOT wait for loading — public pages (login, register,
  // forgot-password, landing, legal, etc.) render immediately to avoid
  // blocking on auth resolution. This keeps public smoke tests independent
  // from API availability.
  //
  // Only redirect if we already have a session (user is logged in).
  if (session) {
    const searchParams = new URLSearchParams(location.search);
    return (
      <Navigate
        to={getSafeRedirectPath(searchParams.get("redirect"), "/dashboard")}
        replace
      />
    );
  }

  return <>{children}</>;
}
