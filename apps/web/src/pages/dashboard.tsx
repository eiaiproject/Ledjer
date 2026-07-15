import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Wallet, TrendingUp, TrendingDown, BarChart3,
  ArrowUpRight, ArrowDownRight, Plus, BookOpen,
  Receipt, AlertCircle,
} from "lucide-react";
import { useOrganization, useOrgPermissions } from "@/hooks/useOrganization";
import { queryKeys } from "@/lib/query-keys";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardContent } from "@/components/ui/card";
import { formatShortDate } from "@/lib/utils";
import { getDashboardSummary } from "@/lib/api/dashboard";

type ProfitState = {
  isZero: boolean;
  label: string;
  tone: "leaf" | "clay" | "wood";
  icon: typeof TrendingUp;
};

function computeProfitState(value: number | null | undefined): ProfitState {
  if (value == null || value === 0) {
    return { isZero: true, label: "Laba/Rugi", tone: "wood", icon: BarChart3 };
  }
  if (value > 0) {
    return { isZero: false, label: "Laba Bersih", tone: "leaf", icon: TrendingUp };
  }
  return { isZero: false, label: "Rugi Bersih", tone: "clay", icon: TrendingDown };
}

/** Format period as readable Indonesian: "Ringkasan 1–12 Juli 2026" */
function formatPeriodRange(from: string, to: string): string {
  const start = new Date(from);
  const end = new Date(to);
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  const monthName = new Intl.DateTimeFormat("id-ID", { month: "long" }).format(start);
  const year = start.getFullYear();
  if (sameMonth) {
    return `Ringkasan ${start.getDate()}–${end.getDate()} ${monthName} ${year}`;
  }
  return `Ringkasan ${formatShortDate(from)}–${formatShortDate(to)}`;
}

/** Skeleton loader matching dashboard structure */
function DashboardSkeleton() {
  return (
    <div className="space-y-4 sm:space-y-6" aria-busy="true" aria-live="polite" role="status">
      <span className="sr-only">Memuat data dashboard...</span>
      {/* Header skeleton */}
      <header className="flex flex-col gap-2">
        <div className="h-7 w-48 bg-cream-200 rounded animate-pulse" />
        <div className="h-4 w-64 bg-cream-200 rounded animate-pulse" />
        <div className="h-3 w-40 bg-cream-200 rounded animate-pulse" />
      </header>
      {/* Quick actions skeleton */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="h-16 bg-cream-200 rounded-xl animate-pulse" />
        <div className="h-16 bg-cream-200 rounded-xl animate-pulse" />
        <div className="h-16 bg-cream-200 rounded-xl animate-pulse" />
        <div className="h-16 bg-cream-200 rounded-xl animate-pulse" />
      </div>
      {/* Hero cards skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="h-28 bg-cream-200 rounded-xl animate-pulse" />
        <div className="h-28 bg-cream-200 rounded-xl animate-pulse" />
      </div>
      {/* Secondary metrics skeleton */}
      <div className="grid grid-cols-2 gap-3">
        <div className="h-28 bg-cream-200 rounded-xl animate-pulse" />
        <div className="h-28 bg-cream-200 rounded-xl animate-pulse" />
        <div className="h-28 bg-cream-200 rounded-xl animate-pulse" />
        <div className="h-28 bg-cream-200 rounded-xl animate-pulse" />
      </div>
    </div>
  );
}

export function DashboardPage() {
  const { data: orgData, isLoading: orgLoading } = useOrganization();
  const { canCreateTransaction, canViewReports } = useOrgPermissions();
  const navigate = useNavigate();

  useEffect(() => {
    if (orgLoading) return;
    if (orgData?.needsOnboarding && !orgLoading) {
      navigate("/onboarding", { replace: true });
    }
  }, [orgData, orgLoading, navigate]);

  const {
    data: summary,
    isLoading,
    error,
  } = useQuery({
    queryKey: queryKeys.dashboard(orgData?.organization?.id),
    queryFn: () => getDashboardSummary(),
    enabled: !!orgData?.organization?.id && canViewReports,
  });

  // Empty-state heuristic: no revenue or expense activity this period
  const hasActivity = !!summary && (summary.revenue_current_period !== 0 || summary.expense_current_period !== 0);

  // Loading state with semantic ARIA
  if (orgLoading || isLoading) {
    return <DashboardSkeleton />;
  }

  // Determine profit/loss semantic state
  const profitState = computeProfitState(summary?.net_profit_current_period);
  const { label: profitLabel, tone: profitTone, icon: profitIcon } = profitState;

  // Summary-level error: individual metrics unavailable
  const metricError = !!error;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <header className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <h1 className="break-words text-2xl font-bold text-text-primary" style={{ textWrap: "balance" }}>
            Halo{orgData?.organization ? `, ${orgData.organization.name}` : ""}
          </h1>
          <p className="text-sm text-text-secondary mt-0.5">
            Berikut ringkasan keuangan bisnis Anda
          </p>
        </div>
        {summary?.period_from && summary?.period_to && (
          <p className="text-xs sm:text-sm text-text-tertiary sm:text-right shrink-0 mt-1 sm:mt-0">
            {formatPeriodRange(summary.period_from, summary.period_to)}
          </p>
        )}
      </header>

      {/* Quick Actions */}
      {canCreateTransaction && (
        <section aria-labelledby="qa-heading" className="space-y-3">
          <h2 id="qa-heading" className="text-sm font-semibold text-text-secondary">
            Aksi Cepat
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Link
              to="/transactions/new"
              className="ledger-interactive group flex min-h-[64px] items-center gap-3 rounded-xl border border-wood-600 bg-wood-500 p-4 text-text-on-primary shadow-sm hover:bg-wood-600 hover:shadow-md active:scale-[0.98] transition sm:col-span-1"
              aria-label="Catat Transaksi baru"
            >
              <div className="shrink-0 rounded-xl bg-cream-50/15 p-2.5">
                <Plus className="h-5 w-5 text-cream-50" />
              </div>
              <p className="break-words text-sm font-semibold">
                Catat Transaksi
              </p>
            </Link>
            {canViewReports && (
              <>
                <Link
                  to="/reports/profit-loss"
                  className="ledger-interactive group flex min-h-[64px] items-center gap-3 rounded-xl border border-wood-200 p-4 hover:border-wood-400 hover:bg-wood-50/50 hover:shadow-sm active:scale-[0.98] transition"
                  aria-label="Lihat Laba Rugi"
                >
                  <div className="shrink-0 rounded-xl bg-wood-100 p-2.5">
                    <BarChart3 className="h-5 w-5 text-wood-600" />
                  </div>
                  <p className="break-words text-sm font-medium text-wood-800 group-hover:text-wood-700">
                    Laba Rugi
                  </p>
                </Link>
                <Link
                  to="/reports/trial-balance"
                  className="ledger-interactive group flex min-h-[64px] items-center gap-3 rounded-xl border border-wood-200 p-4 hover:border-honey-400 hover:bg-honey-50/50 hover:shadow-sm active:scale-[0.98] transition"
                  aria-label="Lihat Neraca Saldo"
                >
                  <div className="shrink-0 rounded-xl bg-honey-100 p-2.5">
                    <TrendingUp className="h-5 w-5 text-honey-600" />
                  </div>
                  <p className="break-words text-sm font-medium text-wood-800 group-hover:text-honey-700">
                    Neraca Saldo
                  </p>
                </Link>
              </>
            )}
            <Link
              to="/accounts"
              className="ledger-interactive group flex min-h-[64px] items-center gap-3 rounded-xl border border-wood-200 p-4 hover:border-sky-400 hover:bg-sky-50/50 hover:shadow-sm active:scale-[0.98] transition"
              aria-label="Lihat Bagan Akun"
            >
              <div className="shrink-0 rounded-xl bg-sky-100 p-2.5">
                <BookOpen className="h-5 w-5 text-sky-600" />
              </div>
              <p className="break-words text-sm font-medium text-wood-800 group-hover:text-sky-700">
                Bagan Akun
              </p>
            </Link>
          </div>
        </section>
      )}

      {/* Financial summary */}
      {canViewReports && (
        <div className="space-y-3">
          {/* Hero metrics: full-width on mobile, side-by-side on sm+ */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <StatCard
              label="Saldo Kas/Bank"
              value={summary?.cash_balance ?? null}
              icon={Wallet}
              tone="leaf"
              hero
              href="/reports/balance-sheet"
            />
            <StatCard
              label={profitLabel}
              value={summary?.net_profit_current_period ?? null}
              icon={profitIcon}
              tone={profitTone}
              hero
              href="/reports/profit-loss"
              ariaDescription={profitState.isZero ? "Belum ada aktivitas pada periode ini" : undefined}
            />
          </div>

          {/* Secondary metrics: 2-col on all sizes, 4-col on lg desktop */}
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              label="Pendapatan"
              value={metricError ? "error" : summary?.revenue_current_period ?? null}
              icon={TrendingUp}
              tone="wood"
              href="/reports/profit-loss"
            />
            <StatCard
              label="Beban"
              value={metricError ? "error" : summary?.expense_current_period ?? null}
              icon={TrendingDown}
              tone="clay"
              href="/reports/profit-loss"
            />
            <StatCard
              label="Piutang Usaha"
              value={metricError ? "error" : summary?.accounts_receivable ?? null}
              icon={ArrowUpRight}
              tone="leaf"
              href="/reports/balance-sheet"
            />
            <StatCard
              label="Utang Usaha"
              value={metricError ? "error" : summary?.accounts_payable ?? null}
              icon={ArrowDownRight}
              tone="clay"
              href="/reports/balance-sheet"
            />
          </div>

          {/* Empty-state */}
          {!hasActivity && (
            <Card className="border-dashed">
              <CardContent className="flex flex-col sm:flex-row items-center justify-between gap-3 py-4">
                <div className="flex items-center gap-3 text-center sm:text-left">
                  <div className="shrink-0 rounded-full bg-cream-200 p-2">
                    <Receipt className="h-5 w-5 text-wood-500" />
                  </div>
                  <p className="text-sm text-text-secondary">
                    Belum ada transaksi pada periode ini.
                  </p>
                </div>
                {canCreateTransaction && (
                  <Link
                    to="/transactions/new"
                    className="ledger-interactive inline-flex shrink-0 items-center gap-2 rounded-lg bg-wood-500 px-5 py-2.5 min-h-[44px] text-sm font-medium text-text-on-primary hover:bg-wood-600 active:scale-[0.98] transition"
                  >
                    <Plus className="h-4 w-4" />
                    Catat transaksi pertama
                  </Link>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {!canViewReports && (
        <Card>
          <CardContent className="py-8 text-center">
            <div className="flex flex-col items-center gap-3">
              <div className="rounded-full bg-cream-200 p-3">
                <AlertCircle className="h-6 w-6 text-wood-500" />
              </div>
              <p className="text-sm text-wood-500 max-w-sm">
                Anda tidak memiliki izin untuk melihat laporan keuangan.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
