import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/auth-context";
import { getSafeRedirectPath } from "@/lib/redirect";

export function ProtectedRoute() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}

export function PublicRoute() {
  const { session } = useAuth();
  const location = useLocation();

  // PublicRoute does NOT wait for loading — public pages (login, register,
  // forgot-password, landing, legal, etc.) render immediately to avoid
  // blocking on auth resolution. This is critical for cross-browser smoke
  // tests where no Supabase instance is running.
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

  return <Outlet />;
}
