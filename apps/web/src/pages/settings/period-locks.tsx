import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useOrganization, useOrgPermissions } from "@/hooks/useOrganization";
import {
  listPeriodLocks,
  createPeriodLock,
  deletePeriodLock,
  type PeriodLock,
} from "@/lib/api/period-locks";
import { queryKeys } from "@/lib/query-keys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageSpinner } from "@/components/ui/spinner";
import { ErrorState } from "@/components/ui/error-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { translateError } from "@/lib/errors";
import { toast } from "@/components/ui/toast";
import { formatShortDate } from "@/lib/utils";
import {
  Lock,
  Plus,
  Trash2,
  Calendar,
  AlertTriangle,
  Info,
} from "lucide-react";

function formatLockDate(dateStr: string): string {
  try {
    return new Date(dateStr + "T00:00:00").toLocaleDateString("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function formatCreatedAt(iso: string): string {
  try {
    return formatShortDate(new Date(iso));
  } catch {
    return iso;
  }
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

interface PeriodLocksContentProps {
  isLoading: boolean;
  locks: PeriodLock[];
  deletePending: boolean;
  onDeleteClick: (lock: PeriodLock) => void;
}

function PeriodLocksContent({
  isLoading,
  locks,
  deletePending,
  onDeleteClick,
}: Readonly<PeriodLocksContentProps>) {
  if (isLoading) return <PageSpinner />;

  if (locks.length === 0) {
    return (
      <div className="rounded-lg border border-wood-100 bg-cream-50 p-6 text-center">
        <Lock className="mx-auto h-10 w-10 text-wood-300" />
        <h3 className="mt-3 text-sm font-medium text-wood-700">
          Belum ada periode terkunci
        </h3>
        <p className="mx-auto mt-1 max-w-sm text-xs text-wood-500">
          Kunci periode untuk mencegah perubahan data di periode yang sudah ditutup.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {locks.map((lock) => (
        <div
          key={lock.id}
          className="min-w-0 rounded-lg border border-wood-200 bg-cream-50 p-4 transition-[border-color] duration-150"
        >
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-wood-100 text-wood-600">
                <Lock className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-wood-800">
                  Tutup sampai {formatLockDate(lock.lockedThroughDate)}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-wood-500">
                  <span>Dikunci {formatCreatedAt(lock.createdAt)}</span>
                  {lock.reason && (
                    <>
                      <span className="text-wood-300">·</span>
                      <span className="italic text-wood-600">{lock.reason}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="shrink-0">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onDeleteClick(lock)}
                disabled={deletePending}
                aria-label={`Hapus kunci periode ${lock.lockedThroughDate}`}
                className="text-error hover:bg-error/10 hover:text-error"
              >
                <Trash2 className="h-4 w-4" />
                Hapus
              </Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function PeriodLocksPage() {
  const queryClient = useQueryClient();
  const { data: orgData } = useOrganization();
  const { canManageTeam } = useOrgPermissions();

  const [newDate, setNewDate] = useState(todayISO());
  const [newReason, setNewReason] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedLock, setSelectedLock] = useState<PeriodLock | null>(null);

  const {
    data: locksData,
    isLoading,
    error: locksError,
    refetch,
  } = useQuery({
    queryKey: queryKeys.periodLocks.list(orgData?.organization?.id),
    queryFn: listPeriodLocks,
    enabled: !!orgData?.organization?.id && canManageTeam,
  });

  const createMutation = useMutation({
    mutationFn: createPeriodLock,
    onSuccess: () => {
      setNewReason("");
      setNewDate(todayISO());
      queryClient.invalidateQueries({ queryKey: queryKeys.periodLocks.all() });
      toast.success("Periode berhasil dikunci");
    },
    onError: (err) => toast.error(translateError(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: deletePeriodLock,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.periodLocks.all() });
      toast.success("Kunci periode berhasil dihapus");
      setDeleteDialogOpen(false);
      setSelectedLock(null);
    },
    onError: (err) => toast.error(translateError(err)),
  });

  const locks = locksData?.periodLocks ?? [];

  const handleCreate = () => {
    if (!newDate || createMutation.isPending) return;
    createMutation.mutate({
      lockedThroughDate: newDate,
      reason: newReason.trim() || undefined,
    });
  };

  const handleDeleteClick = (lock: PeriodLock) => {
    setSelectedLock(lock);
    setDeleteDialogOpen(true);
  };

  if (!canManageTeam) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <Card>
          <CardHeader>
            <h1 className="text-xl font-bold text-text-primary">Kunci Periode</h1>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-wood-100 bg-cream-50 p-4 text-center">
              <p className="text-sm text-wood-500">
                Hanya pemilik dan admin yang dapat mengelola kunci periode.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (locksError) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <ErrorState error={locksError} onRetry={refetch} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="min-w-0 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Kunci Periode</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Kunci periode akuntansi untuk mencegah posting transaksi di tanggal yang sudah ditutup.
          </p>
        </div>

        {/* Create form */}
        <section aria-labelledby="create-lock-heading">
          <Card>
            <CardHeader>
              <h2 id="create-lock-heading" className="flex items-center gap-2 text-sm font-semibold text-wood-700">
                <Lock className="h-4 w-4" />
                Tambah Kunci Periode
              </h2>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 mb-4">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <p className="text-xs text-amber-800">
                    Semua transaksi pada atau sebelum tanggal yang dikunci tidak akan bisa diposting atau dibatalkan.
                  </p>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] sm:items-end">
                <Input
                  label="Tanggal tutup"
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  max={todayISO()}
                  containerClassName="min-w-0"
                />
                <Input
                  label="Alasan (opsional)"
                  value={newReason}
                  onChange={(e) => setNewReason(e.target.value)}
                  placeholder="Contoh: Tutup buku bulan Juni 2026"
                  maxLength={500}
                  containerClassName="min-w-0"
                />
                <Button
                  type="button"
                  onClick={handleCreate}
                  loading={createMutation.isPending}
                  disabled={!newDate || createMutation.isPending}
                  className="sm:mt-7"
                >
                  <Plus className="h-4 w-4" />
                  Kunci
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Lock list */}
        <section aria-labelledby="locks-heading">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2 id="locks-heading" className="flex items-center gap-2 text-sm font-semibold text-wood-700">
                  <Calendar className="h-4 w-4" />
                  Periode Terkunci
                </h2>
                {!isLoading && (
                  <Badge variant="neutral" size="sm">
                    {locks.length} kunci
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <PeriodLocksContent
                isLoading={isLoading}
                locks={locks}
                deletePending={deleteMutation.isPending}
                onDeleteClick={handleDeleteClick}
              />
            </CardContent>
          </Card>
        </section>

        <div className="flex items-start gap-2 rounded-lg border border-wood-100 bg-cream-50 px-4 py-3 text-xs text-wood-500">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-wood-400" />
          <span>
            Hapus kunci periode jika perlu membuka kembali periode yang sudah ditutup. Hanya pemilik dan admin yang dapat melakukan perubahan ini.
          </span>
        </div>
      </div>

      <ConfirmDialog
        open={deleteDialogOpen}
        onClose={() => {
          setDeleteDialogOpen(false);
          setSelectedLock(null);
        }}
        onConfirm={() => selectedLock && deleteMutation.mutate(selectedLock.id)}
        title="Hapus Kunci Periode?"
        message={`Kunci periode sampai ${selectedLock ? formatLockDate(selectedLock.lockedThroughDate) : ""} akan dihapus. Transaksi di periode ini akan bisa diposting kembali.`}
        confirmLabel="Ya, Hapus"
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
