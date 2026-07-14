import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useOrganization, useOrgPermissions } from "@/hooks/useOrganization";
import { queryKeys } from "@/lib/query-keys";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ReportSkeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateInputValue, formatDateLong, formatIDR } from "@/lib/utils";
import { toast } from "@/components/ui/toast";
import { translateError } from "@/lib/errors";
import { exportBalanceSheetCsv } from "@/lib/csv-export";
import { Download, RefreshCw } from "lucide-react";
import { getBalanceSheet, type BalanceSheetItem } from "@/lib/api/reports";

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

  // Pending = what user typed, Applied = what's displayed
  const [pendingDate, setPendingDate] = useState(formatDateInputValue());
  const [appliedDate, setAppliedDate] = useState(formatDateInputValue());
  const [showZero, setShowZero] = useState(false);
  const [exporting, setExporting] = useState(false);

  const dateInvalid = !pendingDate || !/^\d{4}-\d{2}-\d{2}$/.test(pendingDate);
  const isPending = pendingDate !== appliedDate;

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

  const handleApply = useCallback(() => {
    if (dateInvalid || !pendingDate) return;
    setAppliedDate(pendingDate);
  }, [pendingDate, dateInvalid, setAppliedDate]);

  const handleRefresh = useCallback(() => {
    setPendingDate(appliedDate);
    refetch();
  }, [appliedDate, refetch, setPendingDate]);

  if (!canViewReports) {
    return (
      <Card>
        <CardContent className="text-center py-8">
          <p className="text-wood-500">Anda tidak memiliki izin untuk melihat laporan ini.</p>
        </CardContent>
      </Card>
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
    if (!orgData?.organization?.id || dateInvalid || exporting) return;
    setExporting(true);
    try {
      await exportBalanceSheetCsv(appliedDate);
      toast.success("Ekspor neraca ke CSV dimulai");
    } catch (err) {
      toast.error(translateError(err));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Neraca</h1>
        <p className="text-sm text-text-secondary mt-1" aria-live="polite">
          {isRefreshing ? (
            <span className="text-text-secondary">Memperbarui laporan...</span>
          ) : (
            `Posisi aset, kewajiban, dan ekuitas per ${formatDateLong(appliedDate)}.`
          )}
        </p>
      </div>

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
                <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
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
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label="Ekspor neraca ke CSV"
                onClick={handleExport}
                disabled={exporting || isLoading || isEmpty || dateInvalid}
                loading={exporting}
                className="sm:ml-auto"
              >
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline">Ekspor CSV</span>
                <span className="sm:hidden">Ekspor</span>
              </Button>
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
          <div className="space-y-4 sm:hidden" role="list" aria-label="Neraca">
            <ReportMobile sections={visibleSections} report={report} />
          </div>

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
    </div>
  );
}

// ── Equation summary card ───────────────────────────────────────────

function EquationSummary({ report }: { readonly report: ReportModel }) {
  if (!report.hasData) return null;

  return (
    <Card>
      <CardContent>
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
      <SectionMobile section={sections[0]} showTotal />

      {/* Liabilities */}
      <SectionMobile section={sections[1]} showTotal />

      {/* Equity */}
      <SectionMobile section={sections[2]} showTotal />

      {/* Final total: Kewajiban + Ekuitas */}
      <div
        className="flex items-center justify-between px-4 py-3 rounded-lg border border-wood-200 border-t-2 border-t-wood-800 bg-cream-100/70"
        role="listitem"
      >
        <span className="text-base font-bold text-text-primary">Kewajiban + Ekuitas</span>
        <span className="text-base font-bold text-wood-800 tabular-nums">
          {formatIDR(report.totalLiabEquity)}
        </span>
      </div>
    </>
  );
}

function SectionMobile({
  section,
  showTotal,
}: {
  readonly section: ReportSection;
  readonly showTotal?: boolean;
}) {
  const total = section.items.reduce((s, i) => s + i.amount, 0);

  return (
    <div className="rounded-lg border border-wood-200 overflow-hidden" role="listitem">
      <div className="bg-cream-100/50 px-4 py-2.5">
        <p className="text-sm font-semibold text-wood-700">{section.label}</p>
      </div>
      {section.items.length === 0 && (
        <div className="px-4 py-3 border-t border-wood-100">
          <p className="text-sm text-wood-400">Tidak ada saldo</p>
        </div>
      )}
      {section.items.map((item) => (
        <div
          key={item.account_code}
          className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 border-t border-wood-100 px-4 py-2.5"
        >
          <div className="min-w-0 flex-1">
            <p className="break-words text-sm text-wood-700">{item.account_name}</p>
            <p className="font-mono text-xs text-wood-400">{item.account_code}</p>
          </div>
          <span className="shrink-0 text-right font-mono text-sm text-wood-800 tabular-nums">
            {formatIDR(item.amount)}
          </span>
        </div>
      ))}
      {showTotal && (
        <div className="flex items-center justify-between border-t border-wood-200 bg-cream-100/30 px-4 py-2.5">
          <span className="text-sm font-semibold text-wood-700">
            Total {section.label}
          </span>
          <span className="font-mono text-sm font-bold text-wood-800 tabular-nums">
            {formatIDR(total)}
          </span>
        </div>
      )}
    </div>
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
        <SectionRows section={sections[0]} showTotal />
      </tbody>

      {/* Liabilities tbody */}
      <tbody>
        <SectionRows section={sections[1]} showTotal />
      </tbody>

      {/* Equity tbody */}
      <tbody>
        <SectionRows section={sections[2]} showTotal />
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

function SectionRows({
  section,
  showTotal,
}: {
  readonly section: ReportSection;
  readonly showTotal?: boolean;
}) {
  const total = section.items.reduce((s, i) => s + i.amount, 0);

  return (
    <>
      <tr className="border-b border-wood-100 bg-cream-100/50">
        <td
          colSpan={2}
          scope="rowgroup"
          className="px-5 py-2 font-semibold text-wood-700"
        >
          {section.label}
        </td>
      </tr>
      {section.items.length === 0 && (
        <tr className="border-b border-wood-50">
          <td colSpan={2} className="px-5 py-2 pl-8 text-sm text-wood-400 italic">
            Tidak ada saldo
          </td>
        </tr>
      )}
      {section.items.map((item) => (
        <tr key={item.account_code} className="border-b border-wood-50">
          <td className="min-w-0 max-w-[520px] break-words px-5 py-2 pl-8 text-wood-600">
            <span className="font-mono text-xs text-wood-500 mr-2">{item.account_code}</span>
            {item.account_name}
          </td>
          <td className="px-5 py-2 text-right tabular-nums text-wood-800">
            {formatIDR(item.amount)}
          </td>
        </tr>
      ))}
      {showTotal && (
        <tr className="border-b border-wood-200 bg-cream-100/30">
          <td scope="row" className="px-5 py-2.5 font-semibold text-wood-700">
            Total {section.label}
          </td>
          <td className="px-5 py-2.5 text-right font-bold tabular-nums text-wood-800">
            {formatIDR(total)}
          </td>
        </tr>
      )}
    </>
  );
}
