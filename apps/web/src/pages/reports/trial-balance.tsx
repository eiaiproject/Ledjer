import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useOrganization, useOrgPermissions } from "@/hooks/useOrganization";
import { queryKeys } from "@/lib/query-keys";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PageSpinner } from "@/components/ui/spinner";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate, formatDateInputValue, formatIDR } from "@/lib/utils";
import { toast } from "@/components/ui/toast";
import { translateError } from "@/lib/errors";
import { exportTrialBalanceCsv } from "@/lib/csv-export";
import { Download } from "lucide-react";
import { getTrialBalance } from "@/lib/api/reports";

export function TrialBalancePage() {
  const { data: orgData } = useOrganization();
  const { canViewReports, canCreateExports } = useOrgPermissions();
  
  const [toDate, setToDate] = useState(formatDateInputValue());

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.reports.trialBalance(orgData?.organization?.id, toDate),
    queryFn: async () => {
      if (!orgData?.organization?.id) return [];
      return getTrialBalance(toDate);
    },
    enabled: !!orgData?.organization?.id && canViewReports,
  });

  if (!canViewReports) {
    return (
      <Card>
        <CardContent className="text-center py-8">
          <p className="text-wood-500">Anda tidak memiliki izin untuk melihat laporan ini.</p>
        </CardContent>
      </Card>
    );
  }

  if (error) return <ErrorState error={error} onRetry={refetch} />;

  const totalDebit = (data || []).reduce((sum, i) => sum + i.ending_debit, 0);
  const totalCredit = (data || []).reduce((sum, i) => sum + i.ending_credit, 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 1;

  const handleExport = async () => {
    if (!orgData?.organization?.id) return;
    try {
      await exportTrialBalanceCsv(toDate);
      toast.success("Export CSV neraca saldo dimulai");
    } catch (err) {
      toast.error(translateError(err));
    }
  };

  return (
    <div className="ledger-page space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Neraca Saldo</h1>
        <p className="text-sm text-text-secondary mt-1">
          Per {formatDate(toDate)}
        </p>
      </div>

      <Card>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4 items-end">
            <Input label="Per Tanggal" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
            <Button type="button" variant="outline" aria-label="Muat ulang data" onClick={() => refetch().catch((err) => console.error("refetch failed", err))} loading={isLoading}>
              {isLoading ? "Memuat..." : "Muat Ulang"}
            </Button>
            {canCreateExports && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => handleExport().catch((err) => console.error("export failed", err))}
                disabled={!data?.length}
              >
                <Download className="h-4 w-4" />
                Export CSV
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {isLoading && (
        <PageSpinner />
      )}
      {!isLoading && !data?.length && (
        <EmptyState
          title="Belum ada saldo"
          description="Belum ada saldo akun pada tanggal ini."
        />
      )}
      {!isLoading && data?.length && (
        <Card>
          {/* Mobile: card per account */}
          <div className="space-y-3 px-4 py-4 sm:hidden ledger-mobile-card-stack">
            {(data || []).map((item) => (
              <div key={item.account_code} className="overflow-hidden rounded-lg border border-wood-200">
                <div className="px-4 py-3">
                  <p className="font-mono text-xs text-wood-500">{item.account_code}</p>
                  <p className="break-words text-sm font-medium text-wood-800">{item.account_name}</p>
                </div>
                <div className="grid grid-cols-2 gap-px border-t border-wood-100 bg-wood-100">
                  <div className="bg-surface-elevated px-4 py-2">
                    <p className="text-[11px] uppercase tracking-wide text-wood-500">Debit</p>
                    <p className="num-mono text-sm font-medium text-wood-800">
                      {item.ending_debit > 0 ? formatIDR(item.ending_debit) : "—"}
                    </p>
                  </div>
                  <div className="bg-surface-elevated px-4 py-2">
                    <p className="text-[11px] uppercase tracking-wide text-wood-500">Kredit</p>
                    <p className="num-mono text-sm font-medium text-wood-800">
                      {item.ending_credit > 0 ? formatIDR(item.ending_credit) : "—"}
                    </p>
                  </div>
                </div>
              </div>
            ))}
            <div className={`overflow-hidden rounded-lg border-2 ${isBalanced ? "border-leaf-300" : "border-error"}`}>
              <div className="grid grid-cols-2 gap-px bg-wood-100">
                <div className={`px-4 py-2 ${isBalanced ? "bg-leaf-50" : "bg-error/10"}`}>
                  <p className="text-[11px] uppercase tracking-wide text-wood-500">Total Debit</p>
                  <p className="num-mono text-sm font-bold text-wood-800">{formatIDR(totalDebit)}</p>
                </div>
                <div className={`px-4 py-2 ${isBalanced ? "bg-leaf-50" : "bg-error/10"}`}>
                  <p className="text-[11px] uppercase tracking-wide text-wood-500">Total Kredit</p>
                  <p className="num-mono text-sm font-bold text-wood-800">{formatIDR(totalCredit)}</p>
                </div>
              </div>
              <p className={`px-4 py-2 text-center text-sm font-medium ${isBalanced ? "bg-leaf-50 text-leaf-600" : "bg-error/10 text-error"}`}>
                {isBalanced ? "Neraca saldo seimbang" : `Selisih: ${formatIDR(Math.abs(totalDebit - totalCredit))}`}
              </p>
            </div>
          </div>

          {/* Desktop: table */}
          <div className="hidden ledger-scroll-x sm:block">
            <table className="ledger-table min-w-0 sm:min-w-[720px]">
              <thead>
                <tr className="border-b border-wood-200">
                  <th className="px-5 py-3 text-left font-medium text-wood-600">Kode</th>
                  <th className="px-5 py-3 text-left font-medium text-wood-600">Nama Akun</th>
                  <th className="px-5 py-3 text-right font-medium text-wood-600">Debit</th>
                  <th className="px-5 py-3 text-right font-medium text-wood-600">Kredit</th>
                </tr>
              </thead>
              <tbody>
                {(data || []).map((item) => (
                  <tr key={item.account_code} className="border-b border-wood-50 hover:bg-cream-100/50">
                    <td className="px-5 py-2 font-mono text-wood-600">{item.account_code}</td>
                    <td className="min-w-0 sm:min-w-[240px] max-w-[420px] break-words px-5 py-2 text-wood-800">{item.account_name}</td>
                    <td className="px-5 py-2 text-right tabular-nums text-wood-800">
                      {item.ending_debit > 0 ? formatIDR(item.ending_debit) : ""}
                    </td>
                    <td className="px-5 py-2 text-right tabular-nums text-wood-800">
                      {item.ending_credit > 0 ? formatIDR(item.ending_credit) : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className={`font-bold border-t-2 ${isBalanced ? "border-leaf-300 bg-leaf-50" : "border-error bg-error/10"}`}>
                  <td colSpan={2} className="px-5 py-3 text-wood-800">Total</td>
                  <td className="px-5 py-3 text-right tabular-nums text-wood-800">{formatIDR(totalDebit)}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-wood-800">{formatIDR(totalCredit)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <CardContent className="hidden sm:block">
            {isBalanced ? (
              <p className="text-sm font-medium text-leaf-600">Neraca saldo seimbang</p>
            ) : (
              <p className="text-sm text-error font-medium">
                Selisih: {formatIDR(Math.abs(totalDebit - totalCredit))}
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
