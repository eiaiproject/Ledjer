import { lazy, Suspense } from "react";
import { createBrowserRouter, RouterProvider, Navigate } from "react-router-dom";
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
const TeamSettingsPage = lazy(async () => ({ default: (await import("@/pages/settings/team")).TeamSettingsPage }));
const BillingSettingsPage = lazy(async () => ({ default: (await import("@/pages/settings/billing")).BillingSettingsPage }));
const ProductsPage = lazy(async () => ({ default: (await import("@/pages/products/index")).ProductsPage }));
const ResetPasswordPage = lazy(async () => ({ default: (await import("@/pages/reset-password")).ResetPasswordPage }));
const ForgotPasswordPage = lazy(async () => ({ default: (await import("@/pages/forgot-password")).ForgotPasswordPage }));
const TermsOfServicePage = lazy(async () => ({ default: (await import("@/pages/legal/terms")).TermsOfServicePage }));
const PrivacyPolicyPage = lazy(async () => ({ default: (await import("@/pages/legal/privacy")).PrivacyPolicyPage }));
const RefundPolicyPage = lazy(async () => ({ default: (await import("@/pages/legal/refund")).RefundPolicyPage }));
const SecurityPage = lazy(async () => ({ default: (await import("@/pages/legal/security")).SecurityPage }));
const ContactPage = lazy(async () => ({ default: (await import("@/pages/legal/contact")).ContactPage }));
const AdminPage = lazy(async () => ({ default: (await import("@/pages/admin")).AdminPage }));



function RouteFallback() {
  return (
    <div className="ledger-page flex min-h-[300px] items-center justify-center gap-3" role="status" aria-live="polite">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-wood-500 border-t-transparent" aria-hidden="true" />
      <span className="text-sm text-text-secondary">Memuat...</span>
    </div>
  );
}

const router = createBrowserRouter([
  {
    path: "/",
    element: <PublicRoute />,
    children: [
      { index: true, element: <LandingPage /> },
      { path: "login", element: <LoginPage /> },
      { path: "register", element: <RegisterPage /> },
    ],
  },
  // Auth callback must NOT sit under PublicRoute/ProtectedRoute: after
  // verifyOtp sets a session the guards would redirect before our own
  // navigate("/onboarding") runs.
  { path: "/auth/callback", element: <AuthCallbackPage /> },
  // Password recovery destination — Supabase recovery email links land here
  // with a temporary session so the user can set a new password.
  { path: "/reset-password", element: <ResetPasswordPage /> },
  // Forgot-password landing page — user enters their email to receive a
  // recovery link. Public route (sits under PublicRoute so signed-in users
  // are not redirected away).
  { path: "/forgot-password", element: <ForgotPasswordPage /> },
  // Legal & policy pages (public — accessible to everyone)
  { path: "/terms", element: <TermsOfServicePage /> },
  { path: "/privacy", element: <PrivacyPolicyPage /> },
  { path: "/refund", element: <RefundPolicyPage /> },
  { path: "/security", element: <SecurityPage /> },
  { path: "/contact", element: <ContactPage /> },
  // Admin (protected)
  {
    path: "/admin",
    element: <ProtectedRoute />,
    children: [
      { index: true, element: <AdminPage /> },
    ],
  },
  {
    path: "/onboarding",
    element: <ProtectedRoute />,
    children: [
      { index: true, element: <OnboardingGuard><OnboardingPage /></OnboardingGuard> },
    ],
  },
  {
    element: <ProtectedRoute />,
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
          { path: "/reports/general-ledger", element: <GeneralLedgerPage /> },
          { path: "/reports/trial-balance", element: <TrialBalancePage /> },
          { path: "/reports/profit-loss", element: <ProfitLossPage /> },
          { path: "/reports/balance-sheet", element: <BalanceSheetPage /> },
          { path: "/settings/team", element: <TeamSettingsPage /> },
          { path: "/settings/billing", element: <BillingSettingsPage /> },
        ],
      },
    ],
  },
  { path: "*", element: <Navigate to="/dashboard" replace /> },
]);

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <AuthProvider>
            <Suspense fallback={<RouteFallback />}>
              <RouterProvider router={router} />
            </Suspense>
          </AuthProvider>
        </ToastProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
