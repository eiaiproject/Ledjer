/* eslint-disable react-refresh/only-export-components */
/**
 * Shared hooks and components for report pages.
 *
 * ponytail: Extracted to reduce duplication across 4 report files.
 * Upgrade path: Could add more shared logic (query config, etc.)
 */
import { useState, useCallback } from "react";
import { useOrgPermissions } from "@/hooks/useOrganization";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, FileText } from "reicon-react";
import { cn, formatDateInputValue, formatIDR } from "@/lib/utils";
import { toast } from "@/components/ui/toast";

// ── Shared section rendering (Neraca / Laba Rugi) ───────────────────

/** Minimal shape of a report line item (account + amount). */
export interface ReportLine {
  account_code: string | number;
  account_name: string;
  amount: number;
}

export interface ReportSection<T extends ReportLine = ReportLine> {
  id: string;
  label: string;
  items: T[];
}

/** Mobile card for one report section — shared by Neraca & Laba Rugi. */
export function ReportSectionMobile<T extends ReportLine>({
  section,
  showTotal,
  emptyText = "Tidak ada data",
}: {
  readonly section: ReportSection<T>;
  readonly showTotal?: boolean;
  readonly emptyText?: string;
}) {
  const total = section.items.reduce((s, i) => s + i.amount, 0);

  return (
    <li className="rounded-lg border border-wood-200 overflow-hidden list-none">
      <div className="bg-cream-100/50 px-4 py-2.5">
        <p className="text-sm font-semibold text-wood-700">{section.label}</p>
      </div>
      {section.items.length === 0 && (
        <div className="px-4 py-3 border-t border-wood-100">
          <p className="text-sm text-wood-500">{emptyText}</p>
        </div>
      )}
      {section.items.map((item) => (
        <div
          key={item.account_code}
          className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 border-t border-wood-100 px-4 py-2.5"
        >
          <div className="min-w-0 flex-1">
            <p className="break-words text-sm text-wood-700">{item.account_name}</p>
            <p className="font-mono text-xs text-wood-500">{item.account_code}</p>
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
    </li>
  );
}

/** Desktop table rows for one report section — shared by Neraca & Laba Rugi. */
export function ReportSectionRows<T extends ReportLine>({
  section,
  showTotal,
  emptyText = "Tidak ada data",
}: {
  readonly section: ReportSection<T>;
  readonly showTotal?: boolean;
  readonly emptyText?: string;
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
          <td colSpan={2} className="px-5 py-2 pl-8 text-sm text-wood-500 italic">
            {emptyText}
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


// ── Single date hook ────────────────────────────────────────────────

export function useReportDate() {
  const [pendingDate, setPendingDate] = useState(formatDateInputValue());
  const [appliedDate, setAppliedDate] = useState(formatDateInputValue());
  const dateInvalid = !pendingDate || !/^\d{4}-\d{2}-\d{2}$/.test(pendingDate);
  const isPending = pendingDate !== appliedDate;

  const applyDate = useCallback(() => {
    if (dateInvalid || !pendingDate) return;
    setAppliedDate(pendingDate);
  }, [pendingDate, dateInvalid]);

  const syncPending = useCallback(() => {
    setPendingDate(appliedDate);
  }, [appliedDate]);

  return {
    pendingDate,
    setPendingDate,
    appliedDate,
    dateInvalid,
    isPending,
    applyDate,
    syncPending,
  };
}

// ── Date range hook ─────────────────────────────────────────────────

export function useReportDateRange() {
  const today = new Date();
  const firstDayOfMonth = formatDateInputValue(
    new Date(today.getFullYear(), today.getMonth(), 1),
  );
  const todayStr = formatDateInputValue(today);

  const [pendingFrom, setPendingFrom] = useState(firstDayOfMonth);
  const [pendingTo, setPendingTo] = useState(todayStr);
  const [appliedFrom, setAppliedFrom] = useState(firstDayOfMonth);
  const [appliedTo, setAppliedTo] = useState(todayStr);

  const dateRangeInvalid = pendingFrom > pendingTo;
  const isPending = pendingFrom !== appliedFrom || pendingTo !== appliedTo;

  const applyDate = useCallback(() => {
    if (dateRangeInvalid || !pendingFrom || !pendingTo) return;
    setAppliedFrom(pendingFrom);
    setAppliedTo(pendingTo);
  }, [pendingFrom, pendingTo, dateRangeInvalid]);

  const syncPending = useCallback(() => {
    setPendingFrom(appliedFrom);
    setPendingTo(appliedTo);
  }, [appliedFrom, appliedTo]);

  return {
    pendingFrom,
    setPendingFrom,
    pendingTo,
    setPendingTo,
    appliedFrom,
    appliedTo,
    dateRangeInvalid,
    isPending,
    applyDate,
    syncPending,
  };
}

// ── Permission gate ─────────────────────────────────────────────────

export function ReportPermissionGate({ children }: { readonly children: React.ReactNode }) {
  const { canViewReports } = useOrgPermissions();
  if (!canViewReports) {
    return (
      <Card>
        <CardContent className="text-center py-8">
          <p className="text-wood-500">Anda tidak memiliki izin untuk melihat laporan ini.</p>
        </CardContent>
      </Card>
    );
  }
  return <>{children}</>;
}

// ── Export buttons (CSV + PDF) ──────────────────────────────────────

export function ReportExportButtons({
  disabled,
  isExportingCsv,
  isExportingPdf,
  onExportCsv,
  onExportPdf,
  csvAriaLabel = "Ekspor laporan ke CSV",
  pdfAriaLabel = "Ekspor laporan ke PDF",
  className,
}: {
  readonly disabled: boolean;
  readonly isExportingCsv: boolean;
  readonly isExportingPdf: boolean;
  readonly onExportCsv: () => void;
  readonly onExportPdf: () => void;
  readonly csvAriaLabel?: string;
  readonly pdfAriaLabel?: string;
  readonly className?: string;
}) {
  const anyExporting = isExportingCsv || isExportingPdf;
  return (
    <div className={cn("flex items-center gap-1", className)}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label={csvAriaLabel}
        onClick={onExportCsv}
        disabled={disabled || anyExporting}
        loading={isExportingCsv}
      >
        <Download className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">CSV</span>
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label={pdfAriaLabel}
        onClick={onExportPdf}
        disabled={disabled || anyExporting}
        loading={isExportingPdf}
      >
        <FileText className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">PDF</span>
      </Button>
    </div>
  );
}

// ── Generic export handler ──────────────────────────────────────────

export async function handleReportExport({
  orgId,
  disabled,
  exportFn,
  onSuccess,
  onFinally,
}: {
  readonly orgId: string | undefined;
  readonly disabled: boolean;
  readonly exportFn: () => Promise<void>;
  readonly onSuccess?: () => void;
  readonly onFinally: () => void;
}) {
  if (!orgId || disabled) return;
  try {
    await exportFn();
    toast.success("Ekspor dimulai.");
    onSuccess?.();
  } catch {
    toast.error("Gagal mengekspor. Coba lagi.");
  } finally {
    onFinally();
  }
}
