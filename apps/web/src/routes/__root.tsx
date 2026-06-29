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
  const { session, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

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
