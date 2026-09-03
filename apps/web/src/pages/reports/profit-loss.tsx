import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useOrganization } from "@/hooks/useOrganization";
import { getProfitLoss } from "@/lib/api/reports";
import { queryKeys } from "@/lib/query-keys";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { formatIDR, formatDateLong, monthRange } from "@/lib/utils";
import { ReportSection } from "./report-section";

export function ProfitLossPage() {
  const { data: orgData } = useOrganization();
  const orgId = orgData?.organization?.id;
  const initialRange = monthRange();

  const [fromDate, setFromDate] = useState(initialRange.from);
  const [toDate, setToDate] = useState(initialRange.to);
  const [submittedFrom, setSubmittedFrom] = useState(initialRange.from);
  const [submittedTo, setSubmittedTo] = useState(initialRange.to);

  const query = useQuery({
    queryKey: queryKeys.reports.profitLoss(orgId, submittedFrom, submittedTo),
    queryFn: async () => {
      if (!orgId) throw new Error("No organization");
      return getProfitLoss(submittedFrom, submittedTo);
    },
    enabled: !!orgId,
  });

  const report = query.data;

  let reportContent: ReactNode = null;
  if (query.isLoading) {
    reportContent = <div className="h-48 animate-pulse rounded-xl bg-wood-100" />;
  } else if (query.isError) {
    reportContent = (
      <ErrorState title="Gagal memuat laporan" message="Terjadi kesalahan saat menghitung laba rugi." onRetry={() => query.refetch()} />
    );
  } else if (report) {
    reportContent = (
      <>
        <p className="text-sm text-text-secondary">
          Periode {formatDateLong(report.fromDate)} – {formatDateLong(report.toDate)}
        </p>

        <Card elevated>
          <CardContent className="p-0">
            <ReportSection
              title="Pendapatan"
              total={report.income.total}
              lines={report.income.accounts}
              emptyText="Belum ada transaksi pada periode ini."
            />
            <ReportSection
              title="Beban"
              total={report.expense.total}
              lines={report.expense.accounts}
              emptyText="Belum ada transaksi pada periode ini."
            />
            <div className="flex items-center justify-between gap-4 border-t-2 border-wood-300 bg-cream-100 px-5 py-4">
              <p className="text-sm font-semibold text-text-primary">Laba Bersih</p>
              <p
                className={`num-mono text-base font-bold ${
                  report.netIncome >= 0 ? "text-leaf-700" : "text-clay-700"
                }`}
              >
                {formatIDR(report.netIncome)}
              </p>
            </div>
          </CardContent>
        </Card>
      </>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Laba Rugi" description="Pendapatan dan beban pada periode tertentu." />

      <Card elevated>
        <CardContent className="p-4">
          <form
            className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]"
            onSubmit={(e) => {
              e.preventDefault();
              setSubmittedFrom(fromDate);
              setSubmittedTo(toDate);
            }}
          >
            <Input label="Dari" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            <Input label="Sampai" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
            <Button type="submit" className="sm:mb-0">
              Tampilkan
            </Button>
          </form>
        </CardContent>
      </Card>

      {reportContent}
    </div>
  );
}
