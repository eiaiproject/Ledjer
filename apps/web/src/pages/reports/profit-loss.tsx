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
import { formatDateInputValue, formatDateRange, formatIDR } from "@/lib/utils";
import { toast } from "@/components/ui/toast";
import { translateError } from "@/lib/errors";
import { exportProfitLossCsv } from "@/lib/csv-export";
import { Download, RefreshCw } from "lucide-react";
import { getProfitLoss, type ProfitLossItem } from "@/lib/api/reports";

// ── Canonical report model ──────────────────────────────────────────

type SectionId =
  | "revenue"
  | "cogs"
  | "expense"
  | "other_income"
  | "other_expense";

interface ReportSection {
  id: SectionId;
  label: string;
  items: ProfitLossItem[];
}

interface ReportModel {
  sections: ReportSection[];
  totals: Record<SectionId, number>;
  grossResult: number;
  operatingResult: number;
  otherIncomeTotal: number;
  otherExpenseTotal: number;
  netResult: number;
  hasData: boolean;
}

// ── Section labels ──────────────────────────────────────────────────

const SECTION_META: Record<SectionId, { label: string }> = {
  revenue: { label: "Pendapatan" },
  cogs: { label: "Harga Pokok Penjualan" },
  expense: { label: "Beban Operasional" },
  other_income: { label: "Pendapatan Lain" },
  other_expense: { label: "Beban Lain" },
};

const SECTION_ORDER: SectionId[] = [
  "revenue",
  "cogs",
  "expense",
  "other_income",
  "other_expense",
];

// ── Build canonical report model ────────────────────────────────────

function buildReportModel(data: ProfitLossItem[]): ReportModel {
  const grouped: Record<string, ProfitLossItem[]> = {};
  for (const section of SECTION_ORDER) grouped[section] = [];

  for (const item of data) {
    const key = item.section as SectionId;
    if (grouped[key]) grouped[key].push(item);
  }

  const totals: Record<SectionId, number> = {
    revenue: 0,
    cogs: 0,
    expense: 0,
    other_income: 0,
    other_expense: 0,
  };

  for (const section of SECTION_ORDER) {
    totals[section] = grouped[section].reduce((s, i) => s + i.amount, 0);
  }

  const grossResult = totals.revenue - totals.cogs;
  const operatingResult = grossResult - totals.expense;
  const netResult = operatingResult + totals.other_income - totals.other_expense;

  return {
    sections: SECTION_ORDER.map((id) => ({
      id,
      label: SECTION_META[id].label,
      items: grouped[id],
    })),
    totals,
    grossResult,
    operatingResult,
    otherIncomeTotal: totals.other_income,
    otherExpenseTotal: totals.other_expense,
    netResult,
    hasData: data.length > 0,
  };
}

// ── Dynamic result labels ───────────────────────────────────────────

function resultLabel(value: number, gain: string, loss: string): string {
  return value >= 0 ? gain : loss;
}

// ── Component ───────────────────────────────────────────────────────

export function ProfitLossPage() {
  const { data: orgData } = useOrganization();
  const { canViewReports, canCreateExports } = useOrgPermissions();

  const today = new Date();
  const firstDayOfMonth = formatDateInputValue(
    new Date(today.getFullYear(), today.getMonth(), 1),
  );

  // Pending = what user typed, Applied = what's displayed
  const [pendingFrom, setPendingFrom] = useState(firstDayOfMonth);
  const [pendingTo, setPendingTo] = useState(formatDateInputValue(today));
  const [appliedFrom, setAppliedFrom] = useState(firstDayOfMonth);
  const [appliedTo, setAppliedTo] = useState(formatDateInputValue(today));
  const [showInactive, setShowInactive] = useState(false);
  const [exporting, setExporting] = useState(false);

  const dateRangeInvalid = pendingFrom > pendingTo;
  const isPending = pendingFrom !== appliedFrom || pendingTo !== appliedTo;

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: queryKeys.reports.profitLoss(
      orgData?.organization?.id,
      appliedFrom,
      appliedTo,
    ),
    queryFn: async () => {
      if (!orgData?.organization?.id) return [];
      return getProfitLoss(appliedFrom, appliedTo);
    },
    enabled: !!orgData?.organization?.id && canViewReports && !dateRangeInvalid,
    staleTime: 0,
  });

  const handleApply = useCallback(() => {
    if (dateRangeInvalid || !pendingFrom || !pendingTo) return;
    setAppliedFrom(pendingFrom);
    setAppliedTo(pendingTo);
  }, [pendingFrom, pendingTo, dateRangeInvalid, setAppliedFrom, setAppliedTo]);

  const handleRefresh = useCallback(() => {
    setPendingFrom(appliedFrom);
    setPendingTo(appliedTo);
    refetch();
  }, [appliedFrom, appliedTo, refetch, setPendingFrom, setPendingTo]);

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
          <h1 className="text-2xl font-bold text-text-primary">Laba Rugi</h1>
          <p className="text-sm text-text-secondary mt-1">
            {formatDateRange(appliedFrom, appliedTo)}
          </p>
        </div>
        <ErrorState
          message="Laporan laba rugi gagal dimuat. Periksa koneksi Anda, lalu coba lagi."
          onRetry={refetch}
        />
      </div>
    );
  }

  const report = buildReportModel(data || []);
  const isEmpty = !isLoading && !report.hasData;
  const isRefreshing = isFetching && !isLoading;

  // Filter inactive accounts when toggle is off
  const visibleSections = report.sections.map((section) => ({
    ...section,
    items: showInactive
      ? section.items
      : section.items.filter((item) => item.amount !== 0),
  }));

  // Check if all visible accounts are hidden
  const totalVisibleAccounts = visibleSections.reduce(
    (s, sec) => s + sec.items.length,
    0,
  );
  const showResults = report.hasData || totalVisibleAccounts > 0;

  const handleExport = async () => {
    if (!orgData?.organization?.id || dateRangeInvalid || exporting) return;
    setExporting(true);
    try {
      await exportProfitLossCsv(appliedFrom, appliedTo);
      toast.success("Ekspor laporan laba rugi ke CSV dimulai");
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
        <h1 className="text-2xl font-bold text-text-primary">Laba Rugi</h1>
        <p className="text-sm text-text-secondary mt-1" aria-live="polite">
          {isRefreshing ? (
            <span className="text-text-secondary">Memperbarui laporan...</span>
          ) : (
            formatDateRange(appliedFrom, appliedTo)
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
              label="Dari tanggal"
              type="date"
              value={pendingFrom}
              onChange={(e) => setPendingFrom(e.target.value)}
              aria-invalid={dateRangeInvalid || undefined}
              aria-describedby={dateRangeInvalid ? "date-range-error" : undefined}
            />
            <Input
              label="Sampai tanggal"
              type="date"
              value={pendingTo}
              onChange={(e) => setPendingTo(e.target.value)}
              aria-invalid={dateRangeInvalid || undefined}
              aria-describedby={dateRangeInvalid ? "date-range-error" : undefined}
            />
            {dateRangeInvalid && (
              <p id="date-range-error" className="text-sm text-error" role="alert">
                Tanggal awal tidak boleh setelah tanggal akhir.
              </p>
            )}
            <div className="flex gap-2 w-full sm:w-auto">
              <Button
                type="submit"
                variant={isPending ? "primary" : "outline"}
                disabled={dateRangeInvalid || (!isPending && !pendingFrom && !pendingTo)}
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
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
                className="rounded border-wood-300"
              />
              Tampilkan akun tanpa aktivitas
            </label>
            {canCreateExports && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label="Ekspor laporan laba rugi ke CSV"
                onClick={handleExport}
                disabled={exporting || isLoading || isEmpty || dateRangeInvalid}
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
      {isLoading && <ReportSkeleton rows={10} cols={2} />}

      {/* Empty */}
      {isEmpty && (
        <EmptyState
          title="Belum ada aktivitas pendapatan atau beban pada periode ini"
          description="Ubah periode atau catat transaksi bisnis terlebih dahulu."
        />
      )}

      {/* Report */}
      {!isLoading && showResults && (
        <>
          {/* ── Mobile ──────────────────────────────────────── */}
          <div className="space-y-4 sm:hidden" role="list" aria-label="Laporan laba rugi">
            <ReportMobile
              sections={visibleSections}
              report={report}
            />
          </div>

          {/* ── Desktop table ───────────────────────────────── */}
          <Card className="hidden sm:block">
            <div className="ledger-scroll-x">
              <table className="ledger-table min-w-0 sm:min-w-[480px]">
                <caption className="sr-only">
                  Laporan laba rugi periode {formatDateRange(appliedFrom, appliedTo)}
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
                <ReportTableBody
                  sections={visibleSections}
                  report={report}
                />
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
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
      {/* Revenue */}
      <SectionMobile section={sections[0]} showTotal />
      {/* COGS */}
      <SectionMobile section={sections[1]} showTotal />

      {/* Gross Result */}
      <ResultRow
        label={resultLabel(report.grossResult, "Laba Kotor", "Rugi Kotor")}
        value={report.grossResult}
        variant="intermediate"
      />

      {/* Operating Expenses */}
      <SectionMobile section={sections[2]} showTotal />

      {/* Operating Result */}
      <ResultRow
        label={resultLabel(report.operatingResult, "Laba Operasional", "Rugi Operasional")}
        value={report.operatingResult}
        variant="intermediate"
      />

      {/* Other Income */}
      <SectionMobile section={sections[3]} showTotal />

      {/* Other Expense */}
      <SectionMobile section={sections[4]} showTotal />

      {/* Net Result */}
      <ResultRow
        label={resultLabel(report.netResult, "Laba Bersih", "Rugi Bersih")}
        value={report.netResult}
        variant="final"
      />
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
          <p className="text-sm text-wood-400">Tidak ada akun</p>
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

function ResultRow({
  label,
  value,
  variant,
}: {
  readonly label: string;
  readonly value: number;
  readonly variant: "intermediate" | "final";
}) {
  const borderClass =
    variant === "final" ? "border-t-2 border-wood-800" : "border-t border-wood-200";
  const bgClass = variant === "final" ? "bg-cream-100/70" : "";
  const textClass =
    variant === "final"
      ? "text-base font-bold text-text-primary"
      : "text-sm font-semibold text-wood-700";
  const valueClass =
    variant === "final"
      ? "text-base font-bold text-wood-800 tabular-nums"
      : "text-sm font-bold text-wood-800 tabular-nums";

  return (
    <div
      className={`flex items-center justify-between px-4 py-3 rounded-lg border border-wood-200 ${borderClass} ${bgClass}`}
      role="listitem"
    >
      <span className={textClass}>{label}</span>
      <span className={valueClass}>{formatIDR(value)}</span>
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
      {/* Revenue tbody */}
      <tbody>
        <SectionRows section={sections[0]} showTotal />
      </tbody>

      {/* COGS tbody */}
      <tbody>
        <SectionRows section={sections[1]} showTotal />
      </tbody>

      {/* Gross Result */}
      <tbody>
        <ResultRowDesktop
          label={resultLabel(report.grossResult, "Laba Kotor", "Rugi Kotor")}
          value={report.grossResult}
          variant="intermediate"
        />
      </tbody>

      {/* Operating Expenses tbody */}
      <tbody>
        <SectionRows section={sections[2]} showTotal />
      </tbody>

      {/* Operating Result */}
      <tbody>
        <ResultRowDesktop
          label={resultLabel(report.operatingResult, "Laba Operasional", "Rugi Operasional")}
          value={report.operatingResult}
          variant="intermediate"
        />
      </tbody>

      {/* Other Income tbody */}
      <tbody>
        <SectionRows section={sections[3]} showTotal />
      </tbody>

      {/* Other Expense tbody */}
      <tbody>
        <SectionRows section={sections[4]} showTotal />
      </tbody>

      {/* Net Result */}
      <tbody>
        <ResultRowDesktop
          label={resultLabel(report.netResult, "Laba Bersih", "Rugi Bersih")}
          value={report.netResult}
          variant="final"
        />
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
            Tidak ada akun
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

function ResultRowDesktop({
  label,
  value,
  variant,
}: {
  readonly label: string;
  readonly value: number;
  readonly variant: "intermediate" | "final";
}) {
  const borderClass =
    variant === "final" ? "border-t-2 border-wood-800" : "border-t border-wood-200";
  const bgClass = variant === "final" ? "bg-cream-100/70" : "";
  const textClass =
    variant === "final"
      ? "font-bold text-text-primary"
      : "font-semibold text-wood-700";
  const valueClass = "font-bold text-wood-800 tabular-nums";

  return (
    <tr className={`${borderClass} ${bgClass}`}>
      <td scope="row" className={`px-5 py-3 ${textClass}`}>
        {label}
      </td>
      <td className={`px-5 py-3 text-right ${valueClass}`}>
        {formatIDR(value)}
      </td>
    </tr>
  );
}
