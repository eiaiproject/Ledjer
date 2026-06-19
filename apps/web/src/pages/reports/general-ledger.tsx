import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useOrganization, useOrgPermissions } from "@/hooks/useOrganization";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { PageSpinner } from "@/components/ui/spinner";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { formatIDR, formatShortDate } from "@/lib/utils";

interface LedgerEntry {
  entry_date: string;
  transaction_number: string;
  description: string;
  debit: number;
  credit: number;
  running_balance: number;
}

export function GeneralLedgerPage() {
  const { data: orgData } = useOrganization();
  const { canViewReports } = useOrgPermissions();
  
  const today = new Date();
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split("T")[0];
  const [accountId, setAccountId] = useState("");
  const [fromDate, setFromDate] = useState(firstDayOfMonth);
  const [toDate, setToDate] = useState(today.toISOString().split("T")[0]);

  const { data: accounts } = useQuery({
    queryKey: ["accounts", orgData?.organization?.id],
    queryFn: async () => {
      if (!orgData?.organization?.id) return [];
      const { data, error } = await supabase
        .from("accounts")
        .select("id, code, name")
        .eq("organization_id", orgData.organization.id)
        .eq("is_active", true)
        .order("code");
      if (error) throw error;
      return data || [];
    },
    enabled: !!orgData?.organization?.id,
  });

  const { data: ledger, isLoading, error, refetch } = useQuery({
    queryKey: ["general-ledger", orgData?.organization?.id, accountId, fromDate, toDate],
    queryFn: async () => {
      if (!orgData?.organization?.id || !accountId) return [];

      const { data, error } = await supabase.rpc("get_general_ledger", {
        p_organization_id: orgData.organization.id,
        p_account_id: accountId,
        p_from_date: fromDate,
        p_to_date: toDate,
      });
      if (error) throw error;
      return (data || []) as LedgerEntry[];
    },
    enabled: !!orgData?.organization?.id && !!accountId && canViewReports,
  });

  const selectedAccount = accounts?.find((a) => a.id === accountId);

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-wood-800">Buku Besar</h1>
        <p className="text-sm text-wood-500 mt-1">Rincian transaksi per akun</p>
      </div>

      <Card>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <Select
              label="Pilih Akun"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              placeholder="-- Pilih Akun --"
              options={(accounts || []).map((a) => ({
                value: a.id,
                label: `${a.code} - ${a.name}`,
              }))}
            />
            <Input label="Dari Tanggal" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            <Input label="Sampai Tanggal" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {!accountId ? (
        <EmptyState
          title="Pilih akun"
          description="Pilih akun untuk melihat buku besarnya"
        />
      ) : isLoading ? (
        <PageSpinner />
      ) : (
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-wood-800">
              {selectedAccount ? `${selectedAccount.code} - ${selectedAccount.name}` : "Buku Besar"}
            </h2>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-wood-200">
                  <th className="px-5 py-3 text-left font-medium text-wood-600">Tanggal</th>
                  <th className="px-5 py-3 text-left font-medium text-wood-600">No. Ref</th>
                  <th className="px-5 py-3 text-left font-medium text-wood-600">Keterangan</th>
                  <th className="px-5 py-3 text-right font-medium text-wood-600">Debit</th>
                  <th className="px-5 py-3 text-right font-medium text-wood-600">Kredit</th>
                  <th className="px-5 py-3 text-right font-medium text-wood-600">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {ledger && ledger.length > 0 ? (
                  ledger.map((entry, idx) => (
                    <tr key={idx} className="border-b border-wood-50 hover:bg-cream-100/50">
                      <td className="px-5 py-2 text-wood-600">{formatShortDate(entry.entry_date)}</td>
                      <td className="px-5 py-2 font-mono text-xs text-wood-500">{entry.transaction_number}</td>
                      <td className="px-5 py-2 text-wood-800 max-w-[200px] truncate">{entry.description}</td>
                      <td className="px-5 py-2 text-right tabular-nums text-wood-800">
                        {entry.debit > 0 ? formatIDR(entry.debit) : ""}
                      </td>
                      <td className="px-5 py-2 text-right tabular-nums text-wood-800">
                        {entry.credit > 0 ? formatIDR(entry.credit) : ""}
                      </td>
                      <td className={`px-5 py-2 text-right tabular-nums font-medium ${
                        entry.running_balance >= 0 ? "text-wood-800" : "text-error"
                      }`}>
                        {formatIDR(entry.running_balance)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-wood-400">
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
