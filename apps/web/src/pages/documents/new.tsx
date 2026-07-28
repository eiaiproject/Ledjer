import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  createDocument,
  
  type DocumentType,
  type DocumentLine,
  type CreateDocumentInput,
} from "@/lib/api/documents";
import { queryClient } from "@/lib/query-client";
import { Plus, Trash2, ArrowLeft, Loader } from "reicon-react";

const DOCUMENT_TYPES: { value: DocumentType; label: string; description: string }[] = [
  { value: "quotation", label: "Penawaran Harga", description: "Dokumen penawaran untuk pelanggan" },
  { value: "purchase_order", label: "Pesanan Pembelian", description: "Pesanan barang ke pemasok" },
  { value: "delivery_note", label: "Surat Jalan", description: "Catatan pengiriman atau penerimaan barang" },
  { value: "payment_receipt", label: "Tanda Terima Pembayaran", description: "Bukti penerimaan pembayaran" },
  { value: "cash_receipt", label: "Bukti Kas Masuk", description: "Penerimaan kas tunai" },
  { value: "cash_payment_voucher", label: "Bukti Kas Keluar", description: "Pengeluaran kas tunai" },
  { value: "return_note", label: "Nota Retur", description: "Pengembalian barang" },
];

function emptyLine(): DocumentLine {
  return { description: "", quantityMilli: 1000, unitPriceMinor: 0, amountMinor: 0 };
}

export function NewDocumentPage() {
  const navigate = useNavigate();

  const [type, setType] = useState<DocumentType | null>(null);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [partyId, setPartyId] = useState("");
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [paymentRef, setPaymentRef] = useState("");
  const [lines, setLines] = useState<DocumentLine[]>([emptyLine()]);
  const [error, setError] = useState("");

  const mutation = useMutation({
    mutationFn: (input: CreateDocumentInput) => createDocument(input),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      navigate(`/documents/${result.id}`);
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  const updateLine = (index: number, field: keyof DocumentLine, value: string | number) => {
    setLines((prev) => {
      const next = prev.map((l, i) => (i !== index ? l : { ...l, [field]: value }));
      // Recalculate amount when quantity or price changes
      if (field === "quantityMilli" || field === "unitPriceMinor") {
        const l = next[index];
        l.amountMinor = Math.round((l.quantityMilli / 1000) * l.unitPriceMinor);
      }
      return next;
    });
  };

  const addLine = () => setLines((prev) => [...prev, emptyLine()]);
  const removeLine = (index: number) => {
    if (lines.length <= 1) return;
    setLines((prev) => prev.filter((_, i) => i !== index));
  };

  const subtotal = lines.reduce((s, l) => s + l.amountMinor, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!type) {
      setError("Pilih jenis dokumen terlebih dahulu");
      return;
    }
    if (lines.every((l) => !l.description.trim())) {
      setError("Setidaknya satu item dengan deskripsi diperlukan");
      return;
    }

    mutation.mutate({
      documentType: type,
      documentDate: date,
      partyId: partyId || undefined,
      lines: lines.filter((l) => l.description.trim()),
      notes: notes || undefined,
      terms: terms || undefined,
      deliveryDate: deliveryDate || undefined,
      paymentMethod: paymentMethod || undefined,
      paymentReference: paymentRef || undefined,
    });
  };

  const showDeliveryField = type === "purchase_order" || type === "delivery_note";
  const showPaymentFields = type === "payment_receipt" || type === "cash_receipt" || type === "cash_payment_voucher";

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6 lg:p-8">
      {/* Back */}
      <button type="button"
        onClick={() => navigate("/documents")}
        className="inline-flex items-center gap-1.5 text-sm text-wood-600 transition-colors hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Kembali ke Dokumen
      </button>

      <h1 className="text-2xl font-bold text-text-primary">Buat Dokumen Baru</h1>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Document Type Selection */}
        {!type ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {DOCUMENT_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setType(t.value)}
                className="group rounded-xl border border-wood-200 bg-surface p-4 text-left shadow-sm transition-all hover:border-ink hover:shadow-md"
              >
                <div className="mb-1 text-sm font-semibold text-text-primary group-hover:text-ink">
                  {t.label}
                </div>
                <p className="text-xs text-text-secondary">{t.description}</p>
              </button>
            ))}
          </div>
        ) : (
          <>
            {/* Selected Type + Change */}
            <div className="flex items-center gap-2 rounded-lg bg-wood-50 p-3">
              <span className="text-sm font-medium text-text-primary">
                {DOCUMENT_TYPES.find((t) => t.value === type)?.label}
              </span>
              <button                 type="button"
                onClick={() => setType(null)}
                className="ml-auto text-xs text-wood-500 underline hover:text-ink"
              >
                Ubah jenis
              </button>
            </div>

            {/* Date & Party */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="docDate" className="mb-1 block text-sm font-medium text-text-primary">
                  Tanggal <span className="text-red-500">*</span>
                </label>
                <input
                  id="docDate"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                  className="w-full rounded-lg border border-wood-200 bg-surface px-3 py-2.5 text-sm focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink/20"
                />
              </div>
              <div>
                <label htmlFor="docParty" className="mb-1 block text-sm font-medium text-text-primary">
                  {type === "purchase_order" ? "Pemasok" : "Pelanggan"}
                </label>
                <input
                  id="docParty"
                  type="text"
                  value={partyId}
                  onChange={(e) => setPartyId(e.target.value)}
                  placeholder="ID pihak (atau ketik manual)"
                  className="w-full rounded-lg border border-wood-200 bg-surface px-3 py-2.5 text-sm placeholder:text-wood-500 focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink/20"
                />
              </div>
            </div>

            {showDeliveryField && (
              <div>
                <label htmlFor="docDeliveryDate" className="mb-1 block text-sm font-medium text-text-primary">
                  Tanggal Kirim
                </label>
                <input
                  id="docDeliveryDate"
                  type="date"
                  value={deliveryDate}
                  onChange={(e) => setDeliveryDate(e.target.value)}
                  className="w-full max-w-xs rounded-lg border border-wood-200 bg-surface px-3 py-2.5 text-sm focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink/20"
                />
              </div>
            )}

            {showPaymentFields && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="docPaymentMethod" className="mb-1 block text-sm font-medium text-text-primary">
                    Metode Pembayaran
                  </label>
                  <input
                    id="docPaymentMethod"
                    type="text"
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    placeholder="Tunai, Transfer, dll."
                    className="w-full rounded-lg border border-wood-200 bg-surface px-3 py-2.5 text-sm placeholder:text-wood-500 focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink/20"
                  />
                </div>
                <div>
                  <label htmlFor="docPaymentRef" className="mb-1 block text-sm font-medium text-text-primary">
                    Referensi Pembayaran
                  </label>
                  <input
                    id="docPaymentRef"
                    type="text"
                    value={paymentRef}
                    onChange={(e) => setPaymentRef(e.target.value)}
                    placeholder="No. referensi"
                    className="w-full rounded-lg border border-wood-200 bg-surface px-3 py-2.5 text-sm placeholder:text-wood-500 focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink/20"
                  />
                </div>
              </div>
            )}

            {/* Line Items */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-text-primary">Item</h2>
                <button                   type="button"
                  onClick={addLine}
                  className="inline-flex items-center gap-1 text-xs font-medium text-ink hover:text-ink/70"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  Tambah Item
                </button>
              </div>

              <div className="space-y-2">
                {lines.map((line, i) => (
                  <div
                    key={line.description + "-" + i}
                    className="flex flex-wrap items-end gap-2 rounded-lg border border-wood-200 bg-surface p-3 sm:flex-nowrap"
                  >
                    <div className="flex-1 sm:min-w-[180px]">
                      <label htmlFor={"lineDesc-" + i} className="mb-0.5 block text-[10px] text-wood-500">Deskripsi</label>
                      <input
                        id={"lineDesc-" + i}
                        type="text"
                        onChange={(e) => updateLine(i, "description", e.target.value)}
                        placeholder="Nama barang/jasa"
                        className="w-full rounded border border-wood-150 bg-cream-50 px-2 py-1.5 text-sm focus:border-ink focus:outline-none"
                      />
                    </div>
                    <div className="w-20">
                      <label htmlFor={"lineQty-" + i} className="mb-0.5 block text-[10px] text-wood-500">Qty</label>
                      <input
                        id={"lineQty-" + i}
                        type="number"
                        min="0.001"
                        value={line.quantityMilli / 1000}
                        onChange={(e) =>
                          updateLine(i, "quantityMilli", Math.round(Number.parseFloat(e.target.value || "0") * 1000))
                        }
                        className="w-full rounded border border-wood-150 bg-cream-50 px-2 py-1.5 text-sm focus:border-ink focus:outline-none"
                      />
                    </div>
                    <div className="w-28">
                      <label htmlFor={"linePrice-" + i} className="mb-0.5 block text-[10px] text-wood-500">Harga (Rp)</label>
                      <input
                        id={"linePrice-" + i}
                        type="number"
                        value={line.unitPriceMinor}
                        onChange={(e) => updateLine(i, "unitPriceMinor", Number.parseInt(e.target.value || "0"))}
                        className="w-full rounded border border-wood-150 bg-cream-50 px-2 py-1.5 text-sm focus:border-ink focus:outline-none"
                      />
                    </div>
                    <div className="w-24 text-right">
                      <span className="mb-0.5 block text-[10px] text-wood-500">Jumlah</span>
                      <span className="block py-1.5 text-sm font-medium text-text-primary">
                        Rp {(line.amountMinor / 100).toLocaleString("id-ID")}
                      </span>
                    </div>
                    <button                       type="button"
                      onClick={() => removeLine(i)}
                      disabled={lines.length <= 1}
                      className="flex h-8 w-8 items-center justify-center rounded text-wood-500 transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-30"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Totals */}
              <div className="ml-auto mt-3 w-full max-w-xs space-y-1 rounded-lg bg-wood-50 p-3">
                <div className="flex justify-between text-sm">
                  <span className="text-text-secondary">Subtotal</span>
                  <span className="font-medium text-text-primary">
                    Rp {(subtotal / 100).toLocaleString("id-ID")}
                  </span>
                </div>
                <div className="border-t border-wood-200 pt-1 text-sm font-semibold">
                  <div className="flex justify-between">
                    <span>Total</span>
                    <span>Rp {(subtotal / 100).toLocaleString("id-ID")}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Notes */}
            <div>
              <label htmlFor="docNotes" className="mb-1 block text-sm font-medium text-text-primary">Catatan</label>
              <textarea
                id="docNotes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Catatan tambahan..."
                className="w-full rounded-lg border border-wood-200 bg-surface px-3 py-2.5 text-sm placeholder:text-wood-500 focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink/20"
              />
            </div>

            {/* Terms */}
            <div>
              <label htmlFor="docTerms" className="mb-1 block text-sm font-medium text-text-primary">Syarat & Ketentuan</label>
              <textarea
                id="docTerms"
                value={terms}
                onChange={(e) => setTerms(e.target.value)}
                rows={2}
                placeholder="Syarat pembayaran, garansi, dll."
                className="w-full rounded-lg border border-wood-200 bg-surface px-3 py-2.5 text-sm placeholder:text-wood-500 focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink/20"
              />
            </div>

            {/* Submit */}
            <div className="flex items-center gap-3 border-t border-wood-200 pt-4">
              <button
                type="submit"
                disabled={mutation.isPending}
                className="inline-flex items-center gap-2 rounded-lg bg-ink px-6 py-2.5 text-sm font-medium text-white transition-all hover:bg-ink/90 focus:outline-none focus:ring-2 focus:ring-ink/30 disabled:opacity-50"
              >
                {mutation.isPending ? (
                  <Loader className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : null}
                {mutation.isPending ? "Menyimpan..." : "Simpan Draft"}
              </button>
              <button                 type="button"
                onClick={() => navigate("/documents")}
                className="rounded-lg px-4 py-2.5 text-sm font-medium text-wood-600 transition-colors hover:bg-wood-50"
              >
                Batal
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
