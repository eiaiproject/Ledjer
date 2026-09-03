import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useOrganization } from "@/hooks/useOrganization";
import { getBalanceSheet } from "@/lib/api/reports";
import { queryKeys } from "@/lib/query-keys";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ErrorState } from "@/components/ui/error-state";
import { formatIDR, formatDateLong, localDate } from "@/lib/utils";
import { ReportSection } from "./report-section";

export function BalanceSheetPage() {
  const { data: orgData } = useOrganization();
  const orgId = orgData?.organization?.id;

  const [asOfDate, setAsOfDate] = useState(localDate());
  const [submittedDate, setSubmittedDate] = useState(localDate());

  const query = useQuery({
    queryKey: queryKeys.reports.balanceSheet(orgId, submittedDate),
    queryFn: async () => {
      if (!orgId) throw new Error("No organization");
      return getBalanceSheet(submittedDate);
    },
    enabled: !!orgId,
  });

  const report = query.data;

  let reportContent: ReactNode = null;
  if (query.isLoading) {
    reportContent = <div className="h-48 animate-pulse rounded-xl bg-wood-100" />;
  } else if (query.isError) {
    reportContent = (
      <ErrorState title="Gagal memuat laporan" message="Terjadi kesalahan saat menghitung neraca." onRetry={() => query.refetch()} />
    );
  } else if (report) {
    reportContent = (
      <>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-text-secondary">Per {formatDateLong(report.asOfDate)}</p>
          {report.balanced ? (
            <Badge variant="success" size="md">
              Neraca Seimbang
            </Badge>
          ) : (
            <Badge variant="error" size="md">
              Neraca Tidak Seimbang
            </Badge>
          )}
        </div>

        <Card elevated>
          <CardContent className="p-0">
            <ReportSection
              title="Aset"
              total={report.totalAssets}
              lines={report.assets}
              emptyText="Tidak ada saldo untuk kelompok ini."
            />
            <ReportSection
              title="Liabilitas"
              total={report.totalLiabilities}
              lines={report.liabilities}
              emptyText="Tidak ada saldo untuk kelompok ini."
            />
            <ReportSection
              title="Ekuitas"
              total={report.totalEquity}
              lines={report.equity}
              emptyText="Tidak ada saldo untuk kelompok ini."
            />

            <div className="flex items-center justify-between gap-4 border-t-2 border-wood-300 bg-cream-100 px-5 py-4">
              <p className="text-sm font-semibold text-text-primary">
                Total Aset = Liabilitas + Ekuitas
              </p>
              <p className="num-mono text-sm font-semibold text-text-primary">
                {formatIDR(report.totalAssets)}
              </p>
            </div>
          </CardContent>
        </Card>
      </>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Neraca" description="Posisi aset, liabilitas, dan ekuitas pada tanggal tertentu." />

      <Card elevated>
        <CardContent className="p-4">
          <form
            className="grid items-end gap-3 sm:grid-cols-[1fr_auto]"
            onSubmit={(e) => {
              e.preventDefault();
              setSubmittedDate(asOfDate);
            }}
          >
            <Input label="Tanggal" type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} />
            <Button type="submit">Tampilkan</Button>
          </form>
        </CardContent>
      </Card>

      {reportContent}
    </div>
  );
}
