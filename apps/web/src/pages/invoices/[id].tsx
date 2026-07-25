import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { formatIDR, formatDate } from "@/lib/utils";
import { getInvoice, updateInvoiceStatus } from "@/lib/api/invoices";
import { useOrganization } from "@/hooks/useOrganization";
import { useState } from "react";

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

  const { data: invoice, isLoading, isError, error } = useQuery({
    queryKey: queryKeys.invoices.detail(id!),
    queryFn: () => getInvoice(id!),
    enabled: !!orgId && !!id,
  });

  const statusMutation = useMutation({
    mutationFn: (newStatus: string) => updateInvoiceStatus(id!, newStatus, reason || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.invoices.detail(id!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.invoices.all() });
      setReason("");
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

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-wood-800">{invoice.invoiceNumber}</h1>
          <p className="text-sm text-wood-500">Faktur {STATUS_LABELS[invoice.status]}</p>
        </div>
        <Button variant="ghost" onClick={() => navigate("/invoices")}>Kembali</Button>
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
                  <tr key={i}>
                    <td className="px-4 py-2 text-wood-500">{line.lineNumber ?? i + 1}</td>
                    <td className="px-4 py-2 text-wood-800">{line.description}</td>
                    <td className="px-4 py-2 text-right text-wood-700">{(line.quantityMilli / 1000).toFixed(2)}</td>
                    <td className="px-4 py-2 text-right text-wood-700">{formatIDR(line.unitPriceMinor)}</td>
                    <td className="px-4 py-2 text-right font-medium text-wood-800">{formatIDR(line.amountMinor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="text-right space-y-1 text-sm border-t border-wood-200 pt-3">
            <div className="text-wood-600">Subtotal: {formatIDR(invoice.subtotalMinor)}</div>
            {invoice.discountMinor > 0 && <div className="text-red-600">Diskon: -{formatIDR(invoice.discountMinor)}</div>}
            {invoice.taxMinor > 0 && <div className="text-wood-600">Pajak: {formatIDR(invoice.taxMinor)}</div>}
            <div className="text-lg font-semibold text-wood-800">Total: {formatIDR(invoice.totalMinor)}</div>
          </div>
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

      {/* Actions */}
      {actions.length > 0 && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <h3 className="text-sm font-semibold text-wood-700">Aksi</h3>
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
                <label htmlFor="void-reason" className="mb-1 block text-xs text-wood-500">Alasan Pembatalan</label>
                <input
                  id="void-reason"
                  className="w-full rounded-md border border-wood-200 bg-white px-3 py-2 text-sm"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Opsional"
                />
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
