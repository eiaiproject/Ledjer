import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/auth";
import { AdminLayout } from "@/components/layout";
import { PageLoader } from "@/components/ui";

const LoginPage = lazy(async () => ({ default: (await import("@/pages/login")).LoginPage }));
const DashboardPage = lazy(async () => ({ default: (await import("@/pages/dashboard")).DashboardPage }));
const UsersPage = lazy(async () => ({ default: (await import("@/pages/users")).UsersPage }));
const OrganizationsPage = lazy(async () => ({ default: (await import("@/pages/organizations")).OrganizationsPage }));
const AuditLogsPage = lazy(async () => ({ default: (await import("@/pages/audit-logs")).AuditLogsPage }));
const BackupsPage = lazy(async () => ({ default: (await import("@/pages/backups")).BackupsPage }));
const SettingsPage = lazy(async () => ({ default: (await import("@/pages/settings")).SettingsPage }));

function Protected() {
  const { admin, loading } = useAuth();
  if (loading) return <PageLoader label="Memeriksa sesi admin..." />;
  if (!admin) return <Navigate to="/login" replace />;
  return <Outlet />;
}

function AppRoutes() {
  const { admin, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <PageLoader label="Memeriksa sesi admin..." />
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={admin ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route element={<Protected />}>
        <Route element={<AdminLayout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/users" element={<UsersPage />} />
          <Route path="/organizations" element={<OrganizationsPage />} />
          <Route path="/audit-logs" element={<AuditLogsPage />} />
          <Route path="/backups" element={<BackupsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={<PageLoader />}>
          <AppRoutes />
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  );
}
