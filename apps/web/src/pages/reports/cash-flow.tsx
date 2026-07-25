import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useOrganization, useOrgPermissions } from "@/hooks/useOrganization";
import { queryKeys } from "@/lib/query-keys";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatIDR, formatShortDate } from "@/lib/utils";
import { getCashFlowReport, type CashFlowReport } from "@/lib/api/reports";
import { ReportPermissionGate } from "./_components";

const SECTION_LABELS: Record<string, string> = {
  operating: "Aktivitas Operasi",
  investing: "Aktivitas Investasi",
  financing: "Aktivitas Pendanaan",
};

const SECTION_COLORS: Record<string, string> = {
  operating: "border-l-emerald-500",
  investing: "border-l-blue-500",
  financing: "border-l-violet-500",
};

function CashFlowTable({ report }: { report: CashFlowReport }) {
  return (
    <div className="space-y-8">
      {(["operating", "investing", "financing"] as const).map((section) => {
        const sectionRows = report.rows.filter((r) => r.section === section);
        const total = report.totals[section];
        if (sectionRows.length === 0 && total === 0) return null;

        return (
          <div key={section} className={cn("border-l-4 pl-4", SECTION_COLORS[section])}>
            <h3 className="mb-3 text-base font-semibold text-wood-800">{SECTION_LABELS[section]}</h3>
            <div className="overflow-x-auto rounded-lg border border-wood-200">
              <table className="w-full text-left text-sm">
                <thead className="bg-wood-50">
                  <tr>
                    <th className="px-4 py-2.5 font-medium text-wood-600">Transaksi</th>
                    <th className="px-4 py-2.5 font-medium text-wood-600 text-right">Masuk (Rp)</th>
                    <th className="px-4 py-2.5 font-medium text-wood-600 text-right">Keluar (Rp)</th>
                    <th className="px-4 py-2.5 font-medium text-wood-600 text-right">Bersih (Rp)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-wood-100">
                  {sectionRows.map((row, i) => (
                    <tr key={`${row.transactionType}-${i}`} className="hover:bg-wood-50">
                      <td className="px-4 py-2 text-wood-700">{row.label}</td>
                      <td className="px-4 py-2 text-right text-wood-700">{row.inflow > 0 ? formatIDR(row.inflow) : "—"}</td>
                      <td className="px-4 py-2 text-right text-wood-700">{row.outflow > 0 ? formatIDR(row.outflow) : "—"}</td>
                      <td className={cn("px-4 py-2 text-right font-medium", row.net >= 0 ? "text-emerald-600" : "text-red-600")}>
                        {formatIDR(row.net)}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-wood-50/50 font-semibold">
                    <td className="px-4 py-2 text-wood-800">Subtotal {SECTION_LABELS[section]}</td>
                    <td colSpan={2} />
                    <td className={cn("px-4 py-2 text-right", total >= 0 ? "text-emerald-600" : "text-red-600")}>
                      {formatIDR(total)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {/* Summary */}
      <Card>
        <CardContent className="p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-wood-600">Saldo Awal Kas</span>
            <span className="font-medium text-wood-800">{formatIDR(report.totals.openingCash)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-wood-600">Arus Kas Bersih</span>
            <span className={cn("font-medium", report.totals.netCashFlow >= 0 ? "text-emerald-600" : "text-red-600")}>
              {formatIDR(report.totals.netCashFlow)}
            </span>
          </div>
          <div className="border-t border-wood-200 pt-2 flex justify-between text-base">
            <span className="font-semibold text-wood-800">Saldo Akhir Kas</span>
            <span className="font-semibold text-wood-800">{formatIDR(report.totals.closingCash)}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function CashFlowPage() {
  const { data: orgData, isLoading: orgLoading } = useOrganization();
  const permissions = useOrgPermissions();
  const orgId = orgData?.organization?.id;
  const today = new Date().toISOString().slice(0, 10);
  const firstDay = `${today.slice(0, 7)}-01`;
  const [fromDate, setFromDate] = useState(firstDay);
  const [toDate, setToDate] = useState(today);
  const [appliedFrom, setAppliedFrom] = useState(firstDay);
  const [appliedTo, setAppliedTo] = useState(today);

  const { data: report, isLoading, isError, error } = useQuery({
    queryKey: queryKeys.reports.cashFlow(appliedFrom, appliedTo),
    queryFn: () => getCashFlowReport(appliedFrom, appliedTo),
    enabled: !!orgId && permissions.canViewReports,
  });

  if (orgLoading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <ReportPermissionGate>
      {/* Filter bar */}
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="cf-from" className="mb-1 block text-xs font-medium text-wood-600">Dari Tanggal</label>
          <Input id="cf-from" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-44" />
        </div>
        <div>
          <label htmlFor="cf-to" className="mb-1 block text-xs font-medium text-wood-600">Sampai Tanggal</label>
          <Input id="cf-to" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-44" />
        </div>
        <Button
          onClick={() => { setAppliedFrom(fromDate); setAppliedTo(toDate); }}
          disabled={isLoading}
        >
          Tampilkan
        </Button>
      </div>

      {isLoading && (
        <div className="space-y-4">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      )}

      {isError && (
        <ErrorState message={(error as Error)?.message ?? "Gagal memuat laporan arus kas"} />
      )}

      {report && report.rows.length === 0 && report.totals.openingCash === 0 && (
        <EmptyState title="Belum Ada Arus Kas" description="Belum ada transaksi tunai pada periode ini." />
      )}

      {report && (report.rows.length > 0 || report.totals.openingCash !== 0) && (
        <>
          <p className="mb-4 text-xs text-wood-400">
            Periode: {formatShortDate(appliedFrom)} — {formatShortDate(appliedTo)}
          </p>
          <CashFlowTable report={report} />
        </>
      )}
    </ReportPermissionGate>
  );
}
