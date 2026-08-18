import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { formatIDR, formatDate } from "@/lib/utils";
import { FieldHelp } from "@/components/ui/help-tooltip";
import { PageGuide } from "@/components/ui/page-guide";

interface StatementInvoice {
  invoiceId: string;
  invoiceNumber: string;
  date: string;
  dueDate: string;
  totalMinor: number;
  outstandingMinor: number;
  status: string;
}

interface PartyStatement {
  partyId: string;
  partyName: string;
  invoices: StatementInvoice[];
  totalOutstanding: number;
}

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
  draft: "text-wood-600",
  issued: "text-sky-700",
  sent: "text-sky-700",
  partially_paid: "text-honey-700",
  paid: "text-leaf-700",
  overdue: "text-error",
  voided: "text-wood-500",
  credited: "text-clay-700",
};

export default function PartyStatementPage() {
  const { partyId } = useParams();
  const navigate = useNavigate();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["party-statement", partyId],
    queryFn: () => apiRequest<PartyStatement>(`/api/receivables/statement/${partyId}`),
    enabled: !!partyId,
  });

  if (isLoading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (isError || !data) {
    return <ErrorState message={(error as Error)?.message ?? "Data tidak ditemukan"} />;
  }

  const unpaidInvoices = data.invoices.filter(
    (inv) => inv.status !== "paid" && inv.status !== "voided" && inv.status !== "credited"
  );
  const paidInvoices = data.invoices.filter(
    (inv) => inv.status === "paid" || inv.status === "credited"
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary break-words">{data.partyName}</h1>
          <p className="mt-1 text-sm text-text-secondary">
            {data.invoices.length} faktur — Total outstanding: {formatIDR(data.totalOutstanding / 100)}
          </p>
          <FieldHelp topic="party_statement" label="Riwayat lengkap transaksi dengan pihak ini" />
        </div>
        <Button variant="ghost" onClick={() => navigate("/reports/aging")}>Kembali</Button>
      </div>

      {/* Panduan halaman */}
      <PageGuide guideKey="reports/party-statement" />

      {/* Unpaid invoices */}
      {unpaidInvoices.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h2 className="text-sm font-semibold text-wood-700 mb-3">Tagihan Aktif</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-wood-50">
                  <tr>
                    <th className="px-3 py-2.5 font-medium text-wood-600">No. Faktur</th>
                    <th className="px-3 py-2.5 font-medium text-wood-600">Tanggal</th>
                    <th className="px-3 py-2.5 font-medium text-wood-600">Jatuh Tempo</th>
                    <th className="px-3 py-2.5 font-medium text-wood-600 text-right">Total</th>
                    <th className="px-3 py-2.5 font-medium text-wood-600 text-right">Sisa</th>
                    <th className="px-3 py-2.5 font-medium text-wood-600">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-wood-100">
                  {unpaidInvoices.map((inv) => (
                    <tr
                      key={inv.invoiceId}
                      className="hover:bg-wood-50 cursor-pointer"
                      onClick={() => navigate(`/invoices/${inv.invoiceId}`)}
                    >
                      <td className="px-3 py-2.5 font-medium text-wood-800">{inv.invoiceNumber}</td>
                      <td className="px-3 py-2.5 text-wood-600">{formatDate(inv.date)}</td>
                      <td className="px-3 py-2.5 text-wood-600">{formatDate(inv.dueDate)}</td>
                      <td className="px-3 py-2.5 text-right text-wood-700">{formatIDR(inv.totalMinor / 100)}</td>
                      <td className="px-3 py-2.5 text-right font-medium text-warning">{formatIDR(inv.outstandingMinor / 100)}</td>
                      <td className={`px-3 py-2.5 font-medium ${STATUS_COLORS[inv.status] ?? ""}`}>
                        {STATUS_LABELS[inv.status] ?? inv.status}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Paid invoices */}
      {paidInvoices.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h2 className="text-sm font-semibold text-wood-700 mb-3">Riwayat Lunas</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-wood-50">
                  <tr>
                    <th className="px-3 py-2.5 font-medium text-wood-600">No. Faktur</th>
                    <th className="px-3 py-2.5 font-medium text-wood-600">Tanggal</th>
                    <th className="px-3 py-2.5 font-medium text-wood-600">Jatuh Tempo</th>
                    <th className="px-3 py-2.5 font-medium text-wood-600 text-right">Total</th>
                    <th className="px-3 py-2.5 font-medium text-wood-600">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-wood-100">
                  {paidInvoices.map((inv) => (
                    <tr key={inv.invoiceNumber} className="hover:bg-wood-50 cursor-pointer" onClick={() => navigate(`/invoices/${inv.invoiceId}`)}>
                      <td className="px-3 py-2.5 font-medium text-wood-800">{inv.invoiceNumber}</td>
                      <td className="px-3 py-2.5 text-wood-600">{formatDate(inv.date)}</td>
                      <td className="px-3 py-2.5 text-wood-600">{formatDate(inv.dueDate)}</td>
                      <td className="px-3 py-2.5 text-right text-wood-700">{formatIDR(inv.totalMinor / 100)}</td>
                      <td className={`px-3 py-2.5 font-medium ${STATUS_COLORS[inv.status] ?? ""}`}>
                        {STATUS_LABELS[inv.status] ?? inv.status}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary card */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="block text-wood-500 text-xs">Total Faktur</span>
              <span className="font-semibold text-wood-800">{data.invoices.length}</span>
            </div>
            <div>
              <span className="block text-wood-500 text-xs">Tagihan Aktif</span>
              <span className="font-semibold text-wood-800">{unpaidInvoices.length}</span>
            </div>
            <div>
              <span className="block text-wood-500 text-xs">Total Outstanding</span>
              <span className="font-semibold text-warning">{formatIDR(data.totalOutstanding / 100)}</span>
            </div>
            <div>
              <span className="block text-wood-500 text-xs">Lunas</span>
              <span className="font-semibold text-leaf-600">{paidInvoices.length}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
