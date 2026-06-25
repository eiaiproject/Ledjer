import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Enums } from "@ledjer/database-types";
type TransactionStatus = Enums<"transaction_status">;
import { useOrganization, useOrgPermissions } from "@/hooks/useOrganization";
import { useFilterPresets } from "@/hooks/useFilterPresets";
import { formatDateInputValue, formatIDR, formatShortDate } from "@/lib/utils";
import { TransactionListSkeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Receipt, Search, Bookmark, BookmarkCheck, X } from "lucide-react";
import {
  ALL_TRANSACTION_TYPE_LABELS,
  GENERAL_TRANSACTION_TYPE_LABELS,
  labelForTransactionType,
} from "@/lib/transactions";

interface Transaction {
  id: string;
  transaction_number: string;
  transaction_date: string;
  transaction_type: string;
  amount: number;
  description: string;
  status: string;
  payment_status: string;
  created_by: string;
  parties?: { name: string };
}

function statusVariant(status: string): "success" | "warning" | "error" | "neutral" {
  if (status === "posted") return "success";
  if (status === "voided") return "error";
  if (status === "reversed") return "warning";
  return "neutral";
}

function statusLabel(status: string) {
  if (status === "posted") return "Posted";
  if (status === "voided") return "Dibatalkan";
  if (status === "reversed") return "Reversal";
  return status;
}

function localDate(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return formatDateInputValue(date);
}

export function TransactionListPage() {
  const { data: orgData } = useOrganization();
  const { canCreateTransaction } = useOrgPermissions();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<TransactionStatus | "">("");
  const [fromDate, setFromDate] = useState(() => localDate(-30));
  const [toDate, setToDate] = useState(() => localDate());
  const [page, setPage] = useState(0);
  const { presets, saving: savingPreset, setSaving: setSavingPreset, name: presetName, setName: setPresetName, save: savePreset, remove: deletePreset, canSave } = useFilterPresets();
  const limit = 20;

  const normalizedSearch = search.trim().replace(/[,%()]/g, " ").replace(/\s+/g, " ");

  const { data: transactions, isLoading, error, refetch } = useQuery({
    queryKey: ["transactions", orgData?.organization?.id, normalizedSearch, typeFilter, statusFilter, fromDate, toDate, page],
    queryFn: async () => {
      if (!orgData?.organization?.id) return [];
      let query = supabase
        .from("transactions")
        .select("id, transaction_number, transaction_date, transaction_type, amount, description, status, payment_status, created_by")
        .eq("organization_id", orgData.organization.id)
        .is("original_transaction_id", null)
        .not("transaction_type", "like", "opening_%")
        .gte("transaction_date", fromDate)
        .lte("transaction_date", toDate)
        .order("transaction_date", { ascending: false })
        .order("created_at", { ascending: false })
        .range(page * limit, (page + 1) * limit - 1);

      if (normalizedSearch) {
        query = query.or(`description.ilike.%${normalizedSearch}%,transaction_number.ilike.%${normalizedSearch}%`);
      }
      if (typeFilter) {
        query = query.eq("transaction_type", typeFilter);
      }
      if (statusFilter) {
        query = query.eq("status", statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as Transaction[];
    },
    enabled: !!orgData?.organization?.id,
  });

  /* ── Preset handlers ── */

  const hasActiveFilters = Boolean(typeFilter || statusFilter);

  const handleSavePreset = () => {
    savePreset({ typeFilter, statusFilter, fromDate, toDate });
  };

  const applyPreset = (preset: { typeFilter: string; statusFilter: string; fromDate: string; toDate: string }) => {
    setTypeFilter(preset.typeFilter);
    setStatusFilter(preset.statusFilter as TransactionStatus | "");
    setFromDate(preset.fromDate);
    setToDate(preset.toDate);
    setPage(0);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Transaksi</h1>
          <p className="mt-1 text-sm text-text-secondary">Daftar transaksi posted dan pembatalan</p>
        </div>
        {canCreateTransaction && (
          <Link
            to="/transactions/new"
            className="ledger-pressable inline-flex min-h-[44px] h-10 items-center justify-center rounded-md bg-wood-500 px-4 text-sm font-medium text-cream-50 transition-[background-color,transform] duration-150 ease-out hover:bg-wood-600 sm:min-h-0"
          >
            Transaksi Baru
          </Link>
        )}
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
              options={Object.entries(GENERAL_TRANSACTION_TYPE_LABELS).map(([value, label]) => ({ value, label }))}
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

      {(search || typeFilter || statusFilter) && (
        <div className="flex flex-wrap items-center gap-2">
          {search && <Badge variant="neutral">Cari: {search}</Badge>}
          {typeFilter && (
            <Badge variant="info">
              Jenis: {ALL_TRANSACTION_TYPE_LABELS[typeFilter as keyof typeof ALL_TRANSACTION_TYPE_LABELS] || typeFilter}
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

      {/* Saved filter presets */}
      <div className="flex flex-wrap items-center gap-2">
        {presets.map((preset) => (
          <div key={preset.id} className="flex items-center gap-1">
            <Button
              type="button"
              variant="secondary"
              size="xs"
              onClick={() => applyPreset(preset)}
              className="gap-1"
            >
              <BookmarkCheck className="h-3 w-3" />
              {preset.name}
            </Button>
            <button
              type="button"
              onClick={() => deletePreset(preset.id)}
              className="inline-flex h-7 w-7 min-h-[28px] min-w-[28px] items-center justify-center rounded-md text-wood-400 hover:text-error hover:bg-error/10 sm:min-h-0 sm:min-w-0"
              aria-label={`Hapus preset ${preset.name}`}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        {savingPreset ? (
          <div className="flex items-center gap-1.5">
            <Input
              aria-label="Nama preset filter"
              placeholder="Nama preset..."
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSavePreset();
                if (e.key === "Escape") setSavingPreset(false);
              }}
              className="h-8 w-40 min-h-0 text-xs"
              containerClassName="!mt-0"
              autoFocus
            />
            <Button type="button" size="xs" onClick={handleSavePreset} disabled={!presetName.trim()}>
              Simpan
            </Button>
            <Button type="button" size="xs" variant="ghost" onClick={() => setSavingPreset(false)}>
              Batal
            </Button>
          </div>
        ) : (
          hasActiveFilters && canSave && (
            <Button
              type="button"
              variant="link"
              size="xs"
              onClick={() => setSavingPreset(true)}
              className="gap-1"
            >
              <Bookmark className="h-3 w-3" />
              Simpan filter ini
            </Button>
          )
        )}
      </div>

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
          <div className="space-y-3 sm:hidden">
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

          <div className="hidden overflow-x-auto rounded-lg border border-wood-200 bg-cream-50 sm:block">
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
