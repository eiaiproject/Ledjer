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
import { Download } from "lucide-react";
import { formatDateInputValue } from "@/lib/utils";
import { toast } from "@/components/ui/toast";

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

// ── Export button ───────────────────────────────────────────────────

export function ReportExportButton({
  disabled,
  isExporting,
  onExport,
  label = "Ekspor CSV",
}: {
  readonly disabled: boolean;
  readonly isExporting: boolean;
  readonly onExport: () => void;
  readonly label?: string;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onExport}
      disabled={disabled || isExporting}
      className="hidden sm:inline-flex"
      aria-busy={isExporting || undefined}
    >
      <Download className="h-4 w-4" aria-hidden="true" />
      {isExporting ? "Mengekspor..." : label}
    </Button>
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
    toast.success("Ekspor CSV dimulai.");
    onSuccess?.();
  } catch {
    toast.error("Gagal mengekspor. Coba lagi.");
  } finally {
    onFinally();
  }
}
