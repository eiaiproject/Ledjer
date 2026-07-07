import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  Plus,
  BookOpen,
} from "lucide-react";
import { useOrganization, useOrgPermissions } from "@/hooks/useOrganization";
import { queryKeys } from "@/lib/query-keys";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardContent } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { formatDate } from "@/lib/utils";
import { getDashboardSummary } from "@/lib/api/dashboard";

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

  const { data: summary, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.dashboard(orgData?.organization?.id),
    queryFn: () => getDashboardSummary(),
    enabled: !!orgData?.organization?.id && canViewReports,
  });

  if (orgLoading || isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 bg-cream-200 rounded animate-pulse" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 @[1180px]:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-cream-200 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-7">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <h1 className="break-words text-2xl font-bold text-text-primary">
          Halo{orgData?.organization ? `, ${orgData.organization.name}` : ""}
        </h1>
        <p className="text-sm text-text-secondary">
          Berikut ringkasan keuangan bisnis Anda
        </p>
        {summary?.period_from && summary?.period_to && (
          <p className="text-xs text-text-tertiary">
            Periode: {formatDate(summary.period_from)} - {formatDate(summary.period_to)}
          </p>
        )}
      </div>

      {/* KPI Cards */}
      {canViewReports && error && (
        <ErrorState error={error} onRetry={refetch} />
      )}

      {canViewReports && !error && summary && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 @[1180px]:grid-cols-4">
          <StatCard
            label="Saldo Kas/Bank"
            value={summary.cash_balance}
            icon={Wallet}
            tone="leaf"
          />
          <StatCard
            label="Pendapatan"
            value={summary.revenue_current_period}
            icon={TrendingUp}
            tone="wood"
          />
          <StatCard
            label="Beban"
            value={summary.expense_current_period}
            icon={TrendingDown}
            tone="clay"
          />
          <StatCard
            label="Laba/Rugi"
            value={summary.net_profit_current_period}
            icon={BarChart3}
            tone={summary.net_profit_current_period >= 0 ? "leaf" : "clay"}
          />
        </div>
      )}

      {/* AR/AP Summary */}
      {canViewReports && !error && summary && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <StatCard
            label="Piutang Usaha"
            value={summary.accounts_receivable}
            icon={ArrowUpRight}
            tone="leaf"
          />
          <StatCard
            label="Utang Usaha"
            value={summary.accounts_payable}
            icon={ArrowDownRight}
            tone="clay"
          />
        </div>
      )}

      {/* No report permission */}
      {!canViewReports && (
        <Card>
          <CardContent className="text-center py-8">
            <p className="text-sm text-wood-500">
              Anda tidak memiliki izin untuk melihat laporan keuangan.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Quick Actions */}
      <section aria-labelledby="quick-actions-heading" className="space-y-3">
        <h2 id="quick-actions-heading" className="text-sm font-semibold text-text-secondary">Aksi Cepat</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 @[1180px]:grid-cols-4">
          {canCreateTransaction && (
            <Link
              to="/transactions/new"
              className="ledger-interactive group flex min-h-[72px] items-center gap-3 rounded-xl border border-wood-600 bg-wood-500 p-4 text-text-on-primary shadow-sm hover:bg-wood-600 hover:shadow-md"
            >
              <div className="shrink-0 rounded-xl bg-cream-50/15 p-2.5 transition-colors group-hover:bg-cream-50/20">
                <Plus className="h-5 w-5 text-cream-50" />
              </div>
              <div className="min-w-0">
                <p className="break-words text-sm font-semibold text-text-on-primary">Catat Transaksi</p>
              </div>
            </Link>
          )}
          {canViewReports && (
            <>
              <Link
                to="/reports/profit-loss"
                className="ledger-interactive group flex min-h-[72px] items-center gap-3 rounded-xl border border-wood-200 p-4 hover:border-wood-400 hover:bg-wood-50/50 hover:shadow-sm"
              >
                <div className="shrink-0 rounded-xl bg-wood-100 p-2.5 transition-colors group-hover:bg-wood-200">
                  <BarChart3 className="h-5 w-5 text-wood-600" />
                </div>
                <div className="min-w-0">
                  <p className="break-words text-sm font-medium text-wood-800 transition-colors group-hover:text-wood-700">Laba Rugi</p>
                </div>
              </Link>
              <Link
                to="/reports/trial-balance"
                className="ledger-interactive group flex min-h-[72px] items-center gap-3 rounded-xl border border-wood-200 p-4 hover:border-honey-400 hover:bg-honey-50/50 hover:shadow-sm"
              >
                <div className="shrink-0 rounded-xl bg-honey-100 p-2.5 transition-colors group-hover:bg-honey-200">
                  <TrendingUp className="h-5 w-5 text-honey-600" />
                </div>
                <div className="min-w-0">
                  <p className="break-words text-sm font-medium text-wood-800 transition-colors group-hover:text-honey-700">Neraca Saldo</p>
                </div>
              </Link>
            </>
          )}
          <Link
            to="/accounts"
            className="ledger-interactive group flex min-h-[72px] items-center gap-3 rounded-xl border border-wood-200 p-4 hover:border-sky-400 hover:bg-sky-50/50 hover:shadow-sm"
          >
            <div className="shrink-0 rounded-xl bg-sky-100 p-2.5 transition-colors group-hover:bg-sky-200">
              <BookOpen className="h-5 w-5 text-sky-600" />
            </div>
            <div className="min-w-0">
              <p className="break-words text-sm font-medium text-wood-800 transition-colors group-hover:text-sky-700">Bagan Akun</p>
            </div>
          </Link>
        </div>
      </section>
    </div>
  );
}
