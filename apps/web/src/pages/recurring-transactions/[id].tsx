import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, Link } from "react-router-dom";
import {
  getRecurringTransaction,
  getExecutionLog,
  updateRecurringStatus,
  skipNextOccurrence,
  executeRecurringTransaction,
  type RecurringStatus,
} from "@/lib/api/recurring-transactions";

import { queryKeys } from "@/lib/query-keys";
import { ArrowLeft, Play, Pause, Clock, Loader, CheckCircle, XCircle, AlertTriangle, FastForward } from "reicon-react";

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
  cash_sale: "Penjualan Tunai", credit_sale: "Penjualan Kredit",
  receive_receivable: "Penerimaan Piutang",
  cash_purchase: "Pembelian Tunai", credit_purchase: "Pembelian Kredit",
  pay_payable: "Pembayaran Utang", expense_payment: "Pembayaran Beban",
  owner_capital: "Setoran Modal", owner_draw: "Prive Pemilik",
  cash_transfer: "Transfer Kas",
};

const EXEC_STATUS_ICONS: Record<string, React.ReactNode> = {
  success: <CheckCircle className="h-4 w-4 text-leaf-600" />,
  failed: <XCircle className="h-4 w-4 text-red-600" />,
  skipped: <FastForward className="h-4 w-4 text-amber-600" />,
};

const EXEC_STATUS_LABELS: Record<string, string> = {
  success: "Berhasil",
  failed: "Gagal",
  skipped: "Dilewati",
};

function formatRupiah(n: number): string {
  return `Rp ${(n / 100).toLocaleString("id-ID")}`;
}

export function RecurringTransactionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: item, isLoading, error } = useQuery({
    queryKey: queryKeys.recurringTransactions.detail(id!),
    queryFn: () => getRecurringTransaction(id!),
    enabled: !!id,
  });

  const { data: logs } = useQuery({
    queryKey: queryKeys.recurringTransactions.logs(id!),
    queryFn: () => getExecutionLog(id!),
    enabled: !!id,
  });

  const statusMutation = useMutation({
    mutationFn: (status: RecurringStatus) => updateRecurringStatus(id!, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.recurringTransactions.all() });
    },
  });

  const skipMutation = useMutation({
    mutationFn: () => skipNextOccurrence(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.recurringTransactions.all() });
    },
  });

  const executeMutation = useMutation({
    mutationFn: () => executeRecurringTransaction(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.recurringTransactions.all() });
    },
  });

  if (isLoading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <Loader className="h-6 w-6 animate-spin text-wood-400" />
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <AlertTriangle className="mx-auto mb-2 h-6 w-6 text-red-500" />
          <p className="text-sm font-medium text-red-600">Transaksi berulang tidak ditemukan</p>
          <button onClick={() => navigate("/recurring-transactions")} className="mt-3 text-sm text-red-600 underline">
            Kembali ke daftar
          </button>
        </div>
      </div>
    );
  }

  const nextDate = item.nextExecutionDate
    ? new Date(item.nextExecutionDate + "T00:00:00+07:00").toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })
    : "Selesai";

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6 lg:p-8">
      <button
        onClick={() => navigate("/recurring-transactions")}
        className="inline-flex items-center gap-1.5 text-sm text-wood-600 transition-colors hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" />
        Kembali
      </button>

      {/* Header Card */}
      <div className="rounded-xl border border-wood-200 bg-surface p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-text-primary">{item.name}</h1>
              <span className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_COLORS[item.status] ?? ""}`}>
                {STATUS_LABELS[item.status] ?? item.status}
              </span>
              {item.skipNext && (
                <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700">
                  Eksekusi berikutnya dilewati
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-text-secondary">
              {TYPE_LABELS[item.transactionType] ?? item.transactionType}
            </p>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2">
            {item.status === "active" && (
              <>
                <button
                  onClick={() => statusMutation.mutate("paused")}
                  disabled={statusMutation.isPending}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 px-3 py-2 text-xs font-medium text-amber-700 transition-all hover:bg-amber-50"
                >
                  <Pause className="h-3.5 w-3.5" />
                  Jeda
                </button>
                <button
                  onClick={() => skipMutation.mutate()}
                  disabled={skipMutation.isPending}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-wood-200 px-3 py-2 text-xs font-medium text-wood-700 transition-all hover:bg-wood-50"
                >
                  <FastForward className="h-3.5 w-3.5" />
                  Lewati
                </button>
                <button
                  onClick={() => {
                    if (window.confirm(`Jalankan "${item.name}" secara manual?`)) {
                      executeMutation.mutate();
                    }
                  }}
                  disabled={executeMutation.isPending}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-leaf-600 px-3 py-2 text-xs font-medium text-white transition-all hover:bg-leaf-700"
                >
                  <Play className="h-3.5 w-3.5" />
                  Jalankan Manual
                </button>
              </>
            )}
            {item.status === "paused" && (
              <button
                onClick={() => statusMutation.mutate("active")}
                disabled={statusMutation.isPending}
                className="inline-flex items-center gap-1.5 rounded-lg bg-ink px-3 py-2 text-xs font-medium text-white transition-all hover:bg-ink/90"
              >
                <Play className="h-3.5 w-3.5" />
                Aktifkan
              </button>
            )}
            {item.status === "completed" && (
              <button
                onClick={() => statusMutation.mutate("active")}
                disabled={statusMutation.isPending}
                className="inline-flex items-center gap-1.5 rounded-lg bg-ink px-3 py-2 text-xs font-medium text-white transition-all hover:bg-ink/90"
              >
                <Play className="h-3.5 w-3.5" />
                Aktifkan Ulang
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Details Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <DetailCard label="Jumlah" value={formatRupiah(item.amountMinor)} />
        <DetailCard label="Frekuensi" value={`${FREQ_LABELS[item.frequency] ?? item.frequency} (setiap ${item.intervalValue})`} />
        <DetailCard
          label="Jadwal"
          value={
            item.frequency === "weekly" && item.dayOfWeek !== null
              ? ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"][item.dayOfWeek]
              : item.frequency === "monthly" && item.dayOfMonth !== null
              ? `Tanggal ${item.dayOfMonth}`
              : item.frequency === "yearly" && item.monthOfYear !== null && item.dayOfMonth !== null
              ? `${["", "Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"][item.monthOfYear]} ${item.dayOfMonth}`
              : "-"
          }
        />
        <DetailCard label="Mulai" value={item.startDate} />
        <DetailCard label="Berakhir" value={item.endDate ?? "Tidak ada batas"} />
        <DetailCard label="Eksekusi" value={`${item.executionCount}x`} />
        <DetailCard
          label="Berikutnya"
          value={nextDate}
          highlight={item.status === "active"}
        />
        <DetailCard label="Posting" value={item.postAsDraft ? "Sebagai Draft" : "Langsung Diposting"} />
        <DetailCard label="Terakhir" value={item.lastExecutedAt ? new Date(item.lastExecutedAt).toLocaleDateString("id-ID") : "Belum pernah"} />
      </div>

      {/* Description */}
      {item.description && (
        <div className="rounded-xl border border-wood-200 bg-surface p-4">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-wood-500">Deskripsi</h3>
          <p className="text-sm text-text-primary">{item.description}</p>
        </div>
      )}

      {/* Execution Log */}
      <div className="rounded-xl border border-wood-200 bg-surface shadow-sm">
        <div className="border-b border-wood-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-text-primary">
            Riwayat Eksekusi
            {logs && logs.length > 0 && (
              <span className="ml-2 text-xs font-normal text-wood-400">({logs.length} entries)</span>
            )}
          </h2>
        </div>
        {(!logs || logs.length === 0) ? (
          <div className="flex flex-col items-center gap-2 py-8 text-wood-400">
            <Clock className="h-6 w-6" />
            <p className="text-xs">Belum ada riwayat eksekusi</p>
          </div>
        ) : (
          <div className="divide-y divide-wood-100">
            {logs.map((log) => (
              <div key={log.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                {EXEC_STATUS_ICONS[log.status] ?? <Clock className="h-4 w-4 text-wood-400" />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-text-primary">
                      {EXEC_STATUS_LABELS[log.status] ?? log.status}
                    </span>
                    <span className="text-xs text-wood-500">{log.scheduledDate}</span>
                  </div>
                  {log.errorMessage && (
                    <p className="mt-0.5 text-xs text-red-500 truncate">{log.errorMessage}</p>
                  )}
                </div>
                <span className="text-xs text-wood-400 whitespace-nowrap">
                  {new Date(log.executedAt).toLocaleTimeString("id-ID")}
                </span>
                {log.transactionId && (
                  <Link
                    to={`/transactions/${log.transactionId}`}
                    className="text-xs font-medium text-ink underline hover:text-ink/70"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Lihat
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DetailCard({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${highlight ? "border-leaf-200 bg-leaf-50/50" : "border-wood-200 bg-surface"}`}>
      <p className="text-xs font-medium uppercase tracking-wider text-wood-500">{label}</p>
      <p className={`mt-1 text-sm font-semibold ${highlight ? "text-leaf-700" : "text-text-primary"}`}>{value}</p>
    </div>
  );
}
