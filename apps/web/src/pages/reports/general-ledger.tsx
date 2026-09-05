import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useOrganization } from "@/hooks/useOrganization";
import { getGeneralLedger, type GeneralLedgerEntry } from "@/lib/api/reports";
import { listAccounts } from "@/lib/api/accounts";
import { queryKeys } from "@/lib/query-keys";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Callout } from "@/components/ui/callout";
import { formatIDR, formatShortDate, monthRange } from "@/lib/utils";

interface LedgerGroup {
  accountId: string;
  code: string;
  name: string;
  entries: GeneralLedgerEntry[];
}

export function GeneralLedgerPage() {
  const { data: orgData } = useOrganization();
  const orgId = orgData?.organization?.id;
  const initialRange = monthRange();

  const [fromDate, setFromDate] = useState(initialRange.from);
  const [toDate, setToDate] = useState(initialRange.to);
  const [accountId, setAccountId] = useState("");
  const [submitted, setSubmitted] = useState({
    fromDate: initialRange.from,
    toDate: initialRange.to,
    accountId: "",
  });

  const accountsQuery = useQuery({
    queryKey: queryKeys.accounts.fullList(orgId ?? ""),
    queryFn: async () => {
      if (!orgId) throw new Error("No organization");
      return listAccounts();
    },
    enabled: !!orgId,
  });

  const query = useQuery({
    queryKey: queryKeys.reports.generalLedger(
      orgId,
      submitted.fromDate,
      submitted.toDate,
      submitted.accountId || undefined,
    ),
    queryFn: async () => {
      if (!orgId) throw new Error("No organization");
      return getGeneralLedger(
        submitted.fromDate,
        submitted.toDate,
        submitted.accountId || undefined,
      );
    },
    enabled: !!orgId,
  });

  const report = query.data;

  const groups = useMemo<LedgerGroup[]>(() => {
    const out: LedgerGroup[] = [];
    for (const entry of report?.entries ?? []) {
      const last = out.at(-1);
      if (!last || last.accountId !== entry.account_id) {
        out.push({
          accountId: entry.account_id,
          code: entry.account_code,
          name: entry.account_name,
          entries: [entry],
        });
      } else {
        last.entries.push(entry);
      }
    }
    return out;
  }, [report]);

  const accountOptions = useMemo(
    () => [
      { value: "", label: "Semua Akun" },
      ...(accountsQuery.data ?? []).map((account) => ({
        value: account.id,
        label: `${account.code} · ${account.name}`,
      })),
    ],
    [accountsQuery.data],
  );

  const applyFilters = () => {
    setSubmitted({ fromDate, toDate, accountId });
  };

  let reportContent: ReactNode = null;
  if (query.isLoading) {
    reportContent = <div className="h-48 animate-pulse rounded-xl bg-wood-100" />;
  } else if (query.isError) {
    reportContent = (
      <ErrorState
        title="Gagal memuat buku besar"
        message="Terjadi kesalahan saat mengambil riwayat jurnal."
        onRetry={() => query.refetch()}
      />
    );
  } else if (report && report.entries.length > 0) {
    reportContent = (
      <>
        {report.truncated && (
          <Callout variant="info">
            Hasil dipotong pada 5.000 baris. Persempit rentang tanggal atau pilih satu akun.
          </Callout>
        )}
        <Card elevated>
          <CardContent className="p-0">
            <div className="ledger-scroll-x">
              <table className="ledger-table">
                <thead>
                  <tr>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Tanggal</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">No. Transaksi</th>
                    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Keterangan</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide">Debit</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide">Kredit</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((group) => (
                    <LedgerGroupRows key={group.accountId} group={group} />
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </>
    );
  } else if (report) {
    reportContent = (
      <EmptyState
        title="Tidak ada jurnal pada periode ini"
        description="Belum ada transaksi posted yang cocok dengan filter ini."
      />
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Buku Besar"
        description="Riwayat jurnal per akun dengan saldo berjalan."
      />

      <Card elevated>
        <CardContent className="p-4">
          <form
            className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]"
            onSubmit={(e) => {
              e.preventDefault();
              applyFilters();
            }}
          >
            <Input label="Dari" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            <Input label="Sampai" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
            <Select
              label="Akun"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              options={accountOptions}
            />
            <Button type="submit">Tampilkan</Button>
          </form>
        </CardContent>
      </Card>

      {reportContent}
    </div>
  );
}

function LedgerGroupRows({ group }: { readonly group: LedgerGroup }) {
  return (
    <>
      <tr className="border-t-2 border-wood-300 bg-cream-100">
        <td colSpan={6} className="px-4 py-2 text-sm font-semibold text-text-primary">
          {group.code} · {group.name}
        </td>
      </tr>
      {group.entries.map((entry) => (
        <tr key={`${entry.transaction_id}-${entry.account_id}`}>
          <td className="px-4 py-2.5 text-sm whitespace-nowrap text-text-secondary">
            {formatShortDate(entry.entry_date)}
          </td>
          <td className="px-4 py-2.5 font-mono text-xs whitespace-nowrap text-text-tertiary">
            {entry.transaction_number}
          </td>
          <td className="px-4 py-2.5 text-sm break-words text-text-primary">
            {entry.description}
          </td>
          <td className="num-mono px-4 py-2.5 text-right text-sm text-text-primary">
            {entry.debit_idr > 0 ? formatIDR(entry.debit_idr) : ""}
          </td>
          <td className="num-mono px-4 py-2.5 text-right text-sm text-text-primary">
            {entry.credit_idr > 0 ? formatIDR(entry.credit_idr) : ""}
          </td>
          <td className="num-mono px-4 py-2.5 text-right text-sm font-semibold text-text-primary">
            {formatIDR(entry.running_balance_idr)}
          </td>
        </tr>
      ))}
    </>
  );
}
