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
import { toast } from "@/components/ui/toast-api";
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
      await exportTrialBalanceCsv(orgData.organization.id, toDate);
      toast.success("Export CSV neraca saldo dimulai");
    } catch (err) {
      toast.error(translateError(err));
    }
  };

  return (
    <div className="space-y-6">
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
            <Button type="button" variant="outline" aria-label="Muat ulang data" onClick={() => void refetch()} loading={isLoading}>
              {isLoading ? "Memuat..." : "Muat Ulang"}
            </Button>
            {canCreateExports && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => void handleExport()}
                disabled={!data?.length}
              >
                <Download className="h-4 w-4" />
                Export CSV
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <PageSpinner />
      ) : !data?.length ? (
        <EmptyState
          title="Belum ada saldo"
          description="Belum ada saldo akun pada tanggal ini."
        />
      ) : (
        <Card>
          <div className="ledger-scroll-x">
            <table className="ledger-table min-w-[720px]">
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
                    <td className="min-w-[240px] max-w-[420px] break-words px-5 py-2 text-wood-800">{item.account_name}</td>
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
          <CardContent>
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
