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
import { supabase } from "@/lib/supabase";
import { useOrganization, useOrgPermissions } from "@/hooks/useOrganization";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";

interface DashboardSummary {
  cash_balance: number;
  revenue_current_period: number;
  expense_current_period: number;
  net_profit_current_period: number;
  accounts_receivable: number;
  accounts_payable: number;
  period_from: string;
  period_to: string;
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

  const { data: summary, isLoading } = useQuery({
    queryKey: ["dashboard", orgData?.organization?.id],
    queryFn: async () => {
      if (!orgData?.organization?.id) return null;
      const { data, error } = await supabase.rpc("get_dashboard_summary", {
        p_organization_id: orgData.organization.id,
      });
      if (error) throw error;
      return data as unknown as DashboardSummary;
    },
    enabled: !!orgData?.organization?.id && canViewReports,
  });

  if (orgLoading || isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 bg-cream-200 rounded animate-pulse" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-cream-200 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-text-primary">
          Halo{orgData?.organization ? `, ${orgData.organization.name}` : ""}
        </h1>
        <p className="text-sm text-text-secondary">
          Berikut ringkasan keuangan bisnis Anda
        </p>
        {summary?.period_from && summary?.period_to && (
          <p className="text-xs text-text-tertiary">
            Periode: {formatDate(summary.period_from)} — {formatDate(summary.period_to)}
          </p>
        )}
      </div>

      {/* KPI Cards */}
      {canViewReports && summary && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
      {canViewReports && summary && (
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
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-wood-700">Aksi Cepat</h2>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {canCreateTransaction && (
              <Link
                to="/transactions/new"
                className="group flex min-h-[72px] items-center gap-3 rounded-xl border border-wood-600 bg-wood-500 p-4 text-text-on-primary shadow-sm transition-all hover:bg-wood-600 hover:shadow-md"
              >
                <div className="shrink-0 rounded-xl bg-cream-50/15 p-2.5 transition-colors group-hover:bg-cream-50/20">
                  <Plus className="h-5 w-5 text-cream-50" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-text-on-primary">Catat Transaksi</p>
                  <p className="text-xs text-text-on-dark-secondary">Tambah transaksi baru</p>
                </div>
              </Link>
            )}
            {canViewReports && (
              <>
                <Link
                  to="/reports/profit-loss"
                  className="group flex items-center gap-3 rounded-xl border border-wood-200 p-4 transition-all hover:border-wood-400 hover:bg-wood-50/50 hover:shadow-sm min-h-[72px]"
                >
                  <div className="shrink-0 p-2.5 rounded-xl bg-wood-100 group-hover:bg-wood-200 transition-colors">
                    <BarChart3 className="h-5 w-5 text-wood-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-wood-800 group-hover:text-wood-700 transition-colors">Laba Rugi</p>
                    <p className="text-xs text-text-tertiary">Lihat laporan</p>
                  </div>
                </Link>
                <Link
                  to="/reports/trial-balance"
                  className="group flex items-center gap-3 rounded-xl border border-wood-200 p-4 transition-all hover:border-honey-400 hover:bg-honey-50/50 hover:shadow-sm min-h-[72px]"
                >
                  <div className="shrink-0 p-2.5 rounded-xl bg-honey-100 group-hover:bg-honey-200 transition-colors">
                    <TrendingUp className="h-5 w-5 text-honey-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-wood-800 group-hover:text-honey-700 transition-colors">Neraca Saldo</p>
                    <p className="text-xs text-text-tertiary">Cek keseimbangan</p>
                  </div>
                </Link>
              </>
            )}
            <Link
              to="/accounts"
              className="group flex items-center gap-3 rounded-xl border border-wood-200 p-4 transition-all hover:border-sky-400 hover:bg-sky-50/50 hover:shadow-sm min-h-[72px]"
            >
              <div className="shrink-0 p-2.5 rounded-xl bg-sky-100 group-hover:bg-sky-200 transition-colors">
                <BookOpen className="h-5 w-5 text-sky-600" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-wood-800 group-hover:text-sky-700 transition-colors">Bagan Akun</p>
                <p className="text-xs text-text-tertiary">Kelola akun</p>
              </div>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
