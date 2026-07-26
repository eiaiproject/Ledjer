import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  createRecurringTransaction,
  type TransactionType,
  type Frequency,
  type CreateRecurringInput,
} from "@/lib/api/recurring-transactions";
import { queryClient } from "@/lib/query-client";
import { ArrowLeft, Loader } from "reicon-react";

const TRANSACTION_TYPES: { value: TransactionType; label: string }[] = [
  { value: "cash_sale", label: "Penjualan Tunai" },
  { value: "credit_sale", label: "Penjualan Kredit" },
  { value: "cash_purchase", label: "Pembelian Tunai" },
  { value: "credit_purchase", label: "Pembelian Kredit" },
  { value: "expense_payment", label: "Pembayaran Beban" },
  { value: "cash_transfer", label: "Transfer Kas" },
  { value: "owner_capital", label: "Setoran Modal" },
  { value: "owner_draw", label: "Prive Pemilik" },
  { value: "receive_receivable", label: "Penerimaan Piutang" },
  { value: "pay_payable", label: "Pembayaran Utang" },
];

const FREQUENCIES: { value: Frequency; label: string; hasDayOfMonth?: boolean; hasDayOfWeek?: boolean; hasMonthOfYear?: boolean }[] = [
  { value: "daily", label: "Setiap Hari" },
  { value: "weekly", label: "Setiap Minggu", hasDayOfWeek: true },
  { value: "monthly", label: "Setiap Bulan", hasDayOfMonth: true },
  { value: "yearly", label: "Setiap Tahun", hasDayOfMonth: true, hasMonthOfYear: true },
  { value: "custom_days", label: "Kustom (hari)" },
];

const DAY_NAMES = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const MONTH_NAMES = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

export function NewRecurringTransactionPage() {
  const navigate = useNavigate();
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [transactionType, setTransactionType] = useState<TransactionType>("expense_payment");
  const [amount, setAmount] = useState("");
  const [frequency, setFrequency] = useState<Frequency>("monthly");
  const [intervalValue, setIntervalValue] = useState(1);
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [monthOfYear, setMonthOfYear] = useState(1);
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState("");
  const [description, setDescription] = useState("");
  const [partyId, setPartyId] = useState("");
  const [cashAccountId, setCashAccountId] = useState("");
  const [notes, _setNotes] = useState("");  // NOSONAR typescript:S6754
  const mutation = useMutation({
    mutationFn: (input: CreateRecurringInput) => createRecurringTransaction(input),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["recurring-transactions"] });
      navigate(`/recurring-transactions/${result.id}`);
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!name.trim()) { setError("Nama wajib diisi"); return; }
    const amountMinor = Math.round(Number.parseFloat(amount || "0") * 100);
    if (amountMinor <= 0) { setError("Jumlah harus lebih dari 0"); return; }

    mutation.mutate({
      name: name.trim(),
      transactionType,
      frequency,
      intervalValue,
      dayOfMonth: frequency === "monthly" || frequency === "yearly" ? dayOfMonth : undefined,
      dayOfWeek: frequency === "weekly" ? dayOfWeek : undefined,
      monthOfYear: frequency === "yearly" ? monthOfYear : undefined,
      amountMinor,
      partyId: partyId || undefined,
      cashAccountId: cashAccountId || undefined,
      description: description || undefined,
      notes: notes || undefined,
      startDate,
      endDate: endDate || undefined,
    });
  };

  const selectedFreq = FREQUENCIES.find((f) => f.value === frequency);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6 lg:p-8">
      <button type="button"
        onClick={() => navigate("/recurring-transactions")}
        className="inline-flex items-center gap-1.5 text-sm text-wood-600 transition-colors hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Kembali
      </button>

      <h1 className="text-2xl font-bold text-text-primary">Transaksi Berulang Baru</h1>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Name & Type */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="name" className="mb-1 block text-sm font-medium text-text-primary">
              Nama <span className="text-red-500">*</span>
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Sewa Kantor, Langganan Internet, dll."
              required
              className="w-full rounded-lg border border-wood-200 bg-surface px-3 py-2.5 text-sm placeholder:text-wood-400 focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink/20"
            />
          </div>
          <div>
            <label htmlFor="transactionType" className="mb-1 block text-sm font-medium text-text-primary">
              Tipe Transaksi <span className="text-red-500">*</span>
            </label>
            <select
              id="transactionType"
              value={transactionType}
              onChange={(e) => setTransactionType(e.target.value as TransactionType)}
              className="w-full rounded-lg border border-wood-200 bg-surface px-3 py-2.5 text-sm focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink/20"
            >
              {TRANSACTION_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Amount & Frequency */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="amount" className="mb-1 block text-sm font-medium text-text-primary">
              Jumlah (Rp) <span className="text-red-500">*</span>
            </label>
            <input
              id="amount"
              type="number"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="500000"
              required
              className="w-full rounded-lg border border-wood-200 bg-surface px-3 py-2.5 text-sm placeholder:text-wood-400 focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink/20"
            />
          </div>
          <div>
            <label htmlFor="frequency" className="mb-1 block text-sm font-medium text-text-primary">
              Frekuensi <span className="text-red-500">*</span>
            </label>
            <select
              id="frequency"
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as Frequency)}
              className="w-full rounded-lg border border-wood-200 bg-surface px-3 py-2.5 text-sm focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink/20"
            >
              {FREQUENCIES.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Interval & Schedule */}
        <div className="rounded-lg border border-wood-200 bg-wood-50 p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-wood-500">Jadwal</h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="intervalValue" className="mb-1 block text-xs font-medium text-text-primary">Setiap</label>
              <div className="flex items-center gap-2">
                <input
                  id="intervalValue"
                  type="number"
                  min="1"
                  max="365"
                  value={intervalValue}
                  onChange={(e) => setIntervalValue(Number.parseInt(e.target.value) || 1)}
                  className="w-20 rounded-lg border border-wood-200 bg-surface px-3 py-2 text-sm focus:border-ink focus:outline-none"
                />
                <span className="text-xs text-wood-500">
                  {frequency === "daily" ? "hari" : frequency === "weekly" ? "minggu" : frequency === "monthly" ? "bulan" : frequency === "yearly" ? "tahun" : "hari"}
                </span>
              </div>
            </div>

            {selectedFreq?.hasDayOfWeek && (
              <div>
                <label htmlFor="dayOfWeek" className="mb-1 block text-xs font-medium text-text-primary">Hari</label>
                <select
                  id="dayOfWeek"
                  value={dayOfWeek}
                  onChange={(e) => setDayOfWeek(Number.parseInt(e.target.value))}
                  className="w-full rounded-lg border border-wood-200 bg-surface px-3 py-2 text-sm focus:border-ink focus:outline-none"
                >
                  {DAY_NAMES.map((name, i) => (
                    <option key={i} value={i}>{name}</option>
                  ))}
                </select>
              </div>
            )}

            {selectedFreq?.hasDayOfMonth && !selectedFreq?.hasMonthOfYear && (
              <div>
                <label htmlFor="dayOfMonth" className="mb-1 block text-xs font-medium text-text-primary">Tanggal</label>
                <select
                  id="dayOfMonth"
                  value={dayOfMonth}
                  onChange={(e) => setDayOfMonth(Number.parseInt(e.target.value))}
                  className="w-full rounded-lg border border-wood-200 bg-surface px-3 py-2 text-sm focus:border-ink focus:outline-none"
                >
                  {Array.from({ length: 31 }, (_, i) => (
                    <option key={i + 1} value={i + 1}>{i + 1}</option>
                  ))}
                </select>
              </div>
            )}

            {selectedFreq?.hasMonthOfYear && (
              <>
                <div>
                  <label htmlFor="monthOfYear" className="mb-1 block text-xs font-medium text-text-primary">Bulan</label>
                  <select
                    id="monthOfYear"
                    value={monthOfYear}
                    onChange={(e) => setMonthOfYear(Number.parseInt(e.target.value))}
                    className="w-full rounded-lg border border-wood-200 bg-surface px-3 py-2 text-sm focus:border-ink focus:outline-none"
                  >
                    {MONTH_NAMES.map((name, i) => (
                      <option key={i + 1} value={i + 1}>{name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-text-primary">Tanggal</label>
                  <select
                    value={dayOfMonth}
                    onChange={(e) => setDayOfMonth(Number.parseInt(e.target.value))}
                    className="w-full rounded-lg border border-wood-200 bg-surface px-3 py-2 text-sm focus:border-ink focus:outline-none"
                  >
                    {Array.from({ length: 31 }, (_, i) => (
                      <option key={i + 1} value={i + 1}>{i + 1}</option>
                    ))}
                  </select>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Start & End Dates */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="startDate" className="mb-1 block text-sm font-medium text-text-primary">
              Mulai <span className="text-red-500">*</span>
            </label>
            <input
              id="startDate"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
              className="w-full rounded-lg border border-wood-200 bg-surface px-3 py-2.5 text-sm focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink/20"
            />
          </div>
          <div>
            <label htmlFor="endDate" className="mb-1 block text-sm font-medium text-text-primary">
              Berakhir (opsional)
            </label>
            <input
              id="endDate"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-lg border border-wood-200 bg-surface px-3 py-2.5 text-sm focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink/20"
            />
            <p className="mt-1 text-[10px] text-wood-400">Kosongkan jika tidak ada batas akhir</p>
          </div>
        </div>

        {/* Optional fields */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="partyId" className="mb-1 block text-sm font-medium text-text-primary">ID Pihak</label>
            <input
              id="partyId"
              type="text"
              value={partyId}
              onChange={(e) => setPartyId(e.target.value)}
              placeholder="ID pelanggan/pemasok"
              className="w-full rounded-lg border border-wood-200 bg-surface px-3 py-2.5 text-sm placeholder:text-wood-400 focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink/20"
            />
          </div>
          <div>
            <label htmlFor="cashAccountId" className="mb-1 block text-sm font-medium text-text-primary">ID Akun Kas</label>
            <input
              id="cashAccountId"
              type="text"
              value={cashAccountId}
              onChange={(e) => setCashAccountId(e.target.value)}
              placeholder="ID akun kas/bank"
              className="w-full rounded-lg border border-wood-200 bg-surface px-3 py-2.5 text-sm placeholder:text-wood-400 focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink/20"
            />
          </div>
        </div>

        {/* Description */}
        <div>
          <label htmlFor="description" className="mb-1 block text-sm font-medium text-text-primary">Deskripsi</label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            placeholder="Deskripsi transaksi..."
            className="w-full rounded-lg border border-wood-200 bg-surface px-3 py-2.5 text-sm placeholder:text-wood-400 focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink/20"
          />
        </div>

        {/* Submit */}
        <div className="flex items-center gap-3 border-t border-wood-200 pt-4">
          <button
            type="submit"
            disabled={mutation.isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-ink px-6 py-2.5 text-sm font-medium text-white transition-all hover:bg-ink/90 focus:outline-none focus:ring-2 focus:ring-ink/30 disabled:opacity-50"
          >
            {mutation.isPending ? <Loader className="h-4 w-4 animate-spin" /> : null}
            {mutation.isPending ? "Menyimpan..." : "Simpan"}
          </button>
          <button
            type="button"
            onClick={() => navigate("/recurring-transactions")}
            className="rounded-lg px-4 py-2.5 text-sm font-medium text-wood-600 transition-colors hover:bg-wood-50"
          >
            Batal
          </button>
        </div>
      </form>
    </div>
  );
}
