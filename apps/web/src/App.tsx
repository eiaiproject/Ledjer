import { lazy, Suspense, type ReactNode, useEffect } from "react";
import { createBrowserRouter, RouterProvider, useLocation } from "react-router-dom";
import * as Sentry from "@sentry/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/contexts/auth";
import { ErrorBoundary } from "@/components/error-boundary";
import { ProtectedRoute, PublicRoute } from "@/routes/__root";
import { DashboardLayout } from "@/layouts/dashboard";
import { ToastProvider } from "@/components/ui/toast";
import { queryClient } from "@/lib/query-client";

// Lazy imports
const LandingPage = lazy(async () => ({ default: (await import("@/pages/landing")).LandingPage }));
const LoginPage = lazy(async () => ({ default: (await import("@/pages/login")).LoginPage }));
const RegisterPage = lazy(async () => ({ default: (await import("@/pages/register")).RegisterPage }));
const AuthCallbackPage = lazy(async () => ({ default: (await import("@/pages/auth-callback")).AuthCallbackPage }));
const OnboardingPage = lazy(async () => ({ default: (await import("@/pages/onboarding")).OnboardingPage }));
const OnboardingGuard = lazy(async () => ({ default: (await import("@/components/onboarding-guard")).OnboardingGuard }));
const DashboardPage = lazy(async () => ({ default: (await import("@/pages/dashboard")).DashboardPage }));
const TransactionListPage = lazy(async () => ({ default: (await import("@/pages/transactions/index")).TransactionListPage }));
const NewTransactionPage = lazy(async () => ({ default: (await import("@/pages/transactions/new")).NewTransactionPage }));
const TransactionDetailPage = lazy(async () => ({ default: (await import("@/pages/transactions/[id]")).TransactionDetailPage }));
const AccountsPage = lazy(async () => ({ default: (await import("@/pages/accounts/index")).AccountsPage }));
const GeneralLedgerPage = lazy(async () => ({ default: (await import("@/pages/reports/general-ledger")).GeneralLedgerPage }));
const TrialBalancePage = lazy(async () => ({ default: (await import("@/pages/reports/trial-balance")).TrialBalancePage }));
const ProfitLossPage = lazy(async () => ({ default: (await import("@/pages/reports/profit-loss")).ProfitLossPage }));
const BalanceSheetPage = lazy(async () => ({ default: (await import("@/pages/reports/balance-sheet")).BalanceSheetPage }));
const CashFlowPage = lazy(async () => ({ default: (await import("@/pages/reports/cash-flow")).default }));
const AgingReportPage = lazy(async () => ({ default: (await import("@/pages/reports/aging")).default }));
const ReconciliationPage = lazy(async () => ({ default: (await import("@/pages/reconciliation/index")).default }));
const TeamSettingsPage = lazy(async () => ({ default: (await import("@/pages/settings/team")).TeamSettingsPage }));
const PeriodLocksPage = lazy(async () => ({ default: (await import("@/pages/settings/period-locks")).PeriodLocksPage }));
const ProductsPage = lazy(async () => ({ default: (await import("@/pages/products/index")).ProductsPage }));
const ResetPasswordPage = lazy(async () => ({ default: (await import("@/pages/reset-password")).ResetPasswordPage }));
const ForgotPasswordPage = lazy(async () => ({ default: (await import("@/pages/forgot-password")).ForgotPasswordPage }));
const AcceptInvitationPage = lazy(async () => ({ default: (await import("@/pages/invitations/accept")).AcceptInvitationPage }));
const TermsOfServicePage = lazy(async () => ({ default: (await import("@/pages/legal/terms")).TermsOfServicePage }));
const PrivacyPolicyPage = lazy(async () => ({ default: (await import("@/pages/legal/privacy")).PrivacyPolicyPage }));
const RefundPolicyPage = lazy(async () => ({ default: (await import("@/pages/legal/refund")).RefundPolicyPage }));
const SecurityPage = lazy(async () => ({ default: (await import("@/pages/legal/security")).SecurityPage }));
const ContactPage = lazy(async () => ({ default: (await import("@/pages/legal/contact")).ContactPage }));
const InvoiceListPage = lazy(async () => ({ default: (await import("@/pages/invoices/index")).default }));
const NewInvoicePage = lazy(async () => ({ default: (await import("@/pages/invoices/new")).default }));
const InvoiceDetailPage = lazy(async () => ({ default: (await import("@/pages/invoices/[id]")).default }));
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
  "Ledjer adalah aplikasi pembukuan double-entry untuk UMKM Indonesia. Catat transaksi, kelola stok, dan lihat laporan keuangan tanpa spreadsheet.";

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
    setMeta('meta[property="og:image"]', `${SITE_URL}/og-image.png`);
    setMeta('meta[name="twitter:image"]', `${SITE_URL}/og-image.png`);
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
  {
    path: "/",
    element: <PublicRoute />,
    children: [
      {
        index: true,
        element: (
          <Seo title="Ledjer — Pembukuan UMKM Indonesia" description={DEFAULT_DESCRIPTION} path="/">
            <LandingPage />
          </Seo>
        ),
      },
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
  // Auth callback must NOT sit under PublicRoute/ProtectedRoute: after
  // token verification sets a session, route guards would redirect before
  // this page can choose the right destination.
  {
    path: "/auth/callback",
    element: (
      <Seo title="Memproses autentikasi - Ledjer" description="Memproses autentikasi Ledjer." noindex>
        <AuthCallbackPage />
      </Seo>
    ),
  },
  // Password recovery destination. Recovery email links land here with a
  // temporary session so the user can set a new password.
  {
    path: "/reset-password",
    element: (
      <Seo title="Reset password - Ledjer" description="Reset password akun Ledjer." noindex>
        <ResetPasswordPage />
      </Seo>
    ),
  },
  {
    path: "/invitations/accept",
    element: (
      <Seo title="Terima undangan - Ledjer" description="Terima undangan tim Ledjer." noindex>
        <AcceptInvitationPage />
      </Seo>
    ),
  },
  // Forgot-password landing page — user enters their email to receive a
  // recovery link. Public route (sits under PublicRoute so signed-in users
  // are not redirected away).
  {
    path: "/forgot-password",
    element: (
      <Seo title="Lupa password - Ledjer" description="Minta tautan pemulihan password Ledjer." noindex>
        <ForgotPasswordPage />
      </Seo>
    ),
  },
  // Legal & policy pages (public — accessible to everyone)
  {
    path: "/terms",
    element: (
      <Seo title="Syarat & Ketentuan - Ledjer" description="Syarat dan ketentuan penggunaan Ledjer.">
        <TermsOfServicePage />
      </Seo>
    ),
  },
  {
    path: "/privacy",
    element: (
      <Seo title="Kebijakan Privasi - Ledjer" description="Kebijakan privasi dan pengelolaan data Ledjer.">
        <PrivacyPolicyPage />
      </Seo>
    ),
  },
  {
    path: "/refund",
    element: (
      <Seo title="Kebijakan Layanan - Ledjer" description="Kebijakan layanan Ledjer selama periode akses gratis.">
        <RefundPolicyPage />
      </Seo>
    ),
  },
  {
    path: "/security",
    element: (
      <Seo title="Keamanan - Ledjer" description="Ringkasan keamanan data dan infrastruktur Ledjer.">
        <SecurityPage />
      </Seo>
    ),
  },
  {
    path: "/contact",
    element: (
      <Seo title="Kontak - Ledjer" description="Hubungi tim Ledjer untuk dukungan, bug, atau keamanan.">
        <ContactPage />
      </Seo>
    ),
  },
  {
    path: "/onboarding",
    element: (
      <Seo title="Onboarding - Ledjer" description="Setup awal organisasi Ledjer." noindex>
        <ProtectedRoute />
      </Seo>
    ),
    children: [
      { index: true, element: <OnboardingGuard><OnboardingPage /></OnboardingGuard> },
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
          { path: "/products", element: <ProductsPage /> },
          { path: "/invoices", element: <InvoiceListPage /> },
          { path: "/invoices/new", element: <NewInvoicePage /> },
          { path: "/invoices/:id", element: <InvoiceDetailPage /> },
          { path: "/reports/general-ledger", element: <GeneralLedgerPage /> },
          { path: "/reports/trial-balance", element: <TrialBalancePage /> },
          { path: "/reports/profit-loss", element: <ProfitLossPage /> },
          { path: "/reports/balance-sheet", element: <BalanceSheetPage /> },
          { path: "/reports/cash-flow", element: <CashFlowPage /> },
          { path: "/reports/aging", element: <AgingReportPage /> },
          { path: "/reconciliation", element: <ReconciliationPage /> },
          { path: "/settings/team", element: <TeamSettingsPage /> },
          { path: "/settings/period-locks", element: <PeriodLocksPage /> },
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

const sentryCreateBrowserRouter = Sentry.wrapCreateBrowserRouterV7(createBrowserRouter);
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
