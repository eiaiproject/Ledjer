import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/contexts/auth";
import { ErrorBoundary } from "@/components/error-boundary";
import { ProtectedRoute, PublicRoute } from "@/routes/__root";
import { DashboardLayout } from "@/layouts/dashboard";
import { ToastProvider } from "@/components/ui/toast";
import { queryClient } from "@/lib/query-client";

// Lazy imports
const LoginPage = lazy(async () => ({ default: (await import("@/pages/login")).LoginPage }));
const RegisterPage = lazy(async () => ({ default: (await import("@/pages/register")).RegisterPage }));
const OnboardingPage = lazy(async () => ({ default: (await import("@/pages/onboarding")).OnboardingPage }));
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



function RouteFallback() {
  return (
    <div className="flex min-h-[300px] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-wood-500 border-t-transparent" />
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
        <AuthProvider>
          <BrowserRouter>
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                {/* Public routes */}
                <Route element={<PublicRoute />}>
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/register" element={<RegisterPage />} />
                </Route>

                {/* Onboarding */}
                <Route element={<ProtectedRoute />}>
                  <Route path="/onboarding" element={<OnboardingPage />} />
                </Route>

                {/* Protected dashboard routes */}
                <Route element={<ProtectedRoute />}>
                  <Route element={<DashboardLayout />}>
                    <Route path="/dashboard" element={<DashboardPage />} />
                    <Route path="/transactions" element={<TransactionListPage />} />
                    <Route path="/transactions/new" element={<NewTransactionPage />} />
                    <Route path="/transactions/:id" element={<TransactionDetailPage />} />
                    <Route path="/accounts" element={<AccountsPage />} />
                    <Route path="/products" element={<ProductsPage />} />
                    <Route path="/reports/general-ledger" element={<GeneralLedgerPage />} />
                    <Route path="/reports/trial-balance" element={<TrialBalancePage />} />
                    <Route path="/reports/profit-loss" element={<ProfitLossPage />} />
                    <Route path="/reports/balance-sheet" element={<BalanceSheetPage />} />
                    <Route path="/settings/team" element={<TeamSettingsPage />} />
                    <Route path="/settings/billing" element={<BillingSettingsPage />} />
                  </Route>
                </Route>

                {/* Default redirect */}
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </AuthProvider>
        </ToastProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
