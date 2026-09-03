import { lazy, Suspense, useEffect, type ReactNode } from "react";
import { createBrowserRouter, Outlet, RouterProvider, useLocation } from "react-router-dom";
import * as Sentry from "@sentry/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/contexts/auth";
import { ErrorBoundary } from "@/components/error-boundary";
import { ProtectedRoute, PublicRoute } from "@/routes/__root";
import { DashboardLayout } from "@/layouts/dashboard";
import { PublicLayout } from "@/layouts/public";
import { ToastProvider } from "@/components/ui/toast";
import { queryClient } from "@/lib/query-client";

// Lazy imports
const LandingPage = lazy(async () => ({ default: (await import("@/pages/landing")).LandingPage }));
const LoginPage = lazy(async () => ({ default: (await import("@/pages/login")).LoginPage }));
const RegisterPage = lazy(async () => ({ default: (await import("@/pages/register")).RegisterPage }));
const DashboardPage = lazy(async () => ({ default: (await import("@/pages/dashboard")).DashboardPage }));
const TransactionListPage = lazy(async () => ({ default: (await import("@/pages/transactions/index")).TransactionListPage }));
const NewTransactionPage = lazy(async () => ({ default: (await import("@/pages/transactions/new")).NewTransactionPage }));
const TransactionDetailPage = lazy(async () => ({ default: (await import("@/pages/transactions/[id]")).TransactionDetailPage }));
const AccountsPage = lazy(async () => ({ default: (await import("@/pages/accounts/index")).AccountsPage }));
const ProfitLossPage = lazy(async () => ({ default: (await import("@/pages/reports/profit-loss")).ProfitLossPage }));
const BalanceSheetPage = lazy(async () => ({ default: (await import("@/pages/reports/balance-sheet")).BalanceSheetPage }));
const SettingsPage = lazy(async () => ({ default: (await import("@/pages/settings/index")).SettingsPage }));
const NotFoundPage = lazy(async () => ({ default: (await import("@/pages/not-found")).NotFoundPage }));

type SeoProps = Readonly<{
  title: string;
  description: string;
  path?: string;
  noindex?: boolean;
  children: ReactNode;
}>;

const SITE_URL = "https://ledjer.id";
const DEFAULT_DESCRIPTION =
  "Ledjer adalah aplikasi pembukuan double-entry untuk UMKM Indonesia. Catat uang masuk, uang keluar, dan lihat laporan keuangan tanpa spreadsheet.";

function setMeta(selector: string, value: string) {
  const element = document.head.querySelector(selector);
  if (element) element.setAttribute("content", value);
}

function ensureCanonical(href: string) {
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "canonical";
    document.head.appendChild(link);
  }
  link.href = href;
}

function Seo({ title, description, path, noindex = false, children }: SeoProps) {
  const location = useLocation();
  const canonicalUrl = `${SITE_URL}${path ?? location.pathname}`;

  useEffect(() => {
    document.title = title;
    ensureCanonical(canonicalUrl);
    setMeta('meta[name="description"]', description);
    setMeta('meta[name="robots"]', noindex ? "noindex, nofollow" : "index, follow");
    setMeta('meta[property="og:title"]', title);
    setMeta('meta[property="og:description"]', description);
    setMeta('meta[property="og:url"]', canonicalUrl);
    setMeta('meta[name="twitter:title"]', title);
    setMeta('meta[name="twitter:description"]', description);
    setMeta('meta[property="og:locale"]', 'id_ID');
  }, [canonicalUrl, description, noindex, title]);

  return <>{children}</>;
}

function RouteFallback() {
  return (
    <output aria-live="polite" className="ledger-page flex min-h-[300px] items-center justify-center gap-3">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-wood-500 border-t-transparent" aria-hidden="true" />
      <span className="text-sm text-text-secondary">Memuat...</span>
    </output>
  );
}

const routerConfig = [
  // Landing has its own bespoke hero/header - render outside PublicLayout.
  {
    path: "/",
    element: (
      <Seo title="Ledjer - Pembukuan UMKM Indonesia" description={DEFAULT_DESCRIPTION} path="/">
        <LandingPage />
      </Seo>
    ),
  },
  // Public pages share PublicLayout (header + main + footer).
  {
    path: "/",
    element: (
      <PublicRoute>
        <PublicLayout>
          <Outlet />
        </PublicLayout>
      </PublicRoute>
    ),
    children: [
      {
        path: "login",
        element: (
          <Seo title="Masuk - Ledjer" description="Masuk ke akun Ledjer." noindex>
            <LoginPage />
          </Seo>
        ),
      },
      {
        path: "register",
        element: (
          <Seo title="Daftar - Ledjer" description="Buat akun Ledjer untuk mulai mencatat pembukuan." noindex>
            <RegisterPage />
          </Seo>
        ),
      },
    ],
  },
  {
    element: (
      <Seo title="Aplikasi Ledjer" description="Area aplikasi Ledjer." noindex>
        <ProtectedRoute />
      </Seo>
    ),
    children: [
      {
        element: <DashboardLayout />,
        children: [
          { path: "/dashboard", element: <DashboardPage /> },
          { path: "/transactions", element: <TransactionListPage /> },
          { path: "/transactions/new", element: <NewTransactionPage /> },
          { path: "/transactions/:id", element: <TransactionDetailPage /> },
          { path: "/accounts", element: <AccountsPage /> },
          { path: "/reports/profit-loss", element: <ProfitLossPage /> },
          { path: "/reports/balance-sheet", element: <BalanceSheetPage /> },
          { path: "/settings", element: <SettingsPage /> },
        ],
      },
    ],
  },
  {
    path: "*",
    element: (
      <Seo title="Halaman tidak ditemukan - Ledjer" description="Halaman Ledjer tidak ditemukan." noindex>
        <NotFoundPage />
      </Seo>
    ),
  },
];

const sentryCreateBrowserRouter = Sentry.wrapCreateBrowserRouter(createBrowserRouter);
const sentryRouter = sentryCreateBrowserRouter(routerConfig);

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <AuthProvider>
            <Suspense fallback={<RouteFallback />}>
              <RouterProvider router={sentryRouter} />
            </Suspense>
          </AuthProvider>
        </ToastProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;