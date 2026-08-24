import { useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { PullToRefresh } from "@/components/ui/pull-to-refresh";
import { refreshAllData } from "@/lib/query-client";

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
          <Button as={Link} to="/transactions/new" variant="primary">
            Catat transaksi pertama
          </Button>
        ) : undefined} />
    );
  }
  return null;
}
import { queryKeys } from "@/lib/query-keys";
import { useOrganization, useOrgPermissions } from "@/hooks/useOrganization";
import { formatIDR, formatShortDate, localDate } from "@/lib/utils";
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
import { Receipt, Search, Download, Check, X, ArrowRight, Filter } from "reicon-react";
import { PageShell } from "@/components/ui/page-shell";
import { PageToolbar } from "@/components/ui/page-toolbar";
import { Card } from "@/components/ui/card";
import { PageGuide } from "@/components/ui/page-guide";
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

/* ------------------------------------------------------------------ */
/*  Transaction Filter Bar                                              */
/* ------------------------------------------------------------------ */

interface TransactionFilterBarProps {
  readonly search: string;
  readonly setSearch: (v: string) => void;
  readonly fromDate: string;
  readonly setFromDate: (v: string) => void;
  readonly toDate: string;
  readonly setToDate: (v: string) => void;
  readonly typeFilter: string;
  readonly setTypeFilter: (v: string) => void;
  readonly statusFilter: string;
  readonly setStatusFilter: (v: TransactionStatus | "") => void;
  readonly hasSearchQuery: boolean;
  readonly hasDateFilter: boolean;
  readonly hasTypeFilter: boolean;
  readonly hasStatusFilter: boolean;
  readonly onResetSearch: () => void;
  readonly onResetFilters: () => void;
  readonly onResetAll: () => void;
  readonly onClearDates: () => void;
  readonly onClearType: () => void;
  readonly onClearStatus: () => void;
}

function TransactionFilterBar({
  search,
  setSearch,
  fromDate,
  setFromDate,
  toDate,
  setToDate,
  typeFilter,
  setTypeFilter,
  statusFilter,
  setStatusFilter,
  hasSearchQuery,
  hasDateFilter,
  hasTypeFilter,
  hasStatusFilter,
  onResetSearch,
  onResetFilters,
  onResetAll,
  onClearDates,
  onClearType,
  onClearStatus,
}: TransactionFilterBarProps) {
  const hasActiveFilters = hasDateFilter || hasTypeFilter || hasStatusFilter;

  return (
    <PageToolbar
      searchValue={search}
      onSearchChange={setSearch}
      searchPlaceholder="Cari transaksi..."
      searchLabel="Cari transaksi"
      searchInputId="transaction-search"
      onResetSearch={onResetSearch}
      onResetFilters={hasActiveFilters ? onResetFilters : undefined}
      onResetAll={hasSearchQuery && hasActiveFilters ? onResetAll : undefined}
      filters={[
        {
          key: "date",
          label: "Periode",
          active: hasDateFilter,
          span: 6,
          onClear: onClearDates,
          children: (
            <div className="grid grid-cols-2 gap-3">
              <Input label="Dari" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
              <Input label="Sampai" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
            </div>
          ),
        },
        {
          key: "type",
          label: "Jenis",
          active: hasTypeFilter,
          span: 2,
          onClear: onClearType,
          children: (
            <Select
              label="Jenis"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              placeholder="Semua Jenis"
              options={Object.entries(TRANSACTION_LABELS).filter(([k]) => !k.startsWith("opening_") && k !== "simple_adjustment").map(([value, label]) => ({ value, label }))}
            />
          ),
        },
        {
          key: "status",
          label: "Status",
          active: hasStatusFilter,
          span: 2,
          onClear: onClearStatus,
          children: (
            <Select
              label="Status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as TransactionStatus | "")}
              placeholder="Semua Status"
              options={[
                { value: "posted", label: "Posted" },
                { value: "voided", label: "Dibatalkan" },
              ]}
            />
          ),
        },
      ]}
    />
  );
}

export function TransactionListPage() { // NOSONAR typescript:S3776 - complexity 16/15; page-level conditions are inherently complex
  const { data: orgData } = useOrganization();
  const { canCreateTransaction, canCreateExports } = useOrgPermissions();
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get("q") ?? "";
  const typeFilter = searchParams.get("type") ?? "";
  const statusFilter = (searchParams.get("status") ?? "") as TransactionStatus | "";
  const fromDate = searchParams.get("from") ?? localDate(-30);
  const toDate = searchParams.get("to") ?? localDate();
  const page = Number(searchParams.get("page") ?? "0");
  const [exporting, setExporting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const limit = 20;
  const updateParams = (mutate: (next: URLSearchParams) => void) => {
    const next = new URLSearchParams(searchParams);
    mutate(next);
    setSearchParams(next, { replace: true });
  };
  const setSearch = (v: string) => updateParams((n) => { if (v) n.set("q", v); else n.delete("q"); n.set("page", "0"); });
  const setTypeFilter = (v: string) => updateParams((n) => { if (v) n.set("type", v); else n.delete("type"); n.set("page", "0"); });
  const setStatusFilter = (v: TransactionStatus | "") => updateParams((n) => { if (v) n.set("status", v); else n.delete("status"); n.set("page", "0"); });
  const setFromDate = (v: string) => updateParams((n) => { n.set("from", v); n.set("page", "0"); });
  const setToDate = (v: string) => updateParams((n) => { n.set("to", v); n.set("page", "0"); });
  const setPage = (updater: number | ((p: number) => number)) => updateParams((n) => { const nextPage = typeof updater === "function" ? (updater as (p: number) => number)(page) : updater; n.set("page", String(Math.max(0, nextPage))); });

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
  const allPageIds = (transactions ?? []).map((t) => t.id);
  const allSelected = allPageIds.length > 0 && allPageIds.every((id) => selectedIds.has(id));
  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(allPageIds));
  };
  const clearSelection = () => setSelectedIds(new Set());

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
    <PullToRefresh onRefresh={refreshAllData}>
    <PageShell
      header={{
        title: "Transaksi",
        description: isDatasetEmpty
          ? "Mulai mencatat transaksi bisnis Anda"
          : "Lihat dan kelola seluruh transaksi bisnis Anda",
        actions: [
          ...(canExport ? [{ key: "export", children: (
            <>
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
            </>
          ) }] : []),
          ...(canCreateTransaction ? [{ key: "create", children: (
            <Button as={Link} to="/transactions/new" variant="primary">
              Transaksi Baru
            </Button>
          ) }] : []),
        ],
      }}
    >

      {/* Panduan halaman */}
      <PageGuide guideKey="transactions" />

      {/* Search + Filter */}
      <TransactionFilterBar
        search={search}
        setSearch={setSearch}
        fromDate={fromDate}
        setFromDate={setFromDate}
        toDate={toDate}
        setToDate={setToDate}
        typeFilter={typeFilter}
        setTypeFilter={setTypeFilter}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        hasSearchQuery={hasSearchQuery}
        hasDateFilter={hasDateFilter}
        hasTypeFilter={hasTypeFilter}
        hasStatusFilter={hasStatusFilter}
        onResetSearch={resetSearch}
        onResetFilters={resetFilters}
        onResetAll={resetAll}
        onClearDates={() => { setFromDate(DEFAULT_FROM); setToDate(DEFAULT_TO); setPage(0); }}
        onClearType={() => { setTypeFilter(""); setPage(0); }}
        onClearStatus={() => { setStatusFilter(""); setPage(0); }}
      />

      {dateRangeInvalid && (
        <p className="text-sm text-error" role="alert">
          Tanggal awal tidak boleh melewati tanggal akhir.
        </p>
      )}

      {/* Background refresh indicator */}
      {isRefreshing && (
        <div className="flex items-center gap-2 text-xs text-text-tertiary" role="status" aria-live="polite">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-wood-300 border-t-wood-600" />
          <span>Memperbarui...</span>
        </div>
      )}

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-wood-200 bg-wood-50 px-3 py-2 text-sm">
          <span className="font-medium text-wood-700">{selectedIds.size} dipilih</span>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={clearSelection}>Batal</Button>
            <Button type="button" variant="primary" size="sm" onClick={() => toast.success(`${selectedIds.size} void batch - implementasi menyusul`)}>Void Terpilih</Button>
          </div>
        </div>
      )}

      {/* Transaction list */}
      <Card elevated aria-label="Daftar transaksi" role="region">
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
                <div key={txn.id} className="flex items-center gap-2 px-4 py-3 hover:bg-cream-50">
                  <input type="checkbox" checked={selectedIds.has(txn.id)} onChange={() => toggleOne(txn.id)} className="h-4 w-4 rounded border-wood-300 text-wood-600 focus:ring-wood-500" aria-label={`Pilih ${txn.transaction_number}`} />
                  <Link
                    to={`/transactions/${txn.id}`}
                    className="flex flex-1 items-start justify-between gap-3 min-w-0 outline-none active:bg-cream-100 transition-colors min-h-[44px]"
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
                </div>
              ))}
            </div>

            {/* Desktop: Table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-wood-100 bg-cream-100/50">
                  <tr>
                    <th scope="col" className="px-4 py-3"><input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-4 w-4 rounded border-wood-300 text-wood-600" aria-label="Pilih semua" /></th>
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
                      <td className="px-4 py-3"><input type="checkbox" checked={selectedIds.has(txn.id)} onChange={() => toggleOne(txn.id)} className="h-4 w-4 rounded border-wood-300 text-wood-600" aria-label={`Pilih ${txn.transaction_number}`} /></td>
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
      </Card>

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
    </PageShell>
    </PullToRefresh>
  );
}
