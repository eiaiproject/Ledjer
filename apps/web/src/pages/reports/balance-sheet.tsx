import { useCallback, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useOrganization, useOrgPermissions } from "@/hooks/useOrganization";
import { queryKeys } from "@/lib/query-keys";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ReportSkeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateLong, formatIDR } from "@/lib/utils";
import { exportBalanceSheetCsv } from "@/lib/csv-export";
import { exportBalanceSheetPdf } from "@/lib/pdf-export";
import { Refresh } from "reicon-react";
import { getBalanceSheet, type BalanceSheetItem } from "@/lib/api/reports";
import {
  useReportDate,
  ReportPermissionGate,
  ReportExportButtons,
  handleReportExport,
  ReportSectionMobile,
  ReportSectionRows,
} from "./_components";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { ReportShell } from "@/components/ui/report-shell";

// ── Canonical report model ──────────────────────────────────────────

type SectionId = "asset" | "liability" | "equity";

interface ReportSection {
  id: SectionId;
  label: string;
  items: BalanceSheetItem[];
}

interface ReportModel {
  sections: ReportSection[];
  totals: Record<SectionId, number>;
  totalLiabEquity: number;
  difference: number;
  isBalanced: boolean;
  hasData: boolean;
}

// ── Section labels ──────────────────────────────────────────────────

const SECTION_META: Record<SectionId, { label: string }> = {
  asset: { label: "Aset" },
  liability: { label: "Kewajiban" },
  equity: { label: "Ekuitas" },
};

const SECTION_ORDER: SectionId[] = ["asset", "liability", "equity"];

// ── Build canonical report model ────────────────────────────────────

function buildReportModel(data: BalanceSheetItem[]): ReportModel {
  const grouped: Record<string, BalanceSheetItem[]> = {};
  for (const section of SECTION_ORDER) grouped[section] = [];

  for (const item of data) {
    const key = item.section as SectionId;
    if (grouped[key]) grouped[key].push(item);
  }

  const totals: Record<SectionId, number> = {
    asset: 0,
    liability: 0,
    equity: 0,
  };

  for (const section of SECTION_ORDER) {
    totals[section] = grouped[section].reduce((s, i) => s + i.amount, 0);
  }

  const totalLiabEquity = totals.liability + totals.equity;
  const difference = totals.asset - totalLiabEquity;

  return {
    sections: SECTION_ORDER.map((id) => ({
      id,
      label: SECTION_META[id].label,
      items: grouped[id],
    })),
    totals,
    totalLiabEquity,
    difference,
    isBalanced: Math.abs(difference) < 1,
    hasData: data.length > 0,
  };
}

// ── Component ───────────────────────────────────────────────────────

export function BalanceSheetPage() {
  const { data: orgData } = useOrganization();
  const { canViewReports, canCreateExports } = useOrgPermissions();

  const {
    pendingDate, setPendingDate,
    appliedDate, dateInvalid, isPending,
    applyDate, syncPending,
  } = useReportDate();
  const [showZero, setShowZero] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: queryKeys.reports.balanceSheet(
      orgData?.organization?.id,
      appliedDate,
    ),
    queryFn: async () => {
      if (!orgData?.organization?.id) return [];
      return getBalanceSheet(appliedDate);
    },
    enabled: !!orgData?.organization?.id && canViewReports && !dateInvalid,
    staleTime: 0,
  });

  const handleApply = useCallback(() => { applyDate(); }, [applyDate]);

  const handleRefresh = useCallback(() => {
    syncPending();
    refetch();
  }, [syncPending, refetch]);

  if (!canViewReports) {
    return (
      <ReportPermissionGate>
        <div />
      </ReportPermissionGate>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Neraca</h1>
          <p className="text-sm text-text-secondary mt-1">
            Posisi aset, kewajiban, dan ekuitas per {formatDateLong(appliedDate)}.
          </p>
        </div>
        <ErrorState
          message="Neraca gagal dimuat. Periksa koneksi Anda, lalu coba lagi."
          onRetry={refetch}
        />
      </div>
    );
  }

  const report = buildReportModel(data || []);
  const isEmpty = !isLoading && !report.hasData;
  const isRefreshing = isFetching && !isLoading;

  // Filter zero-balance accounts when toggle is off
  const visibleSections = report.sections.map((section) => ({
    ...section,
    items: showZero
      ? section.items
      : section.items.filter((item) => item.amount !== 0),
  }));

  const showResults = report.hasData || visibleSections.some((s) => s.items.length > 0);

  const handleExport = async () => {
    await handleReportExport({
      orgId: orgData?.organization?.id,
      disabled: dateInvalid || exporting,
      exportFn: () => exportBalanceSheetCsv(appliedDate),
      onFinally: () => setExporting(false),
    });
  };

  const handleExportPdf = async () => {
    await handleReportExport({
      orgId: orgData?.organization?.id,
      disabled: dateInvalid || exportingPdf,
      exportFn: () => exportBalanceSheetPdf(appliedDate),
      onFinally: () => setExportingPdf(false),
    });
  };

  return (
    <ReportShell
      title="Neraca"
      helpTopic="balance_sheet"
      guide="reports/balance-sheet"
      description={isRefreshing ? "Memperbarui laporan..." : `Posisi aset, kewajiban, dan ekuitas per ${formatDateLong(appliedDate)}.`}
    >

      {/* Toolbar */}
      <Card>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleApply();
            }}
            className="flex flex-col sm:flex-row gap-3 items-end"
          >
            <Input
              label="Per tanggal"
              type="date"
              value={pendingDate}
              onChange={(e) => setPendingDate(e.target.value)}
              aria-invalid={dateInvalid || undefined}
              aria-describedby={dateInvalid ? "date-error" : undefined}
            />
            {dateInvalid && (
              <p id="date-error" className="text-sm text-error" role="alert">
                Format tanggal tidak valid.
              </p>
            )}
            <div className="flex gap-2 w-full sm:w-auto">
              <Button
                type="submit"
                variant={isPending ? "primary" : "outline"}
                disabled={dateInvalid || !pendingDate}
                loading={isLoading && !isRefreshing}
                className="flex-1 sm:flex-none"
              >
                {isRefreshing ? "Memperbarui..." : "Tampilkan laporan"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Muat ulang data"
                onClick={handleRefresh}
                disabled={isRefreshing}
              >
                <Refresh className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </form>
          <div className="flex flex-col sm:flex-row gap-3 items-end mt-3">
            <label className="flex items-center gap-2 text-sm text-wood-600">
              <input
                type="checkbox"
                checked={showZero}
                onChange={(e) => setShowZero(e.target.checked)}
                className="rounded border-wood-300"
              />
              <span>Tampilkan akun saldo nol</span>
            </label>
            {canCreateExports && (
              <ReportExportButtons
                className="sm:ml-auto"
                disabled={isLoading || isEmpty || dateInvalid}
                isExportingCsv={exporting}
                isExportingPdf={exportingPdf}
                onExportCsv={handleExport}
                onExportPdf={handleExportPdf}
                csvAriaLabel="Ekspor neraca ke CSV"
                pdfAriaLabel="Ekspor neraca ke PDF"
              />
            )}
          </div>
        </CardContent>
      </Card>

      {/* Loading */}
      {isLoading && <ReportSkeleton rows={8} cols={2} />}

      {/* Empty */}
      {isEmpty && (
        <EmptyState
          title="Belum ada saldo akun per tanggal ini"
          description="Pilih tanggal lain atau catat transaksi terlebih dahulu."
        />
      )}

      {/* Report */}
      {!isLoading && showResults && (
        <>
          {/* ── Mobile ──────────────────────────────────────── */}
          <ul className="space-y-4 sm:hidden list-none p-0 m-0" aria-label="Neraca">
            <ReportMobile sections={visibleSections} report={report} />
          </ul>

          {/* ── Desktop table ───────────────────────────────── */}
          <Card className="hidden sm:block">
            <div className="ledger-scroll-x">
              <table className="ledger-table min-w-0">
                <caption className="sr-only">
                  Neraca per {formatDateLong(appliedDate)}
                </caption>
                <thead>
                  <tr className="border-b border-wood-200">
                    <th scope="col" className="px-5 py-3 text-left font-medium text-wood-600">
                      Akun
                    </th>
                    <th scope="col" className="px-5 py-3 text-right font-medium text-wood-600">
                      Jumlah
                    </th>
                  </tr>
                </thead>
                <ReportTableBody sections={visibleSections} report={report} />
              </table>
            </div>
          </Card>

          {/* ── Equation summary ────────────────────────────── */}
          <EquationSummary report={report} />
        </>
      )}
    </ReportShell>
  );
}

// ── Equation summary card ───────────────────────────────────────────

function EquationSummary({ report }: { readonly report: ReportModel }) {
  if (!report.hasData) return null;

  return (
    <Card>
      <CardContent>
        <div className="flex items-center gap-1 mb-3">
          <h3 className="text-sm font-semibold text-wood-700">Persamaan Akuntansi</h3>
          <HelpTooltip topic="equity" size="sm" />
        </div>
        <div className="space-y-2">
          <div className="flex min-w-0 items-center justify-between gap-4">
            <span className="text-sm text-wood-600">Total Aset</span>
            <span className="break-words text-right font-bold tabular-nums text-wood-800">
              {formatIDR(report.totals.asset)}
            </span>
          </div>
          <div className="flex min-w-0 items-center justify-between gap-4">
            <span className="text-sm text-wood-600">Total Kewajiban</span>
            <span className="break-words text-right font-bold tabular-nums text-wood-800">
              {formatIDR(report.totals.liability)}
            </span>
          </div>
          <div className="flex min-w-0 items-center justify-between gap-4">
            <span className="text-sm text-wood-600">Total Ekuitas</span>
            <span className="break-words text-right font-bold tabular-nums text-wood-800">
              {formatIDR(report.totals.equity)}
            </span>
          </div>
          <div className="flex min-w-0 items-center justify-between gap-4 pt-2 border-t border-wood-200">
            <span className="text-sm font-semibold text-wood-700">Kewajiban + Ekuitas</span>
            <span className="break-words text-right font-bold tabular-nums text-wood-800">
              {formatIDR(report.totalLiabEquity)}
            </span>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-wood-200">
          {report.isBalanced ? (
            <p className="text-sm font-medium text-leaf-600">Neraca seimbang</p>
          ) : (
            <p className="text-sm font-medium text-error" role="alert">
              Neraca tidak seimbang. Selisih: {formatIDR(Math.abs(report.difference))}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Mobile renderer ─────────────────────────────────────────────────

function ReportMobile({
  sections,
  report,
}: {
  readonly sections: ReportSection[];
  readonly report: ReportModel;
}) {
  return (
    <>
      {/* Assets */}
      <ReportSectionMobile section={sections[0]} showTotal emptyText="Tidak ada saldo" />

      {/* Liabilities */}
      <ReportSectionMobile section={sections[1]} showTotal emptyText="Tidak ada saldo" />

      {/* Equity */}
      <ReportSectionMobile section={sections[2]} showTotal emptyText="Tidak ada saldo" />

      {/* Final total: Kewajiban + Ekuitas */}
      <li
        className="flex items-center justify-between px-4 py-3 rounded-lg border border-wood-200 border-t-2 border-t-wood-800 bg-cream-100/70 list-none"
      >
        <span className="text-base font-bold text-text-primary">Kewajiban + Ekuitas</span>
        <span className="text-base font-bold text-wood-800 tabular-nums">
          {formatIDR(report.totalLiabEquity)}
        </span>
      </li>
    </>
  );
}

// ── Desktop table body ──────────────────────────────────────────────

function ReportTableBody({
  sections,
  report,
}: {
  readonly sections: ReportSection[];
  readonly report: ReportModel;
}) {
  return (
    <>
      {/* Assets tbody */}
      <tbody>
        <ReportSectionRows section={sections[0]} showTotal emptyText="Tidak ada saldo" />
      </tbody>

      {/* Liabilities tbody */}
      <tbody>
        <ReportSectionRows section={sections[1]} showTotal emptyText="Tidak ada saldo" />
      </tbody>

      {/* Equity tbody */}
      <tbody>
        <ReportSectionRows section={sections[2]} showTotal emptyText="Tidak ada saldo" />
      </tbody>

      {/* Kewajiban + Ekuitas total */}
      <tbody>
        <tr className="border-t-2 border-wood-800 bg-cream-100/70">
          <td scope="row" className="px-5 py-3 font-bold text-text-primary">
            Kewajiban + Ekuitas
          </td>
          <td className="px-5 py-3 text-right font-bold tabular-nums text-wood-800">
            {formatIDR(report.totalLiabEquity)}
          </td>
        </tr>
      </tbody>
    </>
  );
}
