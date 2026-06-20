import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { transaction_status } from "@/lib/database-types";
import { useOrganization, useOrgPermissions } from "@/hooks/useOrganization";
import { formatIDR, formatShortDate } from "@/lib/utils";
import { TransactionListSkeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Receipt, Search } from "lucide-react";
import { TRANSACTION_TYPE_LABELS } from "@/lib/transactions";

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

export function TransactionListPage() {
  const { data: orgData } = useOrganization();
  const { canCreateTransaction } = useOrgPermissions();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<transaction_status | "">("");
  const [page, setPage] = useState(0);
  const limit = 20;

  const { data: transactions, isLoading } = useQuery({
    queryKey: ["transactions", orgData?.organization?.id, search, typeFilter, statusFilter, page],
    queryFn: async () => {
      if (!orgData?.organization?.id) return [];
      let query = supabase
        .from("transactions")
        .select("id, transaction_number, transaction_date, transaction_type, amount, description, status, payment_status, created_by")
        .eq("organization_id", orgData.organization.id)
        .is("original_transaction_id", null)
        .not("transaction_type", "like", "opening_%")
        .order("transaction_date", { ascending: false })
        .order("created_at", { ascending: false })
        .range(page * limit, (page + 1) * limit - 1);

      if (search) {
        query = query.or(`description.ilike.%${search}%,transaction_number.ilike.%${search}%`);
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-wood-800">Transaksi</h1>
          <p className="mt-1 text-sm text-wood-500">Daftar transaksi posted dan pembatalan</p>
        </div>
        {canCreateTransaction && (
          <Link
            to="/transactions/new"
            className="inline-flex h-10 items-center justify-center rounded-md bg-wood-500 px-4 text-sm font-medium text-cream-50 transition-colors hover:bg-wood-600"
          >
            Transaksi Baru
          </Link>
        )}
      </div>

      {/* Filters */}
      <div className="grid gap-3 sm:grid-cols-[minmax(16rem,1fr)_12rem_12rem]">
        <Input
          placeholder="Cari transaksi..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          leftIcon={<Search className="h-4 w-4" />}
        />
        <Select
          value={typeFilter}
          onChange={(e) => { setTypeFilter(e.target.value); setPage(0); }}
          placeholder="Semua Jenis"
          options={Object.entries(TRANSACTION_TYPE_LABELS).map(([value, label]) => ({ value, label }))}
        />
        <Select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value as transaction_status | ""); setPage(0); }}
          placeholder="Semua Status"
          options={[
            { value: "posted", label: "Posted" },
            { value: "voided", label: "Dibatalkan" },
          ]}
        />
      </div>

      {(search || typeFilter || statusFilter) && (
        <div className="flex flex-wrap items-center gap-2">
          {search && <Badge variant="neutral">Cari: {search}</Badge>}
          {typeFilter && (
            <Badge variant="info">
              Jenis: {TRANSACTION_TYPE_LABELS[typeFilter as keyof typeof TRANSACTION_TYPE_LABELS] || typeFilter}
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
      {isLoading ? (
        <TransactionListSkeleton />
      ) : !transactions?.length ? (
        <EmptyState
          icon={<Receipt className="h-8 w-8 text-wood-400" />}
          title="Belum ada transaksi"
          description="Mulai catat transaksi bisnis Anda"
          action={canCreateTransaction ? (
            <Link
              to="/transactions/new"
              className="inline-flex h-10 items-center justify-center rounded-md bg-wood-500 px-4 text-sm font-medium text-cream-50 transition-colors hover:bg-wood-600"
            >
              Catat Transaksi Pertama
            </Link>
          ) : undefined}
        />
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
                      <p className="mt-1 truncate text-sm font-medium text-text-primary">{txn.description || "-"}</p>
                      <p className="mt-1 text-xs text-text-tertiary">
                        {formatShortDate(txn.transaction_date)} · {TRANSACTION_TYPE_LABELS[txn.transaction_type as keyof typeof TRANSACTION_TYPE_LABELS] || txn.transaction_type}
                      </p>
                    </div>
                    <Badge variant={statusVariant(txn.status)}>{statusLabel(txn.status)}</Badge>
                  </div>
                  <p className="mt-3 text-right num-mono text-lg font-semibold text-text-primary">{formatIDR(Number(txn.amount))}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="hidden overflow-x-auto rounded-lg border border-wood-200 bg-cream-50 sm:block">
            <table className="w-full text-left text-sm">
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
                  <tr key={txn.id} className="hover:bg-cream-100/60">
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
                      {TRANSACTION_TYPE_LABELS[txn.transaction_type as keyof typeof TRANSACTION_TYPE_LABELS] || txn.transaction_type}
                    </td>
                    <td className="max-w-[200px] truncate px-4 py-3 text-wood-600">
                      {txn.description || "-"}
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

      {/* Pagination */}
      {transactions && (page > 0 || transactions.length === limit) && (
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
