import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useOrgPermissions } from "@/hooks/useOrganization";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Modal, ModalContent, ModalFooter } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { translateError } from "@/lib/errors";
import { formatShortDate } from "@/lib/utils";
import {
  listApprovalRequests,
  approveApprovalRequest,
  rejectApprovalRequest,
  getPendingApprovalCount,
  // actionTypeLabel,
  type ApprovalRequest,
  type ApprovalStatus,
  type ActionType,
} from "@/lib/api/approvals";
import {
  Check,
  X,
  ShieldCheck,
  Eye,
  InfoCircle,
} from "reicon-react";
import type { BadgeProps } from "@/components/ui/badge";
import { PageShell } from "@/components/ui/page-shell";

const STATUS_BADGE: Record<ApprovalStatus, { variant: BadgeProps["variant"]; label: string }> = {
  pending: { variant: "info", label: "Menunggu" },
  approved: { variant: "success", label: "Disetujui" },
  rejected: { variant: "error", label: "Ditolak" },
};

const ACTION_LABELS: Record<ActionType, string> = {
  transaction_create: "Transaksi Baru",
  transaction_void: "Pembatalan Transaksi",
  period_reopen: "Pembukaan Periode",
  stock_adjustment: "Penyesuaian Stok",
  manual_journal: "Jurnal Manual",
};

export function ApprovalsPage() {
  const queryClient = useQueryClient();
  const { isOwner, canManageTeam } = useOrgPermissions();
  const canApprove = isOwner || canManageTeam;

  const [statusFilter, setStatusFilter] = useState<ApprovalStatus | "">("");
  const [actionFilter, setActionFilter] = useState<ActionType | "">("");
  const [selectedRequest, setSelectedRequest] = useState<ApprovalRequest | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectNote, setRejectNote] = useState("");
  const [approveNote, setApproveNote] = useState("");

  // Queries
  const {
    data: requests = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["approvals", "list", statusFilter, actionFilter],
    queryFn: () => listApprovalRequests({
      status: statusFilter || undefined,
      actionType: actionFilter || undefined,
    }),
  });

  const { data: pendingCount } = useQuery({
    queryKey: ["approvals", "pending-count"],
    queryFn: getPendingApprovalCount,
    refetchInterval: 30_000,
  });

  // Mutations
  const approveMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) =>
      approveApprovalRequest(id, note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["approvals"] });
      toast.success("Permintaan berhasil disetujui.");
      setSelectedRequest(null);
      setApproveNote("");
    },
    onError: (err) => toast.error(translateError(err)),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason, note }: { id: string; reason: string; note?: string }) =>
      rejectApprovalRequest(id, reason, note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["approvals"] });
      toast.success("Permintaan berhasil ditolak.");
      setSelectedRequest(null);
      setRejectReason("");
      setRejectNote("");
    },
    onError: (err) => toast.error(translateError(err)),
  });

  const handleApprove = useCallback(() => {
    if (!selectedRequest) return;
    approveMutation.mutate({ id: selectedRequest.id, note: approveNote || undefined });
  }, [selectedRequest, approveNote, approveMutation]);

  const handleReject = useCallback(() => {
    if (!selectedRequest) return;
    if (rejectReason.trim().length < 5) {
      toast.error("Alasan penolakan minimal 5 karakter.");
      return;
    }
    rejectMutation.mutate({
      id: selectedRequest.id,
      reason: rejectReason.trim(),
      note: rejectNote || undefined,
    });
  }, [selectedRequest, rejectReason, rejectNote, rejectMutation]);

  return (
    <PageShell
      header={{
        title: "Persetujuan",
        description: "Kelola permintaan persetujuan dari anggota tim.",
        actions: pendingCount !== undefined && pendingCount > 0
          ? [{ key: "pending", children: <Badge variant="info" size="md">{pendingCount} menunggu</Badge> }]
          : undefined,
      }}
    >

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as ApprovalStatus | "")}
          className="min-h-[44px] rounded-md border border-wood-200 bg-cream-50 px-3 py-2 text-sm text-wood-700 focus:border-wood-500 focus:outline-none focus:ring-2 focus:ring-wood-200 sm:min-h-0"
          aria-label="Filter status"
        >
          <option value="">Semua Status</option>
          <option value="pending">Menunggu</option>
          <option value="approved">Disetujui</option>
          <option value="rejected">Ditolak</option>
        </select>
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value as ActionType | "")}
          className="min-h-[44px] rounded-md border border-wood-200 bg-cream-50 px-3 py-2 text-sm text-wood-700 focus:border-wood-500 focus:outline-none focus:ring-2 focus:ring-wood-200 sm:min-h-0"
          aria-label="Filter jenis tindakan"
        >
          <option value="">Semua Tindakan</option>
          {Object.entries(ACTION_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
      </div>

      {/* Error state */}
      {error && (
        <ErrorState error={error} onRetry={refetch} />
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg bg-cream-200" />
          ))}
        </div>
      )}

      {/* List */}
      {!isLoading && requests.length === 0 && (
        <EmptyState
          icon={<ShieldCheck className="h-8 w-8" />}
          title={statusFilter || actionFilter ? "Tidak ada hasil" : "Belum ada permintaan"}
          description={statusFilter || actionFilter ? "Coba ubah filter." : "Permintaan persetujuan akan muncul di sini."}
        />
      )}

      <div className="space-y-3">
        {requests.map((req) => {
          const statusMeta = STATUS_BADGE[req.status];
          return (
            <Card key={req.id}>
              <CardContent>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-text-primary">
                        {ACTION_LABELS[req.actionType] ?? req.actionType}
                      </p>
                      <Badge variant={statusMeta.variant} size="sm">
                        {statusMeta.label}
                      </Badge>
                    </div>
                    {req.entitySummary && (
                      <p className="text-xs text-text-tertiary">{req.entitySummary}</p>
                    )}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-tertiary">
                      <span>Diminta oleh: {req.requestedByName || req.requestedBy}</span>
                      <span>{formatShortDate(new Date(req.requestedAt))}</span>
                      {req.amountMinor > 0 && (
                        <span>
                          Nilai: Rp {(req.amountMinor / 100).toLocaleString("id-ID")}
                        </span>
                      )}
                    </div>
                    {req.status === "rejected" && req.rejectionReason && (
                      <div className="mt-2 flex items-start gap-2 rounded-md bg-error/5 p-2 text-xs text-error">
                        <InfoCircle className="mt-0.5 h-3 w-3 shrink-0" />
                        <span>{req.rejectionReason}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedRequest(req)}
                    >
                      <Eye className="h-4 w-4" />
                      Detail
                    </Button>
                    {canApprove && req.status === "pending" && (
                      <>
                        <Button
                          type="button"
                          variant="success"
                          size="sm"
                          onClick={() => {
                            setSelectedRequest(req);
                            setApproveNote("");
                          }}
                        >
                          <Check className="h-4 w-4" />
                          Setujui
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedRequest(req);
                            setRejectReason("");
                            setRejectNote("");
                          }}
                          className="text-error hover:bg-error/10 hover:text-error"
                        >
                          <X className="h-4 w-4" />
                          Tolak
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Approve modal */}
      <Modal
        open={selectedRequest !== null && approveMutation.isIdle && !rejectReason}
        onClose={() => { setSelectedRequest(null); setApproveNote(""); }}
        size="sm"
        ariaLabel="Setujui permintaan"
      >
        <ModalContent>
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium text-text-primary">Setujui Permintaan</p>
              {selectedRequest && (
                <p className="text-xs text-text-tertiary mt-1">
                  {ACTION_LABELS[selectedRequest.actionType]}: {selectedRequest.entitySummary}
                </p>
              )}
            </div>
            <Input
              label="Catatan (opsional)"
              value={approveNote}
              onChange={(e) => setApproveNote(e.target.value)}
              placeholder="Tambahkan catatan persetujuan..."
            />
          </div>
        </ModalContent>
        <ModalFooter>
          <Button variant="ghost" onClick={() => { setSelectedRequest(null); setApproveNote(""); }}>
            Batal
          </Button>
          <Button
            variant="success"
            onClick={handleApprove}
            loading={approveMutation.isPending}
            disabled={approveMutation.isPending}
          >
            <Check className="h-4 w-4" />
            Setujui
          </Button>
        </ModalFooter>
      </Modal>

      {/* Reject modal */}
      <Modal
        open={selectedRequest !== null && rejectMutation.isIdle}
        onClose={() => { setSelectedRequest(null); setRejectReason(""); setRejectNote(""); }}
        size="sm"
        ariaLabel="Tolak permintaan"
      >
        <ModalContent>
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium text-text-primary">Tolak Permintaan</p>
              {selectedRequest && (
                <p className="text-xs text-text-tertiary mt-1">
                  {ACTION_LABELS[selectedRequest.actionType]}: {selectedRequest.entitySummary}
                </p>
              )}
            </div>
            <Input
              label="Alasan penolakan *"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Minimal 5 karakter..."
              error={rejectReason.length > 0 && rejectReason.length < 5 ? "Minimal 5 karakter" : undefined}
            />
            <Input
              label="Catatan (opsional)"
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              placeholder="Catatan tambahan..."
            />
          </div>
        </ModalContent>
        <ModalFooter>
          <Button variant="ghost" onClick={() => { setSelectedRequest(null); setRejectReason(""); setRejectNote(""); }}>
            Batal
          </Button>
          <Button
            variant="ghost"
            onClick={handleReject}
            loading={rejectMutation.isPending}
            disabled={rejectMutation.isPending || rejectReason.trim().length < 5}
            className="text-error hover:bg-error/10 hover:text-error"
          >
            <X className="h-4 w-4" />
            Tolak
          </Button>
        </ModalFooter>
      </Modal>
    </PageShell>
  );
}
