import { useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useOrgPermissions, useOrganization } from "@/hooks/useOrganization";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toast";
import { formatShortDate } from "@/lib/utils";
import { translateError } from "@/lib/errors";
import {
  runChecklist,
  closePeriod,
  type CloseCheck,
} from "@/lib/api/period-close";
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Lock,
  ArrowRight,
  Refresh,
  InfoCircle,
  Shield,
} from "reicon-react";



export function PeriodClosePage() {
  const queryClient = useQueryClient();
  const { data: orgData } = useOrganization();
  const { canManageTeam } = useOrgPermissions();
  const canClose = canManageTeam;

  const [periodEndDate, setPeriodEndDate] = useState(() => {
    const d = new Date();
    // Default to last day of previous month
    d.setMonth(d.getMonth() - 1, 0);
    return d.toISOString().slice(0, 10);
  });
  const [lockReason, setLockReason] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [completed, setCompleted] = useState(false);

  // Checklist query
  const {
    data: checklist,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["period-close", "checklist", periodEndDate],
    queryFn: () => runChecklist(periodEndDate),
    enabled: !!orgData?.organization?.id && canClose,
  });

  // Close mutation
  const closeMutation = useMutation({
    mutationFn: () => closePeriod(periodEndDate, lockReason || undefined),
    onSuccess: (result) => {
      toast.success(`Periode ${result.lock.lockedThroughDate} berhasil dikunci.`);
      setCompleted(true);
      setConfirmOpen(false);
      queryClient.invalidateQueries({ queryKey: ["period-close"] });
      queryClient.invalidateQueries({ queryKey: ["period-locks"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err) => toast.error(translateError(err)),
  });

  const handleChecklist = useCallback(() => {
    refetch();
  }, [refetch]);

  const handleClose = useCallback(() => {
    if (!checklist?.canLock) {
      toast.error("Perbaiki semua pemeriksaan yang gagal sebelum menutup periode.");
      return;
    }
    setConfirmOpen(true);
  }, [checklist]);

  if (!canClose) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Tutup Periode</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Validasi dan kunci periode akuntansi.
          </p>
        </div>
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-sm text-wood-500">
              Hanya pemilik dan admin yang dapat menutup periode.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const statusSummary = checklist
    ? {
        passed: checklist.checks.filter((c) => c.status === "passed").length,
        failed: checklist.checks.filter((c) => c.status === "failed").length,
        warning: checklist.checks.filter((c) => c.status === "warning").length,
        skipped: checklist.checks.filter((c) => c.status === "skipped").length,
        total: checklist.checks.length,
      }
    : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-text-primary">
          {completed ? "Periode Berhasil Ditutup" : "Tutup Periode"}
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          {completed
            ? `Periode ${formatShortDate(periodEndDate)} telah dikunci.`
            : "Jalankan pemeriksaan sebelum menutup periode akuntansi."}
        </p>
      </div>

      {/* Period date selector */}
      {!completed && (
        <div className="flex flex-wrap gap-3 items-end">
          <Input
            label="Periode akhir"
            type="date"
            value={periodEndDate}
            onChange={(e) => setPeriodEndDate(e.target.value)}
            containerClassName="max-w-xs"
          />
          <Button
            type="button"
            variant="secondary"
            onClick={handleChecklist}
            loading={isLoading}
          >
            <Refresh className="h-4 w-4" />
            Jalankan Pemeriksaan
          </Button>
        </div>
      )}

      {/* Completion message */}
      {completed && (
        <Card className="border-leaf-300 bg-leaf-50">
          <CardContent className="flex items-center gap-4 py-6">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-leaf-500 text-white">
              <CheckCircle className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-semibold text-leaf-800">
                Periode berhasil ditutup dan dikunci
              </p>
              <p className="text-xs text-leaf-600 mt-0.5">
                Snapshot laporan telah disimpan. Data periode ini tidak dapat diubah.
              </p>
            </div>
            <Link
              to="/settings/period-locks"
              className="ml-auto inline-flex items-center gap-2 rounded-lg bg-leaf-600 px-4 py-2 text-xs font-medium text-white hover:bg-leaf-700"
            >
              Lihat Kunci Periode
              <ArrowRight className="h-3 w-3" />
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Progress summary */}
      {statusSummary && !completed && (
        <div className="flex flex-wrap gap-3">
          <Badge variant="success" size="sm">
            {statusSummary.passed} Lulus
          </Badge>
          {statusSummary.failed > 0 && (
            <Badge variant="error" size="sm">
              {statusSummary.failed} Gagal
            </Badge>
          )}
          {statusSummary.warning > 0 && (
            <Badge variant="neutral" size="sm">
              {statusSummary.warning} Peringatan
            </Badge>
          )}
          <Badge variant="neutral" size="sm">
            {statusSummary.total} Total
          </Badge>
        </div>
      )}

      {/* Error state */}
      {error && (
        <Card className="border-error-border bg-error-bg">
          <CardContent className="py-4">
            <p className="text-sm text-error">Gagal menjalankan pemeriksaan.</p>
          </CardContent>
        </Card>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-cream-200" />
          ))}
        </div>
      )}

      {/* Checklist items */}
      {checklist && !isLoading && !completed && (
        <div className="space-y-3">
          {checklist.checks.map((check) => (
            <CheckItem key={check.id} check={check} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !checklist && !error && !completed && (
        <Card>
          <CardContent className="py-10 text-center">
            <div className="flex flex-col items-center gap-3">
              <Shield className="h-8 w-8 text-wood-300" />
              <p className="text-sm text-wood-500">
                Pilih tanggal periode dan klik "Jalankan Pemeriksaan" untuk memulai.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lock button */}
      {checklist && !completed && (
        <div className="flex items-center justify-between rounded-lg border border-wood-200 bg-cream-50 p-4">
          <div className="flex items-center gap-3">
            <Lock className="h-5 w-5 text-wood-500" />
            <div>
              <p className="text-sm font-medium text-wood-700">
                {checklist.canLock
                  ? "Semua pemeriksaan lulus. Periode siap dikunci."
                  : "Perbaiki pemeriksaan yang gagal sebelum mengunci."}
              </p>
              {checklist.canLock && (
                <Input
                  value={lockReason}
                  onChange={(e) => setLockReason(e.target.value)}
                  placeholder="Alasan tutup periode (opsional)..."
                  containerClassName="mt-2 max-w-md"
                />
              )}
            </div>
          </div>
          <Button
            type="button"
            variant="primary"
            onClick={handleClose}
            disabled={!checklist.canLock || closeMutation.isPending}
            loading={closeMutation.isPending}
          >
            <Lock className="h-4 w-4" />
            Kunci Periode
          </Button>
        </div>
      )}

      {/* Confirm dialog */}
      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => closeMutation.mutate()}
        title="Kunci periode?"
        message={`Periode ${formatShortDate(periodEndDate)} akan dikunci. Jurnal dan transaksi baru tidak dapat menggunakan tanggal ini atau sebelumnya. Lanjutkan?`}
        confirmLabel="Kunci Periode"
        loading={closeMutation.isPending}
      />
    </div>
  );
}

function CheckItem({ check }: { readonly check: CloseCheck }) {
  const statusConfig = {
    passed: { icon: CheckCircle, bg: "bg-leaf-50", border: "border-leaf-200", iconColor: "text-leaf-600" },
    failed: { icon: XCircle, bg: "bg-error-bg", border: "border-error-border", iconColor: "text-error" },
    warning: { icon: AlertTriangle, bg: "bg-honey-50", border: "border-honey-300", iconColor: "text-honey-600" },
    skipped: { icon: InfoCircle, bg: "bg-cream-50", border: "border-wood-200", iconColor: "text-wood-400" },
  };

  const config = statusConfig[check.status];
  const Icon = config.icon;

  return (
    <div className={`rounded-lg border ${config.border} ${config.bg} p-4`}>
      <div className="flex items-start gap-3">
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${config.iconColor}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-text-primary">{check.label}</p>
            <StatusBadge status={check.status} />
          </div>
          <p className="mt-0.5 text-xs text-text-tertiary">{check.description}</p>
          {check.detail && (
            <p className="mt-1 text-xs text-wood-500">{check.detail}</p>
          )}
        </div>
        {check.actionPath && check.status !== "passed" && (
          <Link
            to={check.actionPath}
            className="mt-1 inline-flex shrink-0 items-center gap-1 rounded-md bg-white/60 px-3 py-1.5 text-xs font-medium text-wood-700 transition-all hover:bg-white"
          >
            <ArrowRight className="h-3 w-3" />
            Tindakan
          </Link>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { readonly status: CloseCheck["status"] }) {
  const config = {
    passed: { variant: "success" as const, label: "Lulus" },
    failed: { variant: "error" as const, label: "Gagal" },
    warning: { variant: "neutral" as const, label: "Peringatan" },
    skipped: { variant: "neutral" as const, label: "Dilewati" },
  };
  const c = config[status];
  return <Badge variant={c.variant} size="sm">{c.label}</Badge>;
}
