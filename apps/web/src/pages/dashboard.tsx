import { useCallback, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Wallet, TrendUp, TrendDown, Chart,
  ArrowUpRight, ArrowDownRight, Plus, BookOpen,
  Receipt, AlertCircle, AlertTriangle,
  Clock, Package, FileText, Bank, Lock,
} from "reicon-react";
import { useOrganization, useOrgPermissions } from "@/hooks/useOrganization";
import { refreshAllData } from "@/lib/query-client";
import { queryKeys } from "@/lib/query-keys";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardContent } from "@/components/ui/card";
import { formatShortDate, cn } from "@/lib/utils";
import { PageShell } from "@/components/ui/page-shell";
import { PageGuide } from "@/components/ui/page-guide";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";
import { getDashboardSummary, getDashboardAlerts, type DashboardAlert } from "@/lib/api/dashboard";

type ProfitState = {
  isZero: boolean;
  label: string;
  tone: "leaf" | "clay" | "wood";
  icon: typeof TrendUp;
};

function computeProfitState(value: number | null | undefined): ProfitState {
  if (value == null || value === 0) {
    return { isZero: true, label: "Laba/Rugi", tone: "wood", icon: Chart };
  }
  if (value > 0) {
    return { isZero: false, label: "Laba Bersih", tone: "leaf", icon: TrendUp };
  }
  return { isZero: false, label: "Rugi Bersih", tone: "clay", icon: TrendDown };
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
    // Auto-refresh so numbers stay current while the page is open.
    refetchInterval: 60_000,
  });

  // Fetch dashboard alerts
  const { data: alertsData } = useQuery({
    queryKey: [...queryKeys.dashboard(orgData?.organization?.id), "alerts"],
    queryFn: () => getDashboardAlerts(),
    enabled: !!orgData?.organization?.id && canViewReports,
    refetchInterval: 60_000,
  });

  // Pull-to-refresh refreshes every page's data at once.
  const handleRefresh = useCallback(async () => {
    await refreshAllData();
  }, []);

  // Empty-state heuristic: no revenue or expense activity this period
  const hasActivity = !!summary && (summary.revenue_current_period !== 0 || summary.expense_current_period !== 0);
  const alerts = alertsData?.alerts ?? [];

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
    <PullToRefresh onRefresh={handleRefresh}>
    <PageShell
      header={{
        title: orgData?.organization ? `Halo, ${orgData.organization.name}` : "Halo",
        description: "Berikut ringkasan keuangan bisnis Anda",
        actions: summary?.period_from && summary?.period_to
          ? [{ key: "period", children: (
              <p className="text-xs sm:text-sm text-text-tertiary sm:text-right">
                {formatPeriodRange(summary.period_from, summary.period_to)}
              </p>
            ) }]
          : undefined,
      }}
      className="sm:space-y-6"
    >

      {/* Panduan halaman */}
      <PageGuide guideKey="dashboard" />

      {/* Actionable Alerts */}
      {canViewReports && alerts.length > 0 && (
        <section aria-labelledby="alerts-heading" className="space-y-3">
          <h2 id="alerts-heading" className="text-sm font-semibold text-text-secondary">
            Perlu Tindakan
          </h2>
          <div className="grid grid-cols-1 gap-2.5">
            {alerts.map((alert) => (
              <DashboardAlertCard key={alert.id} alert={alert} />
            ))}
          </div>
        </section>
      )}

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
                    <Chart className="h-5 w-5 text-wood-600" />
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
                    <TrendUp className="h-5 w-5 text-honey-600" />
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
              icon={TrendUp}
              tone="wood"
              href="/reports/profit-loss"
            />
            <StatCard
              label="Beban"
              value={metricError ? "error" : summary?.expense_current_period ?? null}
              icon={TrendDown}
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
    </PageShell>
    </PullToRefresh>
  );
}

/* ───── Alert Card Component ───── */

const ALERT_META: Record<string, { icon: React.ComponentType<{ className?: string }>; border: string; bg: string; iconBg: string; iconColor: string }> = {
  overdue_receivable: {
    icon: AlertTriangle,
    border: "border-error-border",
    bg: "bg-error-bg",
    iconBg: "bg-error",
    iconColor: "text-white",
  },
  upcoming_payable: {
    icon: Clock,
    border: "border-clay-300",
    bg: "bg-clay-50",
    iconBg: "bg-clay-500",
    iconColor: "text-white",
  },
  low_stock: {
    icon: Package,
    border: "border-honey-300",
    bg: "bg-honey-50",
    iconBg: "bg-honey-500",
    iconColor: "text-white",
  },
  draft_transaction: {
    icon: FileText,
    border: "border-sky-300",
    bg: "bg-sky-50",
    iconBg: "bg-sky-500",
    iconColor: "text-white",
  },
  unreconciled_statement: {
    icon: Bank,
    border: "border-wood-300",
    bg: "bg-wood-50",
    iconBg: "bg-wood-500",
    iconColor: "text-white",
  },
  unclosed_period: {
    icon: Lock,
    border: "border-leaf-300",
    bg: "bg-leaf-50",
    iconBg: "bg-leaf-500",
    iconColor: "text-white",
  },
};

function DashboardAlertCard({ alert }: { readonly alert: DashboardAlert }) {
  const meta = ALERT_META[alert.type] ?? ALERT_META.draft_transaction;
  const Icon = meta.icon;
  const severityLabel = ({ high: "Penting", medium: "Sedang" } as Record<string, string>)[alert.severity] ?? "Ringan";

  return (
    <Link
      to={alert.actionPath}
      className={cn(
        "group flex items-start gap-3.5 rounded-xl border p-4 transition-all duration-200",
        meta.border, meta.bg,
        "hover:shadow-md active:scale-[0.99]"
      )}
      aria-label={`${alert.title}: ${alert.description}`}
    >
      {/* Icon */}
      <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", meta.iconBg, meta.iconColor)}>
        <Icon className="h-5 w-5" />
      </div>

      {/* Content */}
      <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-0.5">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-text-primary">{alert.title}</p>
            <span className={cn(
              "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
              ({ high: "bg-error/10 text-error", medium: "bg-clay-100 text-clay-700" } as Record<string, string>)[alert.severity] ?? "bg-wood-100 text-wood-600"
            )}>
              {severityLabel}
            </span>
          </div>
          <p className="text-xs text-text-tertiary leading-relaxed">
            {alert.description}
          </p>
        </div>

        <span className="mt-2 inline-flex shrink-0 items-center gap-1 self-start rounded-lg bg-white/60 px-3 py-1.5 text-xs font-medium text-wood-700 transition-all group-hover:bg-white sm:mt-0">
          {alert.actionLabel}
          <ArrowUpRight className="h-3 w-3" />
        </span>
      </div>
    </Link>
  );
}
