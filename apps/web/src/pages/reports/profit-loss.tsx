import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useOrganization } from "@/hooks/useOrganization";
import { getProfitLoss, type ReportAccountLine } from "@/lib/api/reports";
import { queryKeys } from "@/lib/query-keys";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { formatIDR, formatDateLong, monthRange } from "@/lib/utils";

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

      {query.isLoading ? (
        <div className="h-48 animate-pulse rounded-xl bg-wood-100" />
      ) : query.isError ? (
        <ErrorState title="Gagal memuat laporan" message="Terjadi kesalahan saat menghitung laba rugi." onRetry={() => query.refetch()} />
      ) : report ? (
        <>
          <p className="text-sm text-text-secondary">
            Periode {formatDateLong(report.fromDate)} – {formatDateLong(report.toDate)}
          </p>

          <Card elevated>
            <CardContent className="p-0">
              <SectionHeader title="Pendapatan" total={report.income.total} />
              <AccountLines lines={report.income.accounts} />
              <SectionHeader title="Beban" total={report.expense.total} />
              <AccountLines lines={report.expense.accounts} />
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
      ) : null}
    </div>
  );
}

function SectionHeader({ title, total }: { readonly title: string; readonly total: number }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-wood-100 bg-cream-50 px-5 py-3">
      <p className="text-sm font-semibold text-text-primary">{title}</p>
      <p className="num-mono text-sm font-semibold text-text-primary">{formatIDR(total)}</p>
    </div>
  );
}

function AccountLines({ lines }: { readonly lines: ReportAccountLine[] }) {
  if (lines.length === 0) {
    return (
      <p className="border-b border-wood-100 px-5 py-4 text-sm text-text-tertiary">
        Belum ada transaksi pada periode ini.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-wood-100 border-b border-wood-100">
      {lines.map((line) => (
        <li key={line.code} className="flex items-center justify-between gap-4 px-5 py-3">
          <p className="min-w-0 break-words text-sm text-text-secondary">
            <span className="num-mono text-text-tertiary">{line.code}</span> · {line.name}
          </p>
          <p className="num-mono shrink-0 text-sm text-text-primary">{formatIDR(line.amount)}</p>
        </li>
      ))}
    </ul>
  );
}