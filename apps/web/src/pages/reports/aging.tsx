import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { formatIDR } from "@/lib/utils";
// ExternalLink icon replaced with inline SVG
import { HelpTooltip } from "@/components/ui/help-tooltip";

interface AgingBucket {
  label: string;
  totalMinor: number;
  count: number;
}

interface PartyAging {
  partyId: string;
  partyName: string;
  totalOutstanding: number;
  buckets: AgingBucket[];
}

interface AgingReport {
  aging: PartyAging[];
}

function fetchAging(partyType: string): Promise<AgingReport> {
  return apiRequest(`/api/receivables/aging?partyType=${encodeURIComponent(partyType)}`);
}

export default function AgingReportPage() {
  const navigate = useNavigate();
  const [partyType, setPartyType] = useState("customer");

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["aging", partyType],
    queryFn: () => fetchAging(partyType),
  });

  const allItems: PartyAging[] = data?.aging ?? [];
  const totalOutstanding = allItems.reduce((s, p) => s + p.totalOutstanding, 0);

  return (
    <div className="space-y-6 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-wood-800">
          Piutang & Utang
          <HelpTooltip topic="aging" position="right" />
        </h1>
      </div>

      <div className="flex items-end gap-3">
        <div className="w-48">
          <label htmlFor="aging-type" className="mb-1 block text-xs font-medium text-wood-600">Tipe</label>
          <Select
            id="aging-type"
            value={partyType}
            onChange={(e) => setPartyType(e.target.value)}
            options={[
              { value: "customer", label: "Piutang (Pelanggan)" },
              { value: "supplier", label: "Utang (Pemasok)" },
            ]}
          />
        </div>
        <Button variant="ghost" onClick={() => refetch()}>Muat Ulang</Button>
      </div>

      {isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      )}

      {isError && <ErrorState message={(error as Error)?.message ?? "Gagal memuat data" as string} />}

      {allItems.length === 0 && !isLoading && (
        <EmptyState
          title={partyType === "customer" ? "Belum Ada Piutang" : "Belum Ada Utang"}
          description={partyType === "customer" ? "Belum ada faktur penjualan kredit." : "Belum ada faktur pembelian kredit."}
        />
      )}

      {allItems.length > 0 && (
        <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-wood-50">
                  <tr>
                    <th className="px-4 py-3 font-medium text-wood-600">{partyType === "customer" ? "Pelanggan" : "Pemasok"}</th>
                    <th className="px-4 py-3 font-medium text-wood-600 text-right">Lancar</th>
                    <th className="px-4 py-3 font-medium text-wood-600 text-right">1-30 Hari</th>
                    <th className="px-4 py-3 font-medium text-wood-600 text-right">31-60 Hari</th>
                    <th className="px-4 py-3 font-medium text-wood-600 text-right">61-90 Hari</th>
                    <th className="px-4 py-3 font-medium text-wood-600 text-right">{">"}90 Hari</th>
                    <th className="px-4 py-3 font-medium text-wood-600 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-wood-100">
                  {allItems.map((party) => (
                    <tr key={party.partyId} className="hover:bg-wood-50 cursor-pointer" onClick={() => navigate(`/reports/aging/${party.partyId}`)}>
                      <td className="px-4 py-3 font-medium text-wood-800 underline decoration-dotted underline-offset-2 decoration-wood-300 hover:decoration-wood-600">
                        {party.partyName}
                        <svg className="inline-block h-3 w-3 ml-1 text-wood-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                      </td>
                      {party.buckets.map((bucket, i) => (
                        <td key={bucket.label + "-" + i} className="px-4 py-3 text-right text-wood-700">
                          {bucket.totalMinor > 0 ? formatIDR(bucket.totalMinor) : "—"}
                        </td>
                      ))}
                      {/* Fill remaining buckets if fewer than 5 */}
                      {Array.from({ length: Math.max(0, 5 - party.buckets.length) }, (_, idx) => (
                        <td key={`empty-${idx}`} className="px-4 py-3 text-right text-wood-300">—</td>
                      ))}
                      <td className="px-4 py-3 text-right font-semibold text-wood-800">{formatIDR(party.totalOutstanding)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-wood-50 font-semibold">
                  <tr>
                    <td className="px-4 py-3 text-wood-800">Total</td>
                    {allItems[0].buckets.map((_, i) => (
                      <td key={`total-${i}`} className="px-4 py-3 text-right text-wood-800">
                        {formatIDR(allItems.reduce((s, p) => s + (p.buckets[i]?.totalMinor ?? 0), 0))}
                      </td>
                    ))}
                    <td className="px-4 py-3 text-right text-wood-800">{formatIDR(totalOutstanding)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
        </Card>
      )}
    </div>
  );
}
