import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDecimalIDR, formatIDR, formatDate, formatQuantity } from "@/lib/utils";
import { getInvoice, updateInvoiceStatus, createCreditNote as createCreditNoteApi, getCreditNotes, sendInvoiceEmail, printInvoiceUrl } from "@/lib/api/invoices";
import { useOrganization } from "@/hooks/useOrganization";
import { useState } from "react";
import { StatusFlow } from "@/components/ui/status-flow";
import { FieldHelp } from "@/components/ui/help-tooltip";
import { PageGuide } from "@/components/ui/page-guide";

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  issued: "Diterbitkan",
  sent: "Terkirim",
  partially_paid: "Dibayar Sebagian",
  paid: "Lunas",
  overdue: "Jatuh Tempo",
  voided: "Batal",
  credited: "Dikreditkan",
};

export default function InvoiceDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: orgData } = useOrganization();
  const orgId = orgData?.organization?.id;
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const [showCreditForm, setShowCreditForm] = useState(false);
  const [creditLines, setCreditLines] = useState([{ description: "", amount: 0 }]);
  
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [emailTo, setEmailTo] = useState("");

  const { data: invoice, isLoading, isError, error } = useQuery({
    queryKey: queryKeys.invoices.detail(id!),
    queryFn: () => getInvoice(id!),
    enabled: !!orgId && !!id,
  });

  // Fetch credit notes for this invoice
  const { data: fetchedCreditNotes } = useQuery({
    queryKey: ["credit-notes", id],
    queryFn: () => getCreditNotes(id!),
    enabled: !!id && invoice?.status === "credited",
  });

  const statusMutation = useMutation({
    mutationFn: (newStatus: string) => updateInvoiceStatus(id!, newStatus, reason || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.invoices.detail(id!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.invoices.all() });
      setReason("");
    },
  });

  const creditNoteMutation = useMutation({
    mutationFn: () => {
      const lines = creditLines
        .filter((l) => l.description && l.amount > 0)
        .map((l) => ({
          description: l.description,
          quantityMilli: 1000,
          unitPriceMinor: Math.round(l.amount * 100),
          amountMinor: Math.round(l.amount * 100),
        }));
      return createCreditNoteApi(id!, { lines, reason: reason || undefined });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.invoices.detail(id!) });
      queryClient.invalidateQueries({ queryKey: ["credit-notes", id] });
      queryClient.invalidateQueries({ queryKey: queryKeys.invoices.all() });
      setShowCreditForm(false);
      setCreditLines([{ description: "", amount: 0 }]);
    },
  });

  const emailMutation = useMutation({
    mutationFn: () => sendInvoiceEmail(id!, emailTo),
    onSuccess: () => {
      setShowEmailForm(false);
      setEmailTo("");
      queryClient.invalidateQueries({ queryKey: queryKeys.invoices.detail(id!) });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (isError || !invoice) {
    return <ErrorState message={(error as Error)?.message ?? "Faktur tidak ditemukan"} />;
  }

  const STATUS_ACTIONS: Record<string, Array<{ status: string; label: string; variant?: "primary" | "secondary" | "success" | "danger" | "ghost" | "outline" | "link" }>> = {
    draft: [{ status: "issued", label: "Terbitkan" }],
    issued: [
      { status: "sent", label: "Tandai Terkirim" },
      { status: "voided", label: "Batalkan", variant: "danger" },
    ],
    sent: [
      { status: "voided", label: "Batalkan", variant: "danger" },
    ],
    voided: [],
    paid: [],
    overdue: [{ status: "voided", label: "Batalkan", variant: "danger" }],
  };

  const actions = STATUS_ACTIONS[invoice.status] ?? [];

  // Determine if credit note button should show
  const showCreditNoteBtn = invoice.status === "paid";

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary break-words">{invoice.invoiceNumber}</h1>
          <p className="mt-1 text-sm text-text-secondary">Faktur {STATUS_LABELS[invoice.status]}</p>
        </div>
        <Button variant="ghost" onClick={() => navigate("/invoices")}>Kembali</Button>
      </div>

      {/* Panduan halaman */}
      <PageGuide guideKey="invoices/:id" />

      {/* Lifecycle status flow */}
      <div className="flex flex-wrap items-center gap-2">
        <StatusFlow
          steps={[
            { key: "draft", label: "Draft" },
            { key: "issued", label: "Terbit" },
            { key: "sent", label: "Terkirim" },
            { key: "paid", label: "Lunas" },
            { key: "credited", label: "Nota Kredit" },
            { key: "voided", label: "Dibatalkan" },
          ]}
          current={invoice.status}
        />
        <FieldHelp topic="invoice_journal" label="Setiap faktur otomatis membuat jurnal" />
      </div>

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="block text-wood-500">Tanggal Faktur</span>
              <span className="font-medium text-wood-800">{formatDate(invoice.invoiceDate)}</span>
            </div>
            <div>
              <span className="block text-wood-500">Jatuh Tempo</span>
              <span className="font-medium text-wood-800">{formatDate(invoice.dueDate)}</span>
            </div>
            <div className="col-span-2">
              <span className="block text-wood-500">Pelanggan</span>
              <span className="font-medium text-wood-800">{invoice.partyName ?? invoice.partyId}</span>
            </div>
          </div>

          {/* Line items */}
          <div className="overflow-x-auto rounded-lg border border-wood-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-wood-50">
                <tr>
                  <th className="px-4 py-2.5 font-medium text-wood-600">#</th>
                  <th className="px-4 py-2.5 font-medium text-wood-600">Deskripsi</th>
                  <th className="px-4 py-2.5 font-medium text-wood-600 text-right">Qty</th>
                  <th className="px-4 py-2.5 font-medium text-wood-600 text-right">Harga</th>
                  <th className="px-4 py-2.5 font-medium text-wood-600 text-right">Jumlah</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-wood-100">
                {(invoice.lines ?? []).map((line, i) => (
                  <tr key={line.lineNumber ?? i}>
                    <td className="px-4 py-2 text-wood-500">{line.lineNumber ?? i + 1}</td>
                    <td className="px-4 py-2 text-wood-800">{line.description}</td>
                    <td className="px-4 py-2 text-right text-wood-700">{formatQuantity(line.quantityMilli / 1000)}</td>
                    <td className="px-4 py-2 text-right text-wood-700">{formatDecimalIDR(line.unitPriceMinor / 100)}</td>
                    <td className="px-4 py-2 text-right font-medium text-wood-800">{formatDecimalIDR(line.amountMinor / 100)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="text-right space-y-1 text-sm border-t border-wood-200 pt-3">
            <div className="text-wood-600">Subtotal: {formatDecimalIDR(invoice.subtotalMinor / 100)}</div>
            {invoice.discountMinor > 0 && <div className="text-error">Diskon: -{formatIDR(invoice.discountMinor / 100)}</div>}
            {invoice.taxMinor > 0 && <div className="text-wood-600">Pajak: {formatIDR(invoice.taxMinor / 100)}</div>}
            <div className="text-lg font-semibold text-wood-800">Total: {formatDecimalIDR(invoice.totalMinor / 100)}</div>
          </div>

          {/* Payment progress */}
          {invoice.paidMinor > 0 && (
            <div className="border-t border-wood-200 pt-3 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-wood-600">Telah Dibayar</span>
                <span className="font-medium text-leaf-600">{formatIDR(invoice.paidMinor / 100)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-wood-600">Sisa Tagihan</span>
                <span className="font-medium text-warning">{formatIDR((invoice.totalMinor - invoice.paidMinor) / 100)}</span>
              </div>
              <div className="w-full h-2 bg-wood-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-leaf-500 rounded-full transition-all"
                  style={{ width: `${Math.min(100, (invoice.paidMinor / invoice.totalMinor) * 100)}%` }}
                />
              </div>
              <p className="text-xs text-wood-500">{Math.round((invoice.paidMinor / invoice.totalMinor) * 100)}% lunas</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Notes */}
      {invoice.notes && (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold text-wood-700 mb-1">Catatan</h3>
            <p className="text-sm text-wood-600 whitespace-pre-wrap">{invoice.notes}</p>
          </CardContent>
        </Card>
      )}

      {/* Credit Notes Display */}
      {fetchedCreditNotes && fetchedCreditNotes.length > 0 && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <h3 className="text-sm font-semibold text-wood-700">Credit Note</h3>
            {fetchedCreditNotes.map((cn) => (
              <div key={cn.id} className="flex items-center justify-between rounded-lg border border-warning-border bg-warning-bg p-3">
                <div>
                  <span className="font-medium text-clay-800">{cn.invoiceNumber}</span>
                  <span className="ml-2 text-xs text-clay-600">{STATUS_LABELS[cn.status] ?? cn.status}</span>
                </div>
                <span className="font-medium text-clay-700">{formatIDR(cn.totalMinor / 100)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Status Actions */}
      {actions.length > 0 && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <h3 className="text-sm font-semibold text-wood-700">Status</h3>
            <div className="flex flex-wrap gap-2">
              {actions.map((action) => (
                <Button
                  key={action.status}
                  variant={action.variant ?? "primary"}
                  onClick={() => statusMutation.mutate(action.status)}
                  disabled={statusMutation.isPending}
                >
                  {action.label}
                </Button>
              ))}
            </div>
            {invoice.status === "voided" && (
              <div>
                <Input
                  id="void-reason"
                  label="Alasan Pembatalan"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Opsional"
                />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Credit Note Form */}
      {showCreditNoteBtn && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <h3 className="text-sm font-semibold text-wood-700">Credit Note</h3>
            <p className="text-xs text-wood-500">Buat credit note untuk faktur yang sudah dibayar.</p>

            {!showCreditForm ? (
              <Button
                variant="outline"
                onClick={() => setShowCreditForm(true)}
                className="border-warning-border text-warning hover:bg-warning-bg"
              >
                Buat Credit Note
              </Button>
            ) : (
              <div className="space-y-3">
                {creditLines.map((cl, i) => (
                  <div key={"line-" + i} className="grid grid-cols-10 gap-2 items-end">
                    <div className="col-span-7">
                      <label htmlFor={`cr-line-${i}-desc`} className="block text-xs text-wood-500 mb-0.5">Deskripsi</label>
                      <Input
                        id={`cr-line-${i}-desc`}
                        value={cl.description}
                        onChange={(e) => {
                          const copy = [...creditLines];
                          copy[i] = { ...copy[i], description: e.target.value };
                          setCreditLines(copy);
                        }}
                        placeholder="Alasan kredit"
                      />
                    </div>
                    <div className="col-span-2">
                      <label htmlFor={`cr-line-${i}-amount`} className="block text-xs text-wood-500 mb-0.5">Jumlah (Rp)</label>
                      <Input
                        id={`cr-line-${i}-amount`}
                        isCurrency
                        min={0}
                        value={cl.amount}
                        onChange={(e) => {
                          const copy = [...creditLines];
                          copy[i] = { ...copy[i], amount: Number.parseFloat(e.target.value) || 0 };
                          setCreditLines(copy);
                        }}
                      />
                    </div>
                    <div className="col-span-1 pt-5">
                      {creditLines.length > 1 && (
                        <button                           type="button"
                          onClick={() => setCreditLines(creditLines.filter((_, j) => j !== i))}
                          className="text-error text-sm"
                          aria-label="Hapus"
                        >×</button>
                      )}
                    </div>
                  </div>
                ))}
                <Button variant="ghost" size="sm" onClick={() => setCreditLines([...creditLines, { description: "", amount: 0 }])}>
                  + Tambah Item
                </Button>
                <div className="flex gap-2 justify-end pt-2">
                  <Button variant="ghost" size="sm" onClick={() => { setShowCreditForm(false); setCreditLines([{ description: "", amount: 0 }]); }}>
                    Batal
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => creditNoteMutation.mutate()}
                    disabled={creditNoteMutation.isPending || creditLines.every((l) => !l.description || l.amount <= 0)}
                  >
                    {creditNoteMutation.isPending ? "Menyimpan..." : "Simpan Credit Note"}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Tools: Print & Email */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <h3 className="text-sm font-semibold text-wood-700">Alat</h3>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(printInvoiceUrl(invoice.id), "_blank")}
            >
              Cetak / PDF
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowEmailForm(!showEmailForm)}
            >
              Kirim Email
            </Button>
          </div>

          {showEmailForm && (
            <div className="space-y-2 pt-2 border-t border-wood-200">
              <label htmlFor="email-to" className="block text-xs font-medium text-wood-600">Alamat Email Tujuan</label>
              <div className="flex gap-2">
                <Input
                  id="email-to"
                  type="email"
                  value={emailTo}
                  onChange={(e) => setEmailTo(e.target.value)}
                  placeholder="pelanggan@email.com"
                  className="flex-1"
                />
                <Button
                  size="sm"
                  onClick={() => emailMutation.mutate()}
                  disabled={!emailTo || emailMutation.isPending}
                >
                  {emailMutation.isPending ? "Mengirim..." : "Kirim"}
                </Button>
              </div>
              {emailMutation.isSuccess && (
                <p className="text-xs text-leaf-600">Email berhasil dikirim!</p>
              )}
              {emailMutation.isError && (
                <ErrorState message={(emailMutation.error as Error)?.message ?? "Gagal mengirim email"} />
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
