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
import { Badge } from "@/components/ui/badge";
import { getStatus } from "@/lib/status-registry";
import { PageShell } from "@/components/ui/page-shell";
import { PageGuide } from "@/components/ui/page-guide";



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
    <PageShell
      header={{
        title: "Faktur",
        actions: [{ key: "create", children: <Button onClick={() => navigate("/invoices/new")}>+ Faktur Baru</Button> }],
      }}
    >

      {/* Panduan halaman */}
      <PageGuide guideKey="invoices" />

      {isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      )}

      {isError && <ErrorState message={error?.message ?? "Gagal memuat faktur"} />}

      {data?.invoices.length === 0 && (
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
                    <td className="px-4 py-3 text-right font-medium text-wood-800">{formatIDR(inv.totalMinor / 100)}</td>
                    <td className="px-4 py-3">
                      <Badge variant={getStatus("invoices", inv.status).variant} size="sm">
                        {getStatus("invoices", inv.status).label}
                      </Badge>
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
    </PageShell>
  );
}
