import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { useOrganization, useOrgPermissions } from "@/hooks/useOrganization";
import { formatDateInputValue, formatIDR, formatShortDate } from "@/lib/utils";
import { TransactionListSkeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { translateError } from "@/lib/errors";
import { exportTransactionsCsv } from "@/lib/csv-export";
import { Receipt, Search, Download } from "lucide-react";
import {
  listTransactions,
  type TransactionStatus,
} from "@/lib/api/transactions";
import {
  TRANSACTION_LABELS,
  labelForTransactionType,
  statusVariant,
  statusLabel,
} from "@/lib/transactions";

function localDate(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return formatDateInputValue(date);
}

export function TransactionListPage() {
  const { data: orgData } = useOrganization();
  const { canCreateTransaction, canCreateExports } = useOrgPermissions();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<TransactionStatus | "">("");
  const [fromDate, setFromDate] = useState(() => localDate(-30));
  const [toDate, setToDate] = useState(() => localDate());
  const [page, setPage] = useState(0);
  const limit = 20;

  const normalizedSearch = search.trim().replace(/[,%()]/g, " ").replace(/\s+/g, " ");
  const dateRangeInvalid = fromDate > toDate;

  const { data: transactions, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.transactions.list(orgData?.organization?.id, normalizedSearch, typeFilter, statusFilter, fromDate, toDate, page),
    queryFn: async () => {
      if (!orgData?.organization?.id) return [];
      return listTransactions({
        search: normalizedSearch || undefined,
        transactionType: typeFilter || undefined,
        status: statusFilter || undefined,
        fromDate,
        toDate,
        limit,
        offset: page * limit,
      });
    },
    enabled: !!orgData?.organization?.id,
  });

  const handleExport = async () => {
    if (!orgData?.organization?.id || dateRangeInvalid) return;
    try {
      await exportTransactionsCsv({
        search: normalizedSearch || undefined,
        transactionType: typeFilter || undefined,
        status: statusFilter || undefined,
        fromDate,
        toDate,
      });
      toast.success("Export CSV transaksi dimulai");
    } catch (err) {
      toast.error(translateError(err));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Transaksi</h1>
          <p className="mt-1 text-sm text-text-secondary">Daftar transaksi posted dan pembatalan</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {canCreateExports && (
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleExport()}
              disabled={dateRangeInvalid || !transactions?.length}
            >
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
          )}
          {canCreateTransaction && (
            <Link
              to="/transactions/new"
              className="ledger-pressable inline-flex min-h-[44px] h-10 items-center justify-center rounded-md bg-wood-500 px-4 text-sm font-medium text-cream-50 transition-[background-color,transform] duration-150 ease-out hover:bg-wood-600 sm:min-h-0"
            >
              Transaksi Baru
            </Link>
          )}
        </div>
      </div>

      {/* Filters */}
      <section className="rounded-xl border border-wood-200 bg-surface-elevated p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-12 xl:items-end">
          <div className="xl:col-span-4">
            <label htmlFor="transaction-search" className="mb-1.5 block text-sm font-medium text-text-secondary">Cari transaksi</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-wood-400" />
              <input
                id="transaction-search"
                type="text"
                placeholder="Cari transaksi..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                className="h-10 min-h-[44px] w-full rounded-md border border-wood-200 bg-surface pl-9 pr-3 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-2 focus:outline-offset-2 focus:outline-wood-500 sm:min-h-0"
              />
            </div>
          </div>
          <div className="xl:col-span-2">
            <Input
              label="Dari"
              type="date"
              value={fromDate}
              onChange={(e) => { setFromDate(e.target.value); setPage(0); }}
            />
          </div>
          <div className="xl:col-span-2">
            <Input
              label="Sampai"
              type="date"
              value={toDate}
              onChange={(e) => { setToDate(e.target.value); setPage(0); }}
            />
          </div>
          <div className="xl:col-span-2">
            <label htmlFor="jenis-filter" className="mb-1.5 block text-sm font-medium text-text-secondary">Jenis</label>
            <Select
              id="jenis-filter"
              aria-label="Filter jenis transaksi"
              value={typeFilter}
              onChange={(e) => { setTypeFilter(e.target.value); setPage(0); }}
              placeholder="Semua Jenis"
              options={Object.entries(TRANSACTION_LABELS).filter(([k]) => !k.startsWith("opening_") && k !== "simple_adjustment").map(([value, label]) => ({ value, label }))}
            />
          </div>
          <div className="xl:col-span-2">
            <label htmlFor="status-filter" className="mb-1.5 block text-sm font-medium text-text-secondary">Status</label>
            <Select
              id="status-filter"
              aria-label="Filter status transaksi"
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value as TransactionStatus | ""); setPage(0); }}
              placeholder="Semua Status"
              options={[
                { value: "posted", label: "Posted" },
                { value: "voided", label: "Dibatalkan" },
              ]}
            />
          </div>
        </div>
      </section>

      {dateRangeInvalid && (
        <p className="text-sm text-error" role="alert">
          Tanggal awal tidak boleh melewati tanggal akhir.
        </p>
      )}

      {(search || typeFilter || statusFilter) && (
        <div className="flex flex-wrap items-center gap-2">
          {search && <Badge variant="neutral">Cari: {search}</Badge>}
          {typeFilter && (
            <Badge variant="info">
              Jenis: {TRANSACTION_LABELS[typeFilter] || typeFilter}
            </Badge>
          )}
          {statusFilter && <Badge variant={statusVariant(statusFilter)}>{statusLabel(statusFilter)}</Badge>}
          <Button
            type="button"
            variant="link"
            size="xs"
            onClick={() => {
              setSearch("");
              setTypeFilter("");
              setStatusFilter("");
              setPage(0);
            }}
          >
            Reset filter
          </Button>
        </div>
      )}

      {/* Table */}
      <section className="rounded-xl border border-wood-200 bg-surface-elevated">
        {error ? (
          <div className="p-8">
            <ErrorState error={error} onRetry={refetch} />
          </div>
        ) : isLoading ? (
          <div className="p-4">
            <TransactionListSkeleton />
          </div>
        ) : !transactions?.length ? (
          <div className="flex min-h-[420px] items-center justify-center p-8">
            <div className="mx-auto max-w-sm text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-wood-200 text-wood-500">
                <Receipt className="h-8 w-8" />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-text-primary">Belum ada transaksi</h3>
              <p className="mt-1 text-sm text-text-secondary">Catat transaksi pertama untuk mulai membentuk jurnal dan laporan.</p>
              {canCreateTransaction && (
                <Link
                  to="/transactions/new"
                  className="ledger-pressable mt-4 inline-flex min-h-[44px] h-10 items-center justify-center rounded-md bg-wood-500 px-4 text-sm font-medium text-cream-50 transition-[background-color,transform] duration-150 ease-out hover:bg-wood-600 sm:min-h-0"
                >
                  Catat Transaksi Pertama
                </Link>
              )}
            </div>
          </div>
        ) : (
        <>
          <div className="space-y-3 sm:hidden ledger-mobile-card-stack">
            {transactions.map((txn) => (
              <Card key={txn.id}>
                <CardContent>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link to={`/transactions/${txn.id}`} className="font-mono text-xs font-medium text-wood-700">
                        {txn.transaction_number}
                      </Link>
                      <p className="mt-1 line-clamp-2 break-words text-sm font-medium text-text-primary">{txn.description || "-"}</p>
                      <p className="mt-1 break-words text-xs text-text-tertiary">
                        {formatShortDate(txn.transaction_date)} · {labelForTransactionType(txn.transaction_type)}
                      </p>
                    </div>
                    <Badge variant={statusVariant(txn.status)} className="shrink-0">{statusLabel(txn.status)}</Badge>
                  </div>
                  <p className="mt-3 text-right num-mono text-lg font-semibold text-text-primary">{formatIDR(Number(txn.amount))}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="hidden ledger-scroll-x rounded-lg border border-wood-200 bg-cream-50 sm:block">
            <table className="min-w-[860px] w-full text-left text-sm">
              <thead className="border-b border-wood-100 bg-cream-100/70">
                <tr>
                  <th className="px-4 py-3 font-medium text-wood-600">Tanggal</th>
                  <th className="px-4 py-3 font-medium text-wood-600">No.</th>
                  <th className="px-4 py-3 font-medium text-wood-600">Jenis</th>
                  <th className="px-4 py-3 font-medium text-wood-600">Deskripsi</th>
                  <th className="px-4 py-3 text-right font-medium text-wood-600">Nominal</th>
                  <th className="px-4 py-3 font-medium text-wood-600">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-wood-50">
                {transactions.map((txn) => (
                  <tr key={txn.id} className="transition-colors hover:bg-cream-100/60">
                    <td className="whitespace-nowrap px-4 py-3 text-wood-600">
                      {formatShortDate(txn.transaction_date)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs">
                      <Link
                        to={`/transactions/${txn.id}`}
                        className="font-medium text-wood-700 hover:text-wood-900"
                      >
                        {txn.transaction_number}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-wood-700">
                      {labelForTransactionType(txn.transaction_type)}
                    </td>
                    <td className="max-w-[280px] px-4 py-3 text-wood-600">
                      <span className="line-clamp-2 break-words">{txn.description || "-"}</span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-medium num-mono text-wood-800">
                      {formatIDR(Number(txn.amount))}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={statusVariant(txn.status)}>{statusLabel(txn.status)}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
        )}
      </section>

      {/* Pagination */}
      {!error && transactions && (page > 0 || transactions.length === limit) && (
        <div className="mt-4 flex justify-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
          >
            Sebelumnya
          </Button>
          <span className="px-3 py-1.5 text-sm text-wood-500">Halaman {page + 1}</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => p + 1)}
            disabled={transactions.length < limit}
          >
            Selanjutnya
          </Button>
        </div>
      )}
    </div>
  );
}
