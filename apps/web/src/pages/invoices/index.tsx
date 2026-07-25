import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { formatIDR, formatDate } from "@/lib/utils";
import { listInvoices, type InvoiceOutput } from "@/lib/api/invoices";
import { useOrganization } from "@/hooks/useOrganization";
import { Skeleton } from "@/components/ui/skeleton";

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

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-wood-100 text-wood-600",
  issued: "bg-blue-100 text-blue-700",
  sent: "bg-blue-100 text-blue-700",
  partially_paid: "bg-yellow-100 text-yellow-700",
  paid: "bg-emerald-100 text-emerald-700",
  overdue: "bg-red-100 text-red-700",
  voided: "bg-wood-200 text-wood-500",
  credited: "bg-violet-100 text-violet-700",
};

export default function InvoiceListPage() {
  const navigate = useNavigate();
  const { data: orgData } = useOrganization();
  const orgId = orgData?.organization?.id;
  const [page, setPage] = useState(0);
  const limit = 25;

  const { data, isLoading, isError, error } = useQuery({
    queryKey: queryKeys.invoices.list(page * limit, limit),
    queryFn: () => listInvoices(limit, page * limit),
    enabled: !!orgId,
  });

  return (
    <div className="space-y-6 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-wood-800">Faktur</h1>
        <Button onClick={() => navigate("/invoices/new")}>+ Faktur Baru</Button>
      </div>

      {isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      )}

      {isError && <ErrorState message={(error as Error)?.message ?? "Gagal memuat faktur"} />}

      {data && data.invoices.length === 0 && (
        <EmptyState title="Belum Ada Faktur" description="Buat faktur pertama untuk pelanggan Anda." />
      )}

      {data && data.invoices.length > 0 && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-wood-50">
                <tr>
                  <th className="px-4 py-3 font-medium text-wood-600">No. Faktur</th>
                  <th className="px-4 py-3 font-medium text-wood-600">Pelanggan</th>
                  <th className="px-4 py-3 font-medium text-wood-600">Tanggal</th>
                  <th className="px-4 py-3 font-medium text-wood-600">Jatuh Tempo</th>
                  <th className="px-4 py-3 font-medium text-wood-600 text-right">Total</th>
                  <th className="px-4 py-3 font-medium text-wood-600">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-wood-100">
                {data.invoices.map((inv: InvoiceOutput) => (
                  <tr key={inv.id} className="hover:bg-wood-50 cursor-pointer" onClick={() => navigate(`/invoices/${inv.id}`)}>
                    <td className="px-4 py-3 font-medium text-wood-800">{inv.invoiceNumber}</td>
                    <td className="px-4 py-3 text-wood-700">{inv.partyName ?? inv.partyId}</td>
                    <td className="px-4 py-3 text-wood-600">{formatDate(inv.invoiceDate)}</td>
                    <td className="px-4 py-3 text-wood-600">{formatDate(inv.dueDate)}</td>
                    <td className="px-4 py-3 text-right font-medium text-wood-800">{formatIDR(inv.totalMinor)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[inv.status] ?? "bg-wood-100 text-wood-600"}`}>
                        {STATUS_LABELS[inv.status] ?? inv.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.total > limit && (
            <div className="flex justify-between items-center p-4 border-t border-wood-200">
              <span className="text-sm text-wood-500">{data.total} total</span>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Sebelumnya</Button>
                <Button variant="ghost" size="sm" disabled={(page + 1) * limit >= data.total} onClick={() => setPage(page + 1)}>Selanjutnya</Button>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
