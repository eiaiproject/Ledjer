import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useOrganization, useOrgPermissions } from "@/hooks/useOrganization";
import { queryKeys } from "@/lib/query-keys";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { PageSpinner } from "@/components/ui/spinner";
import { ErrorState } from "@/components/ui/error-state";
import { formatDateInputValue, formatIDR, formatShortDate } from "@/lib/utils";
import { toast } from "@/components/ui/toast-api";
import { translateError } from "@/lib/errors";
import { exportGeneralLedgerCsv } from "@/lib/csv-export";
import { Download } from "lucide-react";
import { listAccounts } from "@/lib/api/accounts";
import { getGeneralLedger, type LedgerEntry } from "@/lib/api/reports";

export function GeneralLedgerPage() {
  const { data: orgData } = useOrganization();
  const { canViewReports, canCreateExports } = useOrgPermissions();
  
  const today = new Date();
  const firstDayOfMonth = formatDateInputValue(new Date(today.getFullYear(), today.getMonth(), 1));
  const [accountId, setAccountId] = useState("all");
  const [fromDate, setFromDate] = useState(firstDayOfMonth);
  const [toDate, setToDate] = useState(formatDateInputValue(today));
  const dateRangeInvalid = fromDate > toDate;

  const { data: accounts, isLoading: accountsLoading, error: accountsError, refetch: refetchAccounts } = useQuery({
    queryKey: queryKeys.accounts.ledgerOptions(orgData?.organization?.id ?? ""),
    queryFn: async () => {
      if (!orgData?.organization?.id) return [];
      return listAccounts({ active: true });
    },
    enabled: !!orgData?.organization?.id,
  });

  const { data: ledger, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.reports.generalLedger(orgData?.organization?.id, accountId, fromDate, toDate),
    queryFn: async () => {
      if (!orgData?.organization?.id) return [];
      return getGeneralLedger({
        accountId: accountId === "all" ? undefined : accountId,
        fromDate,
        toDate,
      });
    },
    enabled: !!orgData?.organization?.id && canViewReports && !dateRangeInvalid,
  });

  const selectedAccount = accounts?.find((a) => a.id === accountId);
  const showAllAccounts = accountId === "all";

  const handleExport = async () => {
    if (!orgData?.organization?.id || dateRangeInvalid) return;
    try {
      await exportGeneralLedgerCsv(
        accountId,
        fromDate,
        toDate,
      );
      toast.success("Export CSV buku besar dimulai");
    } catch (err) {
      toast.error(translateError(err));
    }
  };

  if (!canViewReports) {
    return (
      <Card>
        <CardContent className="text-center py-8">
          <p className="text-wood-500">Anda tidak memiliki izin untuk melihat laporan ini.</p>
        </CardContent>
      </Card>
    );
  }

  if (accountsError) return <ErrorState error={accountsError} onRetry={refetchAccounts} />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Buku Besar</h1>
        <p className="text-sm text-text-secondary mt-1">Rincian transaksi per akun</p>
      </div>

      <Card>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <Select
              label="Pilih Akun"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              placeholder={accountsLoading ? "Memuat akun..." : "-- Pilih Akun --"}
              disabled={accountsLoading}
              options={[
                { value: "all", label: "Semua Akun" },
                ...(accounts || []).map((a) => ({
                  value: a.id,
                  label: `${a.code} - ${a.name}`,
                })),
              ]}
            />
            <Input
              label="Dari Tanggal"
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              error={dateRangeInvalid ? "Tanggal awal tidak boleh setelah tanggal akhir." : undefined}
            />
            <Input
              label="Sampai Tanggal"
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              error={dateRangeInvalid ? "Tanggal akhir harus sama atau setelah tanggal awal." : undefined}
            />
            {canCreateExports && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => handleExport().catch((err) => console.error("export failed", err))}
                disabled={!ledger?.length || dateRangeInvalid}
              >
                <Download className="h-4 w-4" />
                Export CSV
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {dateRangeInvalid ? (
        <ErrorState message="Perbaiki rentang tanggal untuk melihat buku besar." />
      ) : isLoading ? (
        <PageSpinner />
      ) : (
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-text-primary">
              {showAllAccounts ? "Semua Akun" : selectedAccount ? `${selectedAccount.code} - ${selectedAccount.name}` : "Buku Besar"}
            </h2>
          </CardHeader>
          <div className="ledger-scroll-x">
            <table className="ledger-table min-w-[900px]">
              <thead>
                <tr className="border-b border-wood-200">
                  <th className="px-5 py-3 text-left font-medium text-wood-600">Tanggal</th>
                  <th className="px-5 py-3 text-left font-medium text-wood-600">No. Ref</th>
                  {showAllAccounts && (
                    <th className="px-5 py-3 text-left font-medium text-wood-600">Akun</th>
                  )}
                  <th className="px-5 py-3 text-left font-medium text-wood-600">Keterangan</th>
                  <th className="px-5 py-3 text-right font-medium text-wood-600">Debit</th>
                  <th className="px-5 py-3 text-right font-medium text-wood-600">Kredit</th>
                  {!showAllAccounts && (
                    <th className="px-5 py-3 text-right font-medium text-wood-600">Saldo</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {ledger && ledger.length > 0 ? (
                  (() => {
                    if (showAllAccounts) {
                      // Group entries by account_code
                      const groups: Record<string, { code: number; name: string; entries: LedgerEntry[] }> = {};
                      for (const entry of ledger) {
                        const key = String(entry.account_code);
                        if (!groups[key]) groups[key] = { code: entry.account_code, name: entry.account_name, entries: [] };
                        groups[key].entries.push(entry);
                      }
                      return Object.values(groups).sort((a, b) => a.code - b.code).map((group) => (
                        <Fragment key={group.code}>
                          <tr key={`hdr-${group.code}`} className="bg-cream-50">
                            <td colSpan={6} className="px-5 py-2 text-xs font-semibold text-wood-700">
                              {group.code} — {group.name}
                            </td>
                          </tr>
                          {group.entries.map((entry, idx) => (
                            <tr key={`${group.code}-${idx}`} className="border-b border-wood-50 hover:bg-cream-100/50">
                              <td className="px-5 py-2 text-wood-600">{formatShortDate(entry.entry_date)}</td>
                              <td className="px-5 py-2 font-mono text-xs text-wood-500">{entry.transaction_number}</td>
                              <td className="px-5 py-2 font-mono text-xs text-wood-500">{entry.account_code} - {entry.account_name}</td>
                              <td className="max-w-[320px] px-5 py-2 text-wood-800"><span className="line-clamp-2 break-words">{entry.description}</span></td>
                              <td className="px-5 py-2 text-right tabular-nums text-wood-800">{entry.debit > 0 ? formatIDR(entry.debit) : ""}</td>
                              <td className="px-5 py-2 text-right tabular-nums text-wood-800">{entry.credit > 0 ? formatIDR(entry.credit) : ""}</td>
                            </tr>
                          ))}
                        </Fragment>
                      ));
                    }
                    return ledger.map((entry) => (
                      <tr key={entry.journal_entry_id} className="border-b border-wood-50 hover:bg-cream-100/50">
                        <td className="px-5 py-2 text-wood-600">{formatShortDate(entry.entry_date)}</td>
                        <td className="px-5 py-2 font-mono text-xs text-wood-500">{entry.transaction_number}</td>
                        <td className="max-w-[320px] px-5 py-2 text-wood-800"><span className="line-clamp-2 break-words">{entry.description}</span></td>
                        <td className="px-5 py-2 text-right tabular-nums text-wood-800">{entry.debit > 0 ? formatIDR(entry.debit) : ""}</td>
                        <td className="px-5 py-2 text-right tabular-nums text-wood-800">{entry.credit > 0 ? formatIDR(entry.credit) : ""}</td>
                        <td className={`px-5 py-2 text-right tabular-nums font-medium ${entry.running_balance >= 0 ? "text-wood-800" : "text-error"}`}>{formatIDR(entry.running_balance)}</td>
                      </tr>
                    ));
                  })()
                ) : (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-wood-500">
                      Tidak ada transaksi untuk akun ini pada periode ini
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
