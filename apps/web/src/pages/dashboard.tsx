import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Scale, Wallet } from "reicon-react";
import { useOrganization } from "@/hooks/useOrganization";
import { getDashboardAlerts, getDashboardSummary } from "@/lib/api/dashboard";
import { queryKeys } from "@/lib/query-keys";
import { StatCard } from "@/components/ui/stat-card";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { formatIDR, formatShortDate } from "@/lib/utils";
import { labelForTransactionType, directionSign } from "@/lib/transactions";
import { getStatus } from "@/lib/status-registry";
import type { Transaction } from "@/lib/api/transactions";

export function DashboardPage() {
  const { data: orgData } = useOrganization();
  const summaryQuery = useQuery({
    queryKey: queryKeys.dashboardSummary(orgData?.organization?.id),
    queryFn: async () => {
      if (!orgData?.organization?.id) throw new Error("No organization");
      return getDashboardSummary();
    },
    enabled: !!orgData?.organization?.id,
  });
  const alertsQuery = useQuery({
    queryKey: queryKeys.dashboardAlerts(orgData?.organization?.id),
    queryFn: async () => {
      if (!orgData?.organization?.id) throw new Error("No organization");
      return getDashboardAlerts();
    },
    enabled: !!orgData?.organization?.id,
  });

  const summary = summaryQuery.data;
  const alerts = alertsQuery.data;

  // The summary/alerts payloads are trusted to be arrays, but guard against
  // partial responses (e.g. a stale cached summary fetched while an older
  // worker was still deployed, or an upstream shape change) so the page can
  // never crash on `.length` of undefined.
  const recentTransactions = summary?.recentTransactions ?? [];
  const cashBankAccounts = summary?.cashBankAccounts ?? [];
  const negativeBalanceAccounts = alerts?.negativeBalanceAccounts ?? [];

  let recentTransactionsNode: ReactNode;
  if (summaryQuery.isLoading) {
    recentTransactionsNode = (
      <div className="space-y-3 p-5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-12 animate-pulse rounded-md bg-wood-100" />
        ))}
      </div>
    );
  } else if (summaryQuery.isError) {
    recentTransactionsNode = (
      <ErrorState
        title="Gagal memuat transaksi"
        message="Terjadi kesalahan saat mengambil data transaksi terbaru."
        onRetry={() => summaryQuery.refetch()}
      />
    );
  } else if (recentTransactions.length > 0) {
    recentTransactionsNode = (
      <ul className="divide-y divide-wood-100">
        {recentTransactions.map((transaction) => (
          <RecentTransactionRow key={transaction.id} transaction={transaction} />
        ))}
      </ul>
    );
  } else {
    recentTransactionsNode = (
      <EmptyState
        title="Belum ada transaksi"
        description="Catat transaksi pertama Anda untuk melihat ringkasannya di sini."
        action={
          <Link to="/transactions/new">
            <Button>Catat Transaksi</Button>
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={`Halo, ${orgData?.organization?.name ?? ""}`}
        description="Ringkasan keuangan usaha Anda."
        actions={[
          {
            key: "new-transaction",
            children: (
              <Link to="/transactions/new">
                <Button>Transaksi Baru</Button>
              </Link>
            ),
          },
        ]}
      />

      {negativeBalanceAccounts.length > 0 && (
        <Card className="border-clay-200 bg-clay-50">
          <CardContent className="p-4">
            <p className="text-sm font-medium text-clay-700">
              Akun kas/bank bersaldo negatif:{" "}
              {negativeBalanceAccounts.map((a) => a.name).join(", ")}
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Saldo Kas & Bank"
          value={summary?.cashBankBalance}
          icon={Wallet}
          tone="leaf"
          hero
          href="/accounts"
          ariaDescription="Total saldo seluruh akun kas dan bank"
        />
        <StatCard
          label="Uang Masuk Bulan Ini"
          value={summary?.moneyIn}
          icon={ArrowRight}
          tone="honey"
          ariaDescription="Total pendapatan bulan berjalan"
        />
        <StatCard
          label="Uang Keluar Bulan Ini"
          value={summary?.moneyOut}
          icon={ArrowLeft}
          tone="clay"
          ariaDescription="Total beban bulan berjalan"
        />
        <StatCard
          label="Laba Bersih Bulan Ini"
          value={summary?.netIncome}
          icon={Scale}
          tone="wood"
          ariaDescription="Pendapatan dikurangi beban bulan berjalan"
        />
      </div>

      {cashBankAccounts.length > 0 && (
        <Card elevated title="Rincian Kas & Bank">
          <ul className="divide-y divide-wood-100">
            {cashBankAccounts.map((account) => (
              <li key={account.id} className="flex items-center justify-between gap-4 px-5 py-3">
                <div className="min-w-0">
                  <p className="break-words text-sm font-medium text-text-primary">{account.name}</p>
                  <p className="text-xs text-text-tertiary">{account.code}</p>
                </div>
                <p className="num-mono shrink-0 text-sm font-semibold text-text-primary">
                  {formatIDR(account.balance)}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card elevated title="Transaksi Terbaru">
        <CardContent className="p-0">{recentTransactionsNode}</CardContent>
      </Card>
    </div>
  );
}

function RecentTransactionRow({ transaction }: { readonly transaction: Transaction }) {
  const status = getStatus("transactions", transaction.status);
  const isNegative = transaction.direction === "out";

  return (
    <li>
      <Link
        to={`/transactions/${transaction.id}`}
        className="flex items-center justify-between gap-4 px-5 py-3 transition-colors hover:bg-cream-100"
      >
        <div className="min-w-0">
          <p className="break-words text-sm font-medium text-text-primary">{transaction.description}</p>
          <p className="mt-0.5 text-xs text-text-tertiary">
            {formatShortDate(transaction.transaction_date)} · {labelForTransactionType(transaction.transaction_type)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <p
            className={`num-mono text-sm font-semibold ${
              isNegative ? "text-clay-700" : "text-leaf-700"
            }`}
          >
            {directionSign(transaction.direction)} {formatIDR(transaction.amount_idr)}
          </p>
          <Badge variant={status.variant} size="sm">
            {status.label}
          </Badge>
        </div>
      </Link>
    </li>
  );
}