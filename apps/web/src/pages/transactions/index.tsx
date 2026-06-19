import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { transaction_status } from "@/lib/database-types";
import { useOrganization, useOrgPermissions } from "@/hooks/useOrganization";
import { formatIDR, formatShortDate } from "@/lib/utils";
import { TransactionListSkeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { Receipt } from "lucide-react";
import { TRANSACTION_TYPE_LABELS } from "@/lib/transactions";

const STATUS_BADGES: Record<string, string> = {
  posted: "bg-leaf-100 text-leaf-700 border-leaf-200",
  voided: "bg-error/10 text-error border-error/30",
  draft: "bg-wood-100 text-wood-700 border-wood-200",
  reversed: "bg-clay-400/10 text-clay-600 border-clay-400/30",
};

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
      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Cari transaksi..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          className="h-10 min-w-64 rounded-md border border-wood-200 bg-cream-50 px-3 text-sm text-wood-900 placeholder:text-wood-400 focus:border-wood-500 focus:outline-none focus:ring-2 focus:ring-wood-500"
        />
        <select
          value={typeFilter}
          onChange={(e) => { setTypeFilter(e.target.value); setPage(0); }}
          className="h-10 appearance-none rounded-md border border-wood-200 bg-cream-50 px-3 pr-8 text-sm text-wood-900 focus:border-wood-500 focus:outline-none focus:ring-2 focus:ring-wood-500"
        >
          <option value="">Semua Jenis</option>
          {Object.entries(TRANSACTION_TYPE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value as transaction_status | ""); setPage(0); }}
          className="h-10 appearance-none rounded-md border border-wood-200 bg-cream-50 px-3 pr-8 text-sm text-wood-900 focus:border-wood-500 focus:outline-none focus:ring-2 focus:ring-wood-500"
        >
          <option value="">Semua Status</option>
          <option value="posted">Posted</option>
          <option value="voided">Dibatalkan</option>
        </select>
      </div>

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
        <div className="overflow-x-auto rounded-lg border border-wood-200 bg-cream-50">
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
                  <td className="whitespace-nowrap px-4 py-3 text-right font-medium tabular-nums text-wood-800">
                    {formatIDR(Number(txn.amount))}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_BADGES[txn.status] || "bg-wood-100 text-wood-700 border-wood-200"}`}>
                      {txn.status === "posted" ? "Posted" : txn.status === "voided" ? "Dibatalkan" : txn.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {transactions && (page > 0 || transactions.length === limit) && (
        <div className="mt-4 flex justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="rounded-md border border-wood-200 bg-cream-50 px-3 py-1.5 text-sm text-wood-700 disabled:opacity-50"
          >
            Sebelumnya
          </button>
          <span className="px-3 py-1.5 text-sm text-wood-500">Halaman {page + 1}</span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={transactions.length < limit}
            className="rounded-md border border-wood-200 bg-cream-50 px-3 py-1.5 text-sm text-wood-700 disabled:opacity-50"
          >
            Selanjutnya
          </button>
        </div>
      )}
    </div>
  );
}
