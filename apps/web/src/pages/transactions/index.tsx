import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { useOrganization, useOrgPermissions } from "@/hooks/useOrganization";
import { cn, formatDateInputValue, formatIDR, formatShortDate } from "@/lib/utils";
import { TransactionListSkeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { translateError } from "@/lib/errors";
import { exportTransactionsCsv } from "@/lib/csv-export";
import { Receipt, Search, Download, ChevronDown, ChevronUp, Check, X, ArrowRight } from "lucide-react";
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

/** Status badge with icon for accessibility */
function StatusBadge({ status }: { readonly status: string }) {
  const variant = statusVariant(status);
  const label = statusLabel(status);

  return (
    <Badge variant={variant} size="sm">
      <StatusIcon status={status} />
      {label}
    </Badge>
  );
}

function StatusIcon({ status }: { readonly status: string }) {
  if (status === "posted") return <Check className="h-3 w-3" />;
  if (status === "voided") return <X className="h-3 w-3" />;
  return <ArrowRight className="h-3 w-3" />;
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
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const limit = 20;

  // Default window is the last 30 days
  const DEFAULT_FROM = localDate(-30);
  const DEFAULT_TO = localDate();
  const filtersActive =
    Boolean(search.trim()) ||
    Boolean(typeFilter) ||
    Boolean(statusFilter) ||
    fromDate !== DEFAULT_FROM ||
    toDate !== DEFAULT_TO;

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

  const resetFilters = () => {
    setSearch("");
    setTypeFilter("");
    setStatusFilter("");
    setFromDate(DEFAULT_FROM);
    setToDate(DEFAULT_TO);
    setPage(0);
  };

  const emptyTitle = filtersActive
    ? "Tidak ada transaksi yang cocok"
    : "Belum ada transaksi";
  const emptyDescription = filtersActive
    ? "Coba ubah filter atau rentang tanggal."
    : "Catat transaksi pertama untuk mulai membentuk jurnal.";
  let emptyAction: ReactNode = undefined;
  if (filtersActive) {
    emptyAction = (
      <Button type="button" variant="outline" size="sm" onClick={resetFilters}>
        Reset filter
      </Button>
    );
  } else if (canCreateTransaction) {
    emptyAction = (
      <Link
        to="/transactions/new"
        className="ledger-pressable inline-flex min-h-[44px] items-center justify-center rounded-md bg-wood-500 px-4 py-2 text-sm font-medium text-cream-50 transition-[background-color,transform] duration-150 ease-out hover:bg-wood-600"
      >
        Catat Transaksi Pertama
      </Link>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Transaksi</h1>
          <p className="mt-1 text-sm text-text-secondary">Daftar transaksi posted dan pembatalan</p>
        </div>
        <div className="flex items-center gap-2">
          {canCreateExports && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void handleExport()}
              disabled={dateRangeInvalid || !transactions?.length}
              className="hidden sm:inline-flex"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
          )}
          {canCreateExports && (
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => void handleExport()}
              disabled={dateRangeInvalid || !transactions?.length}
              className="sm:hidden min-h-[44px] min-w-[44px]"
              aria-label="Export CSV"
            >
              <Download className="h-4 w-4" />
            </Button>
          )}
          {canCreateTransaction && (
            <Link
              to="/transactions/new"
              className="ledger-pressable inline-flex min-h-[44px] items-center justify-center rounded-md bg-wood-500 px-4 py-2 text-sm font-medium text-cream-50 transition-[background-color,transform] duration-150 ease-out hover:bg-wood-600"
            >
              Transaksi Baru
            </Link>
          )}
        </div>
      </div>

      {/* Search — always visible */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-wood-400" />
        <input
          id="transaction-search"
          type="text"
          placeholder="Cari transaksi..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          className="h-11 min-h-[44px] w-full rounded-lg border border-wood-200 bg-surface pl-10 pr-4 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-2 focus:outline-offset-2 focus:outline-wood-500 sm:h-10 sm:min-h-0"
        />
      </div>

      {/* Filters — collapsible on mobile */}
      <div className="rounded-xl border border-wood-200 bg-surface-elevated">
        <button
          type="button"
          onClick={() => setFiltersExpanded(!filtersExpanded)}
          className="flex w-full items-center justify-between gap-2 px-4 py-3 text-sm font-medium text-text-secondary sm:pointer-events-none sm:hidden min-h-[44px]"
          aria-expanded={filtersExpanded}
        >
          <span className="flex items-center gap-2">
            Filter
            {filtersActive && (
              <Badge variant="info" size="sm">Aktif</Badge>
            )}
          </span>
          {filtersExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        
        <div className={cn(
          "overflow-hidden transition-all duration-200 sm:block",
          filtersExpanded ? "block" : "hidden"
        )}>
          <div className="grid grid-cols-1 gap-3 border-t border-wood-100 p-4 sm:border-0 sm:p-0 md:grid-cols-2 xl:grid-cols-12 xl:items-end">
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
            <div className="xl:col-span-4">
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
            <div className="xl:col-span-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={resetFilters}
                disabled={!filtersActive}
                className="w-full sm:w-auto"
              >
                Reset
              </Button>
            </div>
          </div>
        </div>
      </div>

      {dateRangeInvalid && (
        <p className="text-sm text-error" role="alert">
          Tanggal awal tidak boleh melewati tanggal akhir.
        </p>
      )}

      {/* Active filter badges */}
      {filtersActive && (
        <div className="flex flex-wrap items-center gap-2">
          {search && <Badge variant="neutral">Cari: {search}</Badge>}
          {typeFilter && (
            <Badge variant="info">
              Jenis: {TRANSACTION_LABELS[typeFilter] || typeFilter}
            </Badge>
          )}
          {statusFilter && <StatusBadge status={statusFilter} />}
          <Button
            type="button"
            variant="link"
            size="xs"
            onClick={resetFilters}
          >
            Reset semua
          </Button>
        </div>
      )}

      {/* Transaction list */}
      <section className="rounded-xl border border-wood-200 bg-surface-elevated">
        {error && (
          <div className="p-8">
            <ErrorState error={error} onRetry={refetch} />
          </div>
        )}
        {!error && isLoading && (
          <div className="p-4">
            <TransactionListSkeleton />
          </div>
        )}
        {!error && !isLoading && !transactions?.length && (
          <EmptyState
            icon={<Receipt className="h-8 w-8" />}
            title={emptyTitle}
            description={emptyDescription}
            action={emptyAction}
          />
        )}
        {!error && !isLoading && (transactions?.length ?? 0) > 0 && (
        <>
          {/* Mobile: Card stack */}
          <div className="divide-y divide-wood-100 sm:hidden">
            {transactions?.map((txn) => (
              <Link
                key={txn.id}
                to={`/transactions/${txn.id}`}
                className="flex items-center justify-between gap-3 px-4 py-3 outline-none hover:bg-cream-50 active:bg-cream-100 transition-colors min-h-[56px]"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-medium text-wood-600">
                      {txn.transaction_number}
                    </span>
                    <StatusBadge status={txn.status} />
                  </div>
                  <p className="mt-1 line-clamp-1 break-words text-sm font-medium text-text-primary">
                    {txn.description || labelForTransactionType(txn.transaction_type)}
                  </p>
                  <p className="mt-0.5 text-xs text-text-tertiary">
                    {formatShortDate(txn.transaction_date)} · {labelForTransactionType(txn.transaction_type)}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="num-mono text-sm font-semibold text-text-primary">
                    {formatIDR(Number(txn.amount))}
                  </p>
                </div>
              </Link>
            ))}
          </div>

          {/* Desktop: Table */}
          <div className="hidden sm:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-wood-100 bg-cream-100/50">
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
                {transactions?.map((txn) => (
                  <tr key={txn.id} className="transition-colors hover:bg-cream-50">
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
                      <StatusBadge status={txn.status} />
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
        <div className="flex justify-center gap-2">
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


