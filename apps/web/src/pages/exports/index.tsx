import { useState, useEffect, startTransition } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useOrgPermissions } from "@/hooks/useOrganization";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Modal, ModalContent, ModalFooter } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { translateError } from "@/lib/errors";
import { formatShortDate } from "@/lib/utils";
import { queryKeys } from "@/lib/query-keys";
import {
  createExportJob,
  
  listExportJobs,
  getExportDownloadUrl,
  exportTypeLabel,
  formatBytes,
  
  type ExportType,
  type ExportStatus,
} from "@/lib/api/exports-v2";
import {
  Download,
  Refresh,
  FileText,
} from "reicon-react";

const STATUS_META: Record<ExportStatus, { variant: "info" | "success" | "error" | "secondary" | "warning"; label: string }> = {
  pending: { variant: "info", label: "Antre" },
  processing: { variant: "info", label: "Memproses" },
  completed: { variant: "success", label: "Selesai" },
  failed: { variant: "error", label: "Gagal" },
  expired: { variant: "secondary", label: "Kedaluwarsa" },
};

const EXPORT_TYPES: ExportType[] = [
  "transactions", "general_ledger", "trial_balance",
  "profit_loss", "balance_sheet", "accounts", "products",
];

export function ExportsPage() {
  const queryClient = useQueryClient();
  const { canCreateExports } = useOrgPermissions();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedType, setSelectedType] = useState<ExportType>("transactions");
  const [pollingIds, setPollingIds] = useState<Set<string>>(new Set());

  // ── Queries ──────────────────────────────────────────────────

  const {
    data: jobs,
    isLoading,
    error,
  } = useQuery({
    queryKey: queryKeys.exports.all(),
    queryFn: () => listExportJobs({}),
    refetchInterval: pollingIds.size > 0 ? 2000 : false,
  });

  // ── Mutations ────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: () =>
      createExportJob({
        exportType: selectedType,
      }),
    onSuccess: (job) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.exports.all() });
      toast.success(`Export ${exportTypeLabel(selectedType)} dimulai`);
      setShowCreateModal(false);

      // Start polling if job is processing
      if (job.status === "pending" || job.status === "processing") {
        setPollingIds((prev) => new Set(prev).add(job.id));
      }
    },
    onError: (err: Error) => {
      toast.error(translateError(err.message));
    },
  });

  // ── Polling for active jobs ──────────────────────────────────

  useEffect(() => {
    if (!jobs) return;

    const active = jobs.filter((j) => j.status === "pending" || j.status === "processing");
    startTransition(() => {
      if (active.length === 0) {
        setPollingIds(new Set());
      } else {
        setPollingIds(new Set(active.map((j) => j.id)));
      }
    });
  }, [jobs, setPollingIds]);

  // ── Render ───────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <div className="h-8 w-48 bg-cream-200 rounded animate-pulse" />
        <div className="h-64 bg-cream-200 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (error) {
    return (
      <ErrorState
        title="Gagal memuat riwayat export"
        message="Terjadi kesalahan. Silakan coba lagi."
      />
    );
  }

  const exportJobs = jobs ?? [];

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Export Data</h1>
          <p className="text-sm text-text-secondary mt-0.5">
            Export data ke CSV dengan latar belakang
          </p>
        </div>
        {canCreateExports && (
          <Button size="sm" onClick={() => setShowCreateModal(true)}>
            <Download className="h-4 w-4" />
            Export Baru
          </Button>
        )}
      </header>

      {/* Active exports banner */}
      {pollingIds.size > 0 && (
        <Card className="border-sky-300 bg-sky-50">
          <CardContent className="py-3">
            <div className="flex items-center gap-2">
              <Refresh className="h-4 w-4 text-sky-600 animate-spin" />
              <p className="text-sm text-sky-700">
                {pollingIds.size} export sedang diproses...
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Export list */}
      {exportJobs.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <EmptyState
              icon={FileText}
              title="Belum ada export"
              description="Export data ke CSV untuk analisis lebih lanjut."
              action={canCreateExports ? {
                label: "Export Baru",
                onClick: () => setShowCreateModal(true),
              } : undefined}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {exportJobs.map((job) => {
            const statusMeta = STATUS_META[job.status] ?? STATUS_META.pending;

            return (
              <Card key={job.id}>
                <CardContent className="flex items-center justify-between py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-text-primary">
                        {exportTypeLabel(job.exportType)}
                      </p>
                      <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5 text-xs text-text-tertiary">
                      <span>{formatShortDate(new Date(job.createdAt).toISOString())}</span>
                      {job.rowCount > 0 && <span>{job.rowCount.toLocaleString()} baris</span>}
                      {job.fileSizeBytes != null && <span>{formatBytes(job.fileSizeBytes)}</span>}
                      {job.isTruncated && (
                        <span className="text-clay-600">
                          (dipotong dari {job.totalAvailableRows?.toLocaleString()})
                        </span>
                      )}
                    </div>
                    {job.errorMessage && (
                      <p className="text-xs text-error mt-1">{job.errorMessage}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {/* Progress indicator */}
                    {(job.status === "pending" || job.status === "processing") && (
                      <Refresh className="h-4 w-4 text-sky-500 animate-spin" />
                    )}

                    {/* Download button */}
                    {job.status === "completed" && (
                      <a
                        href={getExportDownloadUrl(job.id)}
                        download
                        className="inline-flex items-center gap-1 rounded-lg bg-wood-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-wood-600 transition-colors"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Download
                      </a>
                    )}

                    {/* Retry button for failed */}
                    {job.status === "failed" && (
                      <button                         type="button"
                        onClick={() => createMutation.mutate()}
                        className="inline-flex items-center gap-1 text-xs text-clay-600 hover:text-clay-800"
                      >
                        <Refresh className="h-3.5 w-3.5" />
                        Ulangi
                      </button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Create Export Modal ──────────────────────────────── */}

      <Modal open={showCreateModal} onClose={() => setShowCreateModal(false)}>
        <ModalContent title="Export Data Baru">
          <div className="space-y-4">
            <div>
              <label htmlFor="exportType" className="block text-sm font-medium text-text-primary mb-1">Tipe Data</label>
              <Select
                id="exportType"
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value as ExportType)}
              >
                {EXPORT_TYPES.map((type) => (
                  <option key={type} value={type}>{exportTypeLabel(type)}</option>
                ))}
              </Select>
            </div>
            <div>
              <span className="block text-sm font-medium text-text-primary mb-1">Format</span>
              <div className="rounded-lg bg-wood-50 px-3 py-2 text-sm text-wood-700">
                CSV (Excel/Spreadsheet)
              </div>
            </div>
            <p className="text-xs text-text-tertiary">
              Export akan diproses di latar belakang. Anda akan mendapatkan link download
              setelah selesai (berlaku 24 jam).
            </p>
          </div>
          <ModalFooter>
            <Button variant="outline" onClick={() => setShowCreateModal(false)}>Batal</Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? "Memulai..." : "Mulai Export"}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}

export default ExportsPage;
