import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

/* ------------------------------------------------------------------ */
/*  Empty state helper (reduce cognitive complexity)                   */
/* ------------------------------------------------------------------ */

function getEmptyContent({ isSearchAndFilterEmpty, isSearchEmpty, isFilterEmpty, isDatasetEmpty, canCreateTransaction, search, resetSearch, resetFilters }: {
  isSearchAndFilterEmpty: boolean;
  isSearchEmpty: boolean;
  isFilterEmpty: boolean;
  isDatasetEmpty: boolean;
  canCreateTransaction: boolean;
  search: string;
  resetSearch: () => void;
  resetFilters: () => void;
}): ReactNode {
  if (isSearchAndFilterEmpty) {
    return (
      <EmptyState icon={<Filter className="h-8 w-8" />}
        title="Tidak ada transaksi yang sesuai"
        description="Coba ubah pencarian atau filter yang digunakan."
        action={<div className="flex flex-wrap gap-2"><Button type="button" variant="outline" size="sm" onClick={resetSearch}>Hapus pencarian</Button><Button type="button" variant="outline" size="sm" onClick={resetFilters}>Reset filter</Button></div>} />
    );
  }
  if (isSearchEmpty) {
    return (
      <EmptyState icon={<Search className="h-8 w-8" />}
        title="Transaksi tidak ditemukan"
        description={`Tidak ada transaksi yang cocok dengan "${search}".`}
        action={<Button type="button" variant="outline" size="sm" onClick={resetSearch}>Hapus pencarian</Button>} />
    );
  }
  if (isFilterEmpty) {
    return (
      <EmptyState icon={<Filter className="h-8 w-8" />}
        title="Tidak ada transaksi yang sesuai"
        description="Coba ubah tanggal, status, atau filter yang dipilih."
        action={<Button type="button" variant="outline" size="sm" onClick={resetFilters}>Reset filter</Button>} />
    );
  }
  if (isDatasetEmpty) {
    return (
      <EmptyState icon={<Receipt className="h-8 w-8" />}
        title="Belum ada transaksi"
        description="Catat transaksi pertama untuk mulai membentuk jurnal."
        action={canCreateTransaction ? (
          <Link to="/transactions/new" className="ledger-pressable inline-flex min-h-[44px] items-center justify-center rounded-md bg-wood-500 px-4 py-2 text-sm font-medium text-cream-50 transition-[background-color,transform] duration-150 ease-out hover:bg-wood-600">
            Catat transaksi pertama
          </Link>
        ) : undefined} />
    );
  }
  return null;
}
import { queryKeys } from "@/lib/query-keys";
import { useOrganization, useOrgPermissions } from "@/hooks/useOrganization";
import { cn, formatIDR, formatShortDate, localDate } from "@/lib/utils";
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
import { Receipt, Search, Download, ChevronDown, ChevronUp, Check, X, ArrowRight, Filter, XCircle } from "reicon-react";
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
  const [exporting, setExporting] = useState(false);
  const limit = 20;

  const DEFAULT_FROM = localDate(-30);
  const DEFAULT_TO = localDate();

  const normalizedSearch = search.trim().replace(/[,%()]/g, " ").replace(/\s+/g, " ");
  const dateRangeInvalid = fromDate > toDate;

  const hasSearchQuery = Boolean(normalizedSearch);
  const hasTypeFilter = Boolean(typeFilter);
  const hasStatusFilter = Boolean(statusFilter);
  const hasDateFilter = fromDate !== DEFAULT_FROM || toDate !== DEFAULT_TO;
  const hasActiveFilters = hasTypeFilter || hasStatusFilter || hasDateFilter;
  const hasAnyActiveCriteria = hasSearchQuery || hasActiveFilters;

  const activeFilterCount = [hasTypeFilter, hasStatusFilter, hasDateFilter].filter(Boolean).length;

  const { data: transactions, isLoading, error, refetch, isFetching } = useQuery({
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

  // Derived state model
  const isInitialLoading = isLoading && !transactions;
  const hasAnyTransactions = (transactions?.length ?? 0) > 0 || (page > 0);
  const isDatasetEmpty = !isLoading && !error && transactions !== undefined && transactions.length === 0 && page === 0 && !hasAnyActiveCriteria;
  const isSearchEmpty = hasSearchQuery && !hasActiveFilters && !isLoading && transactions?.length === 0;
  const isFilterEmpty = hasActiveFilters && !hasSearchQuery && !isLoading && transactions?.length === 0;
  const isSearchAndFilterEmpty = hasSearchQuery && hasActiveFilters && !isLoading && transactions?.length === 0;
  const isPageError = Boolean(error);
  const isRefreshing = isFetching && !isLoading;
  const canExport = canCreateExports && !isDatasetEmpty && !isPageError && !dateRangeInvalid;

  const handleExport = async () => {
    if (!orgData?.organization?.id || dateRangeInvalid || exporting) return;
    setExporting(true);
    try {
      await exportTransactionsCsv({
        search: normalizedSearch || undefined,
        transactionType: typeFilter || undefined,
        status: statusFilter || undefined,
        fromDate,
        toDate,
      });
      toast.success("Ekspor CSV transaksi dimulai");
    } catch (err) {
      toast.error(translateError(err));
    } finally {
      setExporting(false);
    }
  };

  const resetFilters = () => {
    setTypeFilter("");
    setStatusFilter("");
    setFromDate(DEFAULT_FROM);
    setToDate(DEFAULT_TO);
    setPage(0);
  };

  const resetSearch = () => {
    setSearch("");
    setPage(0);
  };

  const resetAll = () => {
    setSearch("");
    resetFilters();
  };

  // Empty state content based on state
  const emptyContent = getEmptyContent({
    isSearchAndFilterEmpty, isSearchEmpty, isFilterEmpty, isDatasetEmpty,
    canCreateTransaction, search, resetSearch, resetFilters,
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Transaksi</h1>
          <p className="mt-1 text-sm text-text-secondary">
            {isDatasetEmpty
              ? "Mulai mencatat transaksi bisnis Anda"
              : "Lihat dan kelola seluruh transaksi bisnis Anda"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canExport && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => { handleExport(); }}
              disabled={exporting}
              className="hidden sm:inline-flex"
            >
              {exporting ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  <span>Mengekspor...</span>
                </>
              ) : (
                <>
                  <Download className="h-4 w-4" />
                  Ekspor CSV
                </>
              )}
            </Button>
          )}
          {canExport && (
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => { handleExport(); }}
              disabled={exporting}
              className="sm:hidden min-h-[44px] min-w-[44px]"
              aria-label="Ekspor transaksi"
            >
              {exporting ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                <Download className="h-4 w-4" />
              )}
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

      {/* Search & Filter — only show when data exists or has active criteria */}
      {!isDatasetEmpty && (
        <>
          {/* Search */}
          <div className="relative">
            <label htmlFor="transaction-search" className="sr-only">
              Cari transaksi
            </label>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-wood-400" aria-hidden="true" />
            <input
              id="transaction-search"
              type="search"
              placeholder="Cari transaksi..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              className="h-11 min-h-[44px] w-full rounded-lg border border-wood-200 bg-surface pl-10 pr-10 text-sm text-text-primary placeholder:text-text-tertiary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wood-500 sm:h-10 sm:min-h-0"
            />
            {search && (
              <button                 type="button"
                onClick={resetSearch}
                className="absolute right-3 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-wood-400 hover:bg-cream-200 hover:text-wood-600 min-h-[44px] min-w-[44px] -my-[9px]"
                aria-label="Hapus pencarian"
              >
                <XCircle className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Filters — collapsible on mobile */}
          <div className="rounded-xl border border-wood-200 bg-surface-elevated">
            <button               type="button"
              onClick={() => setFiltersExpanded(!filtersExpanded)}
              className="flex w-full items-center justify-between gap-2 px-4 py-3 text-sm font-medium text-text-secondary sm:pointer-events-none sm:hidden min-h-[44px]"
              aria-expanded={filtersExpanded}
              aria-controls="transaction-filters-panel"
            >
              <span className="flex items-center gap-2">
                <Filter className="h-4 w-4" aria-hidden="true" />
                Filter
                {activeFilterCount > 0 && (
                  <Badge variant="info" size="sm">{activeFilterCount}</Badge>
                )}
              </span>
              {filtersExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>

            <div
              id="transaction-filters-panel"
              className={cn(
                "overflow-hidden transition-all duration-200 sm:block",
                filtersExpanded ? "block" : "hidden"
              )}
            >
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
                  <Select
                    label="Jenis"
                    id="jenis-filter"
                    value={typeFilter}
                    onChange={(e) => { setTypeFilter(e.target.value); setPage(0); }}
                    placeholder="Semua Jenis"
                    options={Object.entries(TRANSACTION_LABELS).filter(([k]) => !k.startsWith("opening_") && k !== "simple_adjustment").map(([value, label]) => ({ value, label }))}
                  />
                </div>
                <div className="xl:col-span-2">
                  <Select
                    label="Status"
                    id="status-filter"
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
                    disabled={!hasActiveFilters}
                    className="w-full sm:w-auto"
                  >
                    Reset filter
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {dateRangeInvalid && (
        <p className="text-sm text-error" role="alert">
          Tanggal awal tidak boleh melewati tanggal akhir.
        </p>
      )}

      {/* Active filter chips */}
      {hasAnyActiveCriteria && !isDatasetEmpty && (
        <div className="flex flex-wrap items-center gap-2" aria-label="Filter aktif">
          {hasSearchQuery && (
            <Badge variant="neutral">
              Cari: {search}
              <button                 type="button"
                onClick={resetSearch}
                className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full hover:bg-wood-200 min-h-[44px] min-w-[44px] -my-[10px]"
                aria-label="Hapus pencarian"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {hasTypeFilter && (
            <Badge variant="info">
              Jenis: {TRANSACTION_LABELS[typeFilter] || typeFilter}
              <button                 type="button"
                onClick={() => { setTypeFilter(""); setPage(0); }}
                className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full hover:bg-info-bg min-h-[44px] min-w-[44px] -my-[10px]"
                aria-label={`Hapus filter jenis ${TRANSACTION_LABELS[typeFilter] || typeFilter}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {hasStatusFilter && (
            <Badge variant={statusVariant(statusFilter)}>
              Status: {statusLabel(statusFilter)}
              <button                 type="button"
                onClick={() => { setStatusFilter(""); setPage(0); }}
                className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full hover:bg-wood-200 min-h-[44px] min-w-[44px] -my-[10px]"
                aria-label={`Hapus filter status ${statusLabel(statusFilter)}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {(hasSearchQuery || hasActiveFilters) && (
            <Button
              type="button"
              variant="link"
              size="xs"
              onClick={resetAll}
            >
              Reset semua
            </Button>
          )}
        </div>
      )}

      {/* Background refresh indicator */}
      {isRefreshing && (
        <div className="flex items-center gap-2 text-xs text-text-tertiary" role="status" aria-live="polite">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-wood-300 border-t-wood-600" />
          <span>Memperbarui...</span>
        </div>
      )}

      {/* Transaction list */}
      <section className="rounded-xl border border-wood-200 bg-surface-elevated" aria-label="Daftar transaksi">
        {isPageError && (
          <div className="p-8">
            <ErrorState
              error={error}
              message="Periksa koneksi Anda, lalu coba lagi."
              onRetry={() => { refetch(); }}
            />
          </div>
        )}

        {isInitialLoading && (
          <div className="p-4">
            <TransactionListSkeleton />
          </div>
        )}

        {!isPageError && !isInitialLoading && emptyContent}

        {!isPageError && !isInitialLoading && hasAnyTransactions && (
          <>
            {/* Result count */}
            {hasAnyActiveCriteria && (
              <div className="border-b border-wood-100 px-4 py-2.5">
                <p className="text-xs text-text-tertiary">
                  {transactions?.length ?? 0} transaksi ditemukan
                  {page > 0 && ` · Halaman ${page + 1}`}
                </p>
              </div>
            )}

            {/* Mobile: Card list */}
            <div className="divide-y divide-wood-100 sm:hidden">
              {transactions?.map((txn) => (
                <Link
                  key={txn.id}
                  to={`/transactions/${txn.id}`}
                  className="flex items-start justify-between gap-3 px-4 py-3 outline-none hover:bg-cream-50 active:bg-cream-100 transition-colors min-h-[64px]"
                  aria-label={`${labelForTransactionType(txn.transaction_type)}, ${formatIDR(Number(txn.amount))}, ${statusLabel(txn.status)}, ${formatShortDate(txn.transaction_date)}`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-medium text-wood-600">
                        {txn.transaction_number}
                      </span>
                      <StatusBadge status={txn.status} />
                    </div>
                    <p className="mt-1 line-clamp-2 break-words text-sm font-medium text-text-primary">
                      {txn.description || labelForTransactionType(txn.transaction_type)}
                    </p>
                    <p className="mt-0.5 text-xs text-text-tertiary">
                      {formatShortDate(txn.transaction_date)} · {labelForTransactionType(txn.transaction_type)}
                    </p>
                  </div>
                  <div className="text-right shrink-0 pl-2">
                    <p className="num-mono text-sm font-semibold text-text-primary whitespace-nowrap">
                      {formatIDR(Number(txn.amount))}
                    </p>
                  </div>
                </Link>
              ))}
            </div>

            {/* Desktop: Table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-wood-100 bg-cream-100/50">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-medium text-wood-600">Tanggal</th>
                    <th scope="col" className="px-4 py-3 font-medium text-wood-600">No.</th>
                    <th scope="col" className="px-4 py-3 font-medium text-wood-600">Jenis</th>
                    <th scope="col" className="px-4 py-3 font-medium text-wood-600">Deskripsi</th>
                    <th scope="col" className="px-4 py-3 text-right font-medium text-wood-600">Nominal</th>
                    <th scope="col" className="px-4 py-3 font-medium text-wood-600">Status</th>
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
                          className="font-medium text-wood-700 hover:text-wood-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wood-500 rounded"
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
      {!isPageError && !isInitialLoading && transactions && (page > 0 || transactions.length === limit) && (
        <nav className="flex justify-center gap-2" aria-label="Paginasi transaksi">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
          >
            Sebelumnya
          </Button>
          <span className="px-3 py-1.5 text-sm text-wood-500" aria-current="page">Halaman {page + 1}</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => p + 1)}
            disabled={transactions.length < limit}
          >
            Selanjutnya
          </Button>
        </nav>
      )}
    </div>
  );
}
