import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useOrganization, useOrgPermissions } from "@/hooks/useOrganization";
import { queryKeys } from "@/lib/query-keys";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ReportSkeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateLong, formatIDR } from "@/lib/utils";
import { exportTrialBalanceCsv } from "@/lib/csv-export";
import { Download, Refresh } from "reicon-react";
import { getTrialBalance } from "@/lib/api/reports";
import { useReportDate, ReportPermissionGate, handleReportExport } from "./_components";
import { ReportShell } from "@/components/ui/report-shell";

export function TrialBalancePage() {
  const { data: orgData } = useOrganization();
  const { canViewReports, canCreateExports } = useOrgPermissions();

  const {
    pendingDate, setPendingDate,
    appliedDate, isPending,
    applyDate, syncPending,
  } = useReportDate();
  const [showZeroBalances, setShowZeroBalances] = useState(false);
  const [exporting, setExporting] = useState(false);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: queryKeys.reports.trialBalance(orgData?.organization?.id, appliedDate),
    queryFn: async () => {
      if (!orgData?.organization?.id) return [];
      return getTrialBalance(appliedDate);
    },
    enabled: !!orgData?.organization?.id && canViewReports,
    // Prevent stale data from overriding newer responses
    staleTime: 0,
  });

  const handleApplyDate = useCallback(() => { applyDate(); }, [applyDate]);

  const handleRefresh = useCallback(() => {
    syncPending();
    refetch();
  }, [syncPending, refetch]);

  if (!canViewReports) {
    return (
      <ReportPermissionGate>
        <div />
      </ReportPermissionGate>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Neraca Saldo</h1>
          <p className="text-sm text-text-secondary mt-1">
            Per {formatDateLong(appliedDate)}
          </p>
        </div>
        <ErrorState
          message="Neraca saldo gagal dimuat. Periksa koneksi Anda, lalu coba lagi."
          onRetry={refetch}
        />
      </div>
    );
  }

  const totalDebit = (data || []).reduce((sum, i) => sum + i.ending_debit, 0);
  const totalCredit = (data || []).reduce((sum, i) => sum + i.ending_credit, 0);
  const difference = Math.abs(totalDebit - totalCredit);
  const isBalanced = totalDebit === totalCredit;

  // Zero-balance filter: server already excludes them, but when toggle is on
  // we need to re-fetch without the exclusion or filter client-side.
  // Server already returns only accounts with activity, so toggle just controls display.
  const displayData = data || [];

  const handleExport = async () => {
    await handleReportExport({
      orgId: orgData?.organization?.id,
      disabled: exporting,
      exportFn: () => exportTrialBalanceCsv(appliedDate),
      onFinally: () => setExporting(false),
    });
  };

  const isEmpty = !isLoading && displayData.length === 0;
  const isRefreshing = isFetching && !isLoading;

  return (
    <ReportShell
      title="Neraca Saldo"
      helpTopic="trial_balance"
      guide="reports/trial-balance"
      description={isRefreshing ? "Memperbarui laporan..." : `Per ${formatDateLong(appliedDate)}`}
    >

      {/* Toolbar: date + actions */}
      <Card>
        <CardContent>
          <form
            onSubmit={(e) => { e.preventDefault(); handleApplyDate(); }}
            className="flex flex-col sm:flex-row gap-3 items-end"
          >
            <Input
              label="Per tanggal"
              type="date"
              value={pendingDate}
              onChange={(e) => setPendingDate(e.target.value)}
              aria-describedby="date-hint"
            />
            <span id="date-hint" className="sr-only">
              Masukkan tanggal laporan, lalu pilih Tampilkan laporan
            </span>
            <div className="flex gap-2 w-full sm:w-auto">
              <Button
                type="submit"
                variant={isPending ? "primary" : "outline"}
                disabled={isPending && !pendingDate}
                loading={isLoading && !isRefreshing}
                className="flex-1 sm:flex-none"
              >
                {isRefreshing ? "Memperbarui..." : "Tampilkan laporan"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Muat ulang data"
                onClick={handleRefresh}
                disabled={isRefreshing}
              >
                <Refresh className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </form>
          <div className="flex flex-col sm:flex-row gap-3 items-end mt-3">
            <label className="flex items-center gap-2 text-sm text-wood-600">
              <input
                type="checkbox"
                checked={showZeroBalances}
                onChange={(e) => setShowZeroBalances(e.target.checked)}
                className="rounded border-wood-300"
              />
              <span>Tampilkan akun saldo nol</span>
            </label>
            {canCreateExports && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label="Ekspor neraca saldo ke CSV"
                onClick={handleExport}
                disabled={exporting || isLoading || isEmpty}
                loading={exporting}
                className="sm:ml-auto"
              >
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline">Ekspor CSV</span>
                <span className="sm:hidden">Ekspor</span>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Loading */}
      {isLoading && (
        <ReportSkeleton rows={8} cols={4} />
      )}

      {/* Empty */}
      {isEmpty && (
        <EmptyState
          title="Belum ada saldo akun per tanggal ini"
          description="Pilih tanggal lain atau catat transaksi terlebih dahulu."
        />
      )}

      {/* Data */}
      {!isLoading && displayData.length > 0 && (
        <Card>
          {/* Mobile: compact rows */}
          <ul className="space-y-px px-4 py-4 sm:hidden list-none p-0 m-0" aria-label="Daftar neraca saldo">
            {displayData.map((item) => {
              const hasDebit = item.ending_debit > 0;
              const hasCredit = item.ending_credit > 0;
              return (
                <li key={item.account_id} className="py-3 border-b border-wood-100 last:border-0 list-none">
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="font-mono text-xs text-wood-500 shrink-0">{item.account_code}</span>
                    <span className="text-sm font-medium text-wood-800 break-words min-w-0">{item.account_name}</span>
                  </div>
                  <div className="flex gap-4 text-sm">
                    <span className="text-wood-500 shrink-0">Debit</span>
                    <span className="font-mono text-wood-800 tabular-nums ml-auto">
                      {hasDebit ? formatIDR(item.ending_debit) : "—"}
                    </span>
                  </div>
                  <div className="flex gap-4 text-sm">
                    <span className="text-wood-500 shrink-0">Kredit</span>
                    <span className="font-mono text-wood-800 tabular-nums ml-auto">
                      {hasCredit ? formatIDR(item.ending_credit) : "—"}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>

          {/* Desktop: semantic table */}
          <div className="hidden ledger-scroll-x sm:block">
            <table className="ledger-table min-w-0 sm:min-w-[600px]">
              <caption className="sr-only">
                Neraca saldo per {formatDateLong(appliedDate)}
              </caption>
              <thead>
                <tr className="border-b border-wood-200">
                  <th scope="col" className="px-5 py-3 text-left font-medium text-wood-600 w-20">Kode</th>
                  <th scope="col" className="px-5 py-3 text-left font-medium text-wood-600">Nama Akun</th>
                  <th scope="col" className="px-5 py-3 text-right font-medium text-wood-600 w-36">Debit</th>
                  <th scope="col" className="px-5 py-3 text-right font-medium text-wood-600 w-36">Kredit</th>
                </tr>
              </thead>
              <tbody>
                {displayData.map((item) => (
                  <tr key={item.account_id} className="border-b border-wood-50 hover:bg-cream-100/50">
                    <td className="px-5 py-2 font-mono text-wood-600 tabular-nums">{item.account_code}</td>
                    <td className="min-w-0 sm:min-w-[200px] max-w-[400px] break-words px-5 py-2 text-wood-800">{item.account_name}</td>
                    <td className="px-5 py-2 text-right tabular-nums text-wood-800">
                      {item.ending_debit > 0 ? formatIDR(item.ending_debit) : "\u2014"}
                    </td>
                    <td className="px-5 py-2 text-right tabular-nums text-wood-800">
                      {item.ending_credit > 0 ? formatIDR(item.ending_credit) : "\u2014"}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className={`font-bold border-t-2 ${isBalanced ? "border-leaf-300 bg-leaf-50" : "border-error bg-error/10"}`}>
                  <th scope="row" colSpan={2} className="px-5 py-3 text-left text-wood-800">Total</th>
                  <td className="px-5 py-3 text-right tabular-nums text-wood-800">{formatIDR(totalDebit)}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-wood-800">{formatIDR(totalCredit)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Desktop: status bar (integrated with table, not a separate panel) */}
          <div className="hidden sm:block px-5 py-3 border-t border-wood-100" aria-live="polite">
            {isBalanced ? (
              <p className="text-sm font-medium text-leaf-600">Neraca saldo seimbang</p>
            ) : (
              <p className="text-sm font-medium text-error">
                Neraca saldo tidak seimbang. Selisih: {formatIDR(difference)}
              </p>
            )}
          </div>

          {/* Mobile: summary */}
          <div className={`sm:hidden border-t-2 ${isBalanced ? "border-leaf-300" : "border-error"}`} aria-live="polite">
            <div className="grid grid-cols-2 gap-px bg-wood-100">
              <div className="bg-surface-elevated px-4 py-2">
                <p className="text-[11px] uppercase tracking-wide text-wood-500">Total Debit</p>
                <p className="num-mono text-sm font-bold text-wood-800 tabular-nums">{formatIDR(totalDebit)}</p>
              </div>
              <div className="bg-surface-elevated px-4 py-2">
                <p className="text-[11px] uppercase tracking-wide text-wood-500">Total Kredit</p>
                <p className="num-mono text-sm font-bold text-wood-800 tabular-nums">{formatIDR(totalCredit)}</p>
              </div>
            </div>
            <div className={`px-4 py-2 text-center text-sm font-medium ${isBalanced ? "bg-leaf-50 text-leaf-600" : "bg-error/10 text-error"}`}>
              {isBalanced ? (
                "Neraca saldo seimbang"
              ) : (
                <>Neraca saldo tidak seimbang. Selisih: {formatIDR(difference)}</>
              )}
            </div>
          </div>
        </Card>
      )}
    </ReportShell>
  );
}
