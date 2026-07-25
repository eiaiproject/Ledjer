import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  getDocument,
  updateDocumentStatus,
  convertQuotationToInvoice,
  receivePurchaseOrder,
  printDocumentUrl,
  type DocumentOutput,
} from "@/lib/api/documents";

import { ArrowLeft, Printer, Loader, AlertTriangle, CheckCircle, XCircle, FileText } from "reicon-react";

const DOCUMENT_LABELS: Record<string, string> = {
  quotation: "Penawaran Harga",
  purchase_order: "Pesanan Pembelian",
  delivery_note: "Surat Jalan",
  payment_receipt: "Tanda Terima Pembayaran",
  cash_receipt: "Bukti Kas Masuk",
  cash_payment_voucher: "Bukti Kas Keluar",
  return_note: "Nota Retur",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  confirmed: "Dikonfirmasi",
  issued: "Diterbitkan",
  sent: "Terkirim",
  partially_received: "Diterima Sebagian",
  received: "Diterima",
  cancelled: "Dibatalkan",
  converted: "Dikonversi",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-wood-100 text-wood-700",
  confirmed: "bg-blue-100 text-blue-700",
  issued: "bg-leaf-100 text-leaf-700",
  sent: "bg-sky-100 text-sky-700",
  partially_received: "bg-amber-100 text-amber-700",
  received: "bg-leaf-100 text-leaf-700",
  cancelled: "bg-red-100 text-red-700",
  converted: "bg-purple-100 text-purple-700",
};

function formatRupiah(n: number): string {
  return `Rp ${(n / 100).toLocaleString("id-ID")}`;
}

/** Available actions for each document type + status combination */
function getAvailableActions(doc: DocumentOutput): {
  status?: string;
  label: string;
  variant: "primary" | "danger" | "secondary";
  icon?: React.ReactNode;
}[] {
  const actions: { status?: string; label: string; variant: "primary" | "danger" | "secondary"; icon?: React.ReactNode }[] = [];

  if (doc.status === "draft") {
    actions.push({ status: "confirmed", label: "Konfirmasi", variant: "primary" });
  }
  if (doc.status === "confirmed") {
    actions.push({ status: "issued", label: "Terbitkan", variant: "primary" });
    actions.push({ status: "sent", label: "Tandai Terkirim", variant: "secondary" });
  }
  if (doc.status === "issued") {
    actions.push({ status: "sent", label: "Tandai Terkirim", variant: "secondary" });
  }

  // Type-specific actions
  if (doc.documentType === "quotation" && (doc.status === "issued" || doc.status === "sent")) {
    actions.push({ label: "Konversi ke Faktur", variant: "primary", icon: <FileText className="h-4 w-4" /> });
  }
  if (doc.documentType === "purchase_order" && (doc.status === "issued" || doc.status === "sent")) {
    actions.push({ label: "Terima Barang", variant: "primary", icon: <CheckCircle className="h-4 w-4" /> });
  }

  // Cancellation (except already cancelled/converted)
  if (!["cancelled", "converted", "received"].includes(doc.status)) {
    actions.push({ status: "cancelled", label: "Batalkan", variant: "danger" });
  }

  return actions;
}

export function DocumentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // const { orgData } = useOrganization();
  const [cancelReason, setCancelReason] = useState("");
  const [showCancelInput, setShowCancelInput] = useState(false);

  const { data: doc, isLoading, error } = useQuery({
    queryKey: ["documents", id],
    queryFn: () => getDocument(id!),
    enabled: !!id,
  });

  const statusMutation = useMutation({
    mutationFn: ({ status, reason }: { status: string; reason?: string }) =>
      updateDocumentStatus(id!, status, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      setShowCancelInput(false);
    },
  });

  const convertMutation = useMutation({
    mutationFn: () => convertQuotationToInvoice(id!),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      navigate(`/invoices/${result.invoiceId}`);
    },
  });

  const receiveMutation = useMutation({
    mutationFn: () => receivePurchaseOrder(id!),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      navigate(`/documents/${result.deliveryNoteId}`);
    },
  });

  if (isLoading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <Loader className="h-6 w-6 animate-spin text-wood-400" aria-hidden="true" />
      </div>
    );
  }

  if (error || !doc) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <AlertTriangle className="mx-auto mb-2 h-6 w-6 text-red-500" aria-hidden="true" />
          <p className="text-sm font-medium text-red-600">Dokumen tidak ditemukan</p>
          <button onClick={() => navigate("/documents")} className="mt-3 text-sm text-red-600 underline">
            Kembali ke daftar dokumen
          </button>
        </div>
      </div>
    );
  }

  const actions = getAvailableActions(doc);

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6 lg:p-8">
      {/* Back */}
      <button
        onClick={() => navigate("/documents")}
        className="inline-flex items-center gap-1.5 text-sm text-wood-600 transition-colors hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Kembali ke Dokumen
      </button>

      {/* Header */}
      <div className="rounded-xl border border-wood-200 bg-surface p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-text-primary">{doc.documentNumber}</h1>
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  STATUS_COLORS[doc.status] ?? "bg-wood-100 text-wood-600"
                }`}
              >
                {STATUS_LABELS[doc.status] ?? doc.status}
              </span>
            </div>
            <p className="mt-1 text-sm text-text-secondary">
              {DOCUMENT_LABELS[doc.documentType] ?? doc.documentType}
            </p>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={printDocumentUrl(doc.id)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-wood-200 bg-surface px-3 py-2 text-xs font-medium text-wood-700 transition-all hover:bg-wood-50"
            >
              <Printer className="h-3.5 w-3.5" aria-hidden="true" />
              Cetak
            </a>

            {actions.map((action, i) =>
              action.status === "cancelled" ? (
                <button
                  key={i}
                  onClick={() => setShowCancelInput(true)}
                  disabled={statusMutation.isPending}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-600 transition-all hover:bg-red-50"
                >
                  <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                  {action.label}
                </button>
              ) : action.label === "Konversi ke Faktur" ? (
                <button
                  key={i}
                  onClick={() => {
                    if (window.confirm("Konversi penawaran ini menjadi faktur?")) {
                      convertMutation.mutate();
                    }
                  }}
                  disabled={convertMutation.isPending}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-leaf-600 px-3 py-2 text-xs font-medium text-white transition-all hover:bg-leaf-700"
                >
                  {convertMutation.isPending ? (
                    <Loader className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    action.icon
                  )}
                  {action.label}
                </button>
              ) : action.label === "Terima Barang" ? (
                <button
                  key={i}
                  onClick={() => {
                    if (window.confirm("Tandai pesanan ini sebagai diterima?")) {
                      receiveMutation.mutate();
                    }
                  }}
                  disabled={receiveMutation.isPending}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white transition-all hover:bg-blue-700"
                >
                  {receiveMutation.isPending ? (
                    <Loader className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    action.icon
                  )}
                  {action.label}
                </button>
              ) : (
                <button
                  key={i}
                  onClick={() => statusMutation.mutate({ status: action.status! })}
                  disabled={statusMutation.isPending}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-all ${
                    action.variant === "primary"
                      ? "bg-ink text-white hover:bg-ink/90"
                      : "border border-wood-200 text-wood-700 hover:bg-wood-50"
                  }`}
                >
                  {action.label}
                </button>
              ),
            )}
          </div>
        </div>

        {/* Cancel reason input */}
        {showCancelInput && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4">
            <p className="mb-2 text-xs font-medium text-red-700">Alasan pembatalan:</p>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={2}
              className="w-full rounded border border-red-200 bg-white px-3 py-2 text-sm focus:border-red-400 focus:outline-none"
              placeholder="Alasan pembatalan (wajib)"
            />
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => statusMutation.mutate({ status: "cancelled", reason: cancelReason || undefined })}
                disabled={statusMutation.isPending}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
              >
                {statusMutation.isPending ? "Membatalkan..." : "Ya, Batalkan"}
              </button>
              <button
                onClick={() => { setShowCancelInput(false); setCancelReason(""); }}
                className="rounded-lg bg-surface px-3 py-1.5 text-xs font-medium text-wood-600"
              >
                Batal
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Details */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-wood-200 bg-surface p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-wood-500">Informasi</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-wood-500">Tanggal</dt>
              <dd className="font-medium text-text-primary">{doc.documentDate}</dd>
            </div>
            {doc.partyId && (
              <div className="flex justify-between">
                <dt className="text-wood-500">Pihak</dt>
                <dd className="font-medium text-text-primary">{doc.partyId}</dd>
              </div>
            )}
            {doc.deliveryDate && (
              <div className="flex justify-between">
                <dt className="text-wood-500">Tanggal Kirim</dt>
                <dd className="font-medium text-text-primary">{doc.deliveryDate}</dd>
              </div>
            )}
            {doc.paymentMethod && (
              <div className="flex justify-between">
                <dt className="text-wood-500">Metode Bayar</dt>
                <dd className="font-medium text-text-primary">{doc.paymentMethod}</dd>
              </div>
            )}
            {doc.paymentReference && (
              <div className="flex justify-between">
                <dt className="text-wood-500">Referensi</dt>
                <dd className="font-medium text-text-primary">{doc.paymentReference}</dd>
              </div>
            )}
          </dl>
        </div>

        <div className="rounded-xl border border-wood-200 bg-surface p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-wood-500">Total</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-wood-500">Subtotal</dt>
              <dd className="font-medium text-text-primary">{formatRupiah(doc.subtotalMinor)}</dd>
            </div>
            {doc.discountMinor > 0 && (
              <div className="flex justify-between">
                <dt className="text-wood-500">Diskon</dt>
                <dd className="font-medium text-red-600">-{formatRupiah(doc.discountMinor)}</dd>
              </div>
            )}
            {doc.taxMinor > 0 && (
              <div className="flex justify-between">
                <dt className="text-wood-500">Pajak</dt>
                <dd className="font-medium text-text-primary">{formatRupiah(doc.taxMinor)}</dd>
              </div>
            )}
            <div className="flex justify-between border-t border-wood-200 pt-2 text-base font-bold">
              <dt>Total</dt>
              <dd>{formatRupiah(doc.totalMinor)}</dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Reference */}
      {doc.referenceDocumentId && (
        <div className="rounded-xl border border-wood-200 bg-amber-50 p-4">
          <p className="text-xs text-amber-700">
            Referensi: {doc.referenceDocumentType} — {doc.referenceDocumentId}
          </p>
        </div>
      )}

      {/* Line Items */}
      <div className="rounded-xl border border-wood-200 bg-surface shadow-sm">
        <div className="border-b border-wood-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-text-primary">Item</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-wood-100 bg-wood-50 text-left text-xs text-wood-500">
                <th className="px-4 py-2 font-medium">#</th>
                <th className="px-4 py-2 font-medium">Deskripsi</th>
                <th className="px-4 py-2 text-right font-medium">Qty</th>
                <th className="px-4 py-2 text-right font-medium">Harga</th>
                <th className="px-4 py-2 text-right font-medium">Jumlah</th>
              </tr>
            </thead>
            <tbody>
              {doc.lines.map((line, i) => (
                <tr key={line.id || i} className="border-b border-wood-100 last:border-b-0">
                  <td className="px-4 py-3 text-wood-400">{i + 1}</td>
                  <td className="px-4 py-3 font-medium text-text-primary">{line.description}</td>
                  <td className="px-4 py-3 text-right text-text-primary">
                    {(line.quantityMilli / 1000).toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right text-text-primary">
                    {formatRupiah(line.unitPriceMinor)}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-text-primary">
                    {formatRupiah(line.amountMinor)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Notes */}
      {doc.notes && (
        <div className="rounded-xl border border-wood-200 bg-surface p-4">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-wood-500">Catatan</h3>
          <p className="text-sm text-text-primary whitespace-pre-wrap">{doc.notes}</p>
        </div>
      )}
      {doc.terms && (
        <div className="rounded-xl border border-wood-200 bg-surface p-4">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-wood-500">Syarat & Ketentuan</h3>
          <p className="text-sm text-text-primary whitespace-pre-wrap">{doc.terms}</p>
        </div>
      )}
    </div>
  );
}
