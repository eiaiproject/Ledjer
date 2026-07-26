import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { listRecurringTransactions, updateRecurringStatus, type RecurringOutput, type RecurringStatus } from "@/lib/api/recurring-transactions";
import { useOrganization } from "@/hooks/useOrganization";
import { queryKeys } from "@/lib/query-keys";
import { EmptyState } from "@/components/ui/empty-state";
import { Repeat, Plus, Play, Pause, FastForward } from "reicon-react";

const FREQ_LABELS: Record<string, string> = {
  daily: "Harian",
  weekly: "Mingguan",
  monthly: "Bulanan",
  yearly: "Tahunan",
  custom_days: "Kustom",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Aktif",
  paused: "Ditunda",
  completed: "Selesai",
  cancelled: "Dibatalkan",
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-leaf-100 text-leaf-700",
  paused: "bg-amber-100 text-amber-700",
  completed: "bg-blue-100 text-blue-700",
  cancelled: "bg-red-100 text-red-700",
};

const TYPE_LABELS: Record<string, string> = {
  cash_sale: "Penjualan Tunai",
  credit_sale: "Penjualan Kredit",
  receive_receivable: "Penerimaan Piutang",
  cash_purchase: "Pembelian Tunai",
  credit_purchase: "Pembelian Kredit",
  pay_payable: "Pembayaran Utang",
  expense_payment: "Pembayaran Beban",
  owner_capital: "Setoran Modal",
  owner_draw: "Prive Pemilik",
  cash_transfer: "Transfer Kas",
};

function formatRupiah(n: number): string {
  return `Rp ${(n / 100).toLocaleString("id-ID")}`;
}

const STATUS_FILTERS: { value: RecurringStatus | ""; label: string }[] = [
  { value: "", label: "Semua" },
  { value: "active", label: "Aktif" },
  { value: "paused", label: "Ditunda" },
  { value: "completed", label: "Selesai" },
  { value: "cancelled", label: "Dibatalkan" },
];

export function RecurringTransactionsPage() {
  const navigate = useNavigate();
  const { data: orgData } = useOrganization();
  const orgId = orgData?.organization?.id;
  const [statusFilter, setStatusFilter] = useState<RecurringStatus | "">("active");

  const { data, isLoading, error } = useQuery({
    queryKey: [...queryKeys.recurringTransactions.list(statusFilter || undefined), orgId],
    queryFn: () => listRecurringTransactions(statusFilter || undefined),
    enabled: !!orgId,
  });

  const items = data ?? [];
  let content;
  if (isLoading) {
    content = (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-xl bg-wood-100" />
        ))}
      </div>
    );
  } else if (error) {
    content = (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-sm text-red-600">Gagal memuat data. Silakan coba lagi.</p>
      </div>
    );
  } else if (items.length === 0) {
    content = (
      <EmptyState
        icon={<Repeat className="h-8 w-8" />}
        title="Belum ada transaksi berulang"
        description="Buat transaksi otomatis untuk sewa, langganan, gaji, cicilan, dan pengeluaran rutin lainnya."
        action={{ label: "Buat Baru", onClick: () => navigate("/recurring-transactions/new") }}
      />
    );
  } else {
    content = (
      <div className="space-y-2">
        {items.map((item) => (
          <RecurringCard key={item.id} item={item} />
        ))}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Transaksi Berulang</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Atur transaksi otomatis: sewa, langganan, gaji, dan lainnya
          </p>
        </div>
        <Link
          to="/recurring-transactions/new"
          className="inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-white transition-all hover:bg-ink/90 focus:outline-none focus:ring-2 focus:ring-ink/30"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Buat Baru
        </Link>
      </div>

      {/* Status filter */}
      <div className="flex flex-wrap gap-1.5">
        {STATUS_FILTERS.map((f) => (
          <button type="button"
            key={f.value}
            onClick={() => setStatusFilter(f.value)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
              (f.value === "" && !statusFilter) || statusFilter === f.value
                ? "bg-ink text-white"
                : "bg-wood-100 text-wood-700 hover:bg-wood-200"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {content}
    </div>
  );
}

function RecurringCard({ item }: { readonly item: RecurringOutput }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const statusMutation = useMutation({
    mutationFn: (status: RecurringStatus) => updateRecurringStatus(item.id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.recurringTransactions.all() });
    },
  });

  const nextDate = item.nextExecutionDate
    ? new Date(item.nextExecutionDate + "T00:00:00+07:00").toLocaleDateString("id-ID", {
        day: "numeric", month: "short", year: "numeric",
      })
    : "-";

  return (
    <div
      tabIndex={0}
      className="block cursor-pointer rounded-xl border border-wood-200 bg-surface p-4 shadow-sm transition-all hover:border-wood-300 hover:shadow-md"
      onClick={() => navigate(`/recurring-transactions/${item.id}`)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); navigate(`/recurring-transactions/${item.id}`); } }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-text-primary">{item.name}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                STATUS_COLORS[item.status] ?? "bg-wood-100 text-wood-600"
              }`}
            >
              {STATUS_LABELS[item.status] ?? item.status}
            </span>
            {item.skipNext && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                Dilewati
              </span>
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-wood-500">
            <span>{TYPE_LABELS[item.transactionType] ?? item.transactionType}</span>
            <span>{FREQ_LABELS[item.frequency] ?? item.frequency}</span>
            <span>Eksekusi: {item.executionCount}x</span>
            <span>Berikutnya: {nextDate}</span>
          </div>
          {item.description && (
            <p className="mt-1 text-xs text-text-secondary line-clamp-1">{item.description}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className="text-sm font-semibold text-text-primary whitespace-nowrap">
            {formatRupiah(item.amountMinor)}
          </span>
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            {item.status === "active" && (
              <>
                <button type="button"
                  onClick={() => statusMutation.mutate("paused")}
                  disabled={statusMutation.isPending}
                  className="flex h-7 w-7 items-center justify-center rounded text-wood-400 hover:bg-wood-100 hover:text-amber-600"
                  title="Jeda"
                >
                  <Pause className="h-3.5 w-3.5" />
                </button>
                <Link
                  to={`/recurring-transactions/${item.id}/skip`}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm(`Lewati eksekusi berikutnya untuk "${item.name}"?`)) {
                      // handled via skip endpoint
                    }
                  }}
                  className="flex h-7 w-7 items-center justify-center rounded text-wood-400 hover:bg-wood-100 hover:text-amber-600"
                  title="Lewati"
                >
                  <FastForward className="h-3.5 w-3.5" />
                </Link>
              </>
            )}
            {item.status === "paused" && (
              <button type="button"
                onClick={() => statusMutation.mutate("active")}
                disabled={statusMutation.isPending}
                className="flex h-7 w-7 items-center justify-center rounded text-wood-400 hover:bg-wood-100 hover:text-leaf-600"
                title="Aktifkan"
              >
                <Play className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
