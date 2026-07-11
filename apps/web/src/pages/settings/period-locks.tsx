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
import { EmptyState } from "@/components/ui/empty-state";
import { Modal, ModalContent, ModalFooter } from "@/components/ui/modal";
import { translateError } from "@/lib/errors";
import { toast } from "@/components/ui/toast";
import { formatShortDate } from "@/lib/utils";
import {
  Lock,
  Unlock,
  Plus,
  Calendar,
  AlertTriangle,
  Info,
  ShieldCheck,
} from "lucide-react";

/* ─── Helpers ─── */

function formatLockDate(dateStr: string): string {
  return formatShortDate(dateStr + "T00:00:00");
}

function formatCreatedAt(iso: string): string {
  return formatShortDate(iso);
}

function todayISO(): string {
  // ponytail: toLocaleDateString('en-CA') gives YYYY-MM-DD in local tz.
  return new Date().toLocaleDateString("en-CA");
}

/** Latest lock date from sorted list, or null if none. */
function latestLockDate(locks: PeriodLock[]): string | null {
  if (locks.length === 0) return null;
  const sorted = [...locks].sort(
    (a, b) => b.lockedThroughDate.localeCompare(a.lockedThroughDate)
  );
  return sorted[0].lockedThroughDate;
}

/* ─── ConfirmLockModal ─── */

function ConfirmLockModal({
  open,
  onClose,
  onConfirm,
  date,
  reason,
  loading,
}: Readonly<{
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  date: string;
  reason: string;
  loading: boolean;
}>) {
  return (
    <Modal open={open} onClose={loading ? () => {} : onClose} size="sm" ariaLabel="Konfirmasi kunci periode">
      <ModalContent className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-clay-50">
          <Lock className="h-6 w-6 text-clay-600" />
        </div>
        <h3 className="text-lg font-semibold text-wood-800">Kunci Periode?</h3>
        <p className="mt-2 text-sm text-wood-600">
          Semua transaksi pada atau sebelum{" "}
          <strong className="font-semibold text-wood-800">{formatLockDate(date)}</strong>{" "}
          tidak akan bisa diposting atau dibatalkan.
        </p>
        {reason && (
          <p className="mt-2 text-xs text-wood-500 italic">
            Alasan: {reason}
          </p>
        )}
        <p className="mt-3 text-xs text-wood-500">
          Aksi ini tidak bisa dibatalkan setelah dikonfirmasi.
        </p>
      </ModalContent>
      <ModalFooter>
        <Button variant="ghost" onClick={onClose} disabled={loading}>
          Batal
        </Button>
        <Button variant="primary" onClick={onConfirm} loading={loading} disabled={loading}>
          <Lock className="h-4 w-4" />
          Ya, Kunci
        </Button>
      </ModalFooter>
    </Modal>
  );
}

/* ─── ConfirmUnlockModal ─── */

function ConfirmUnlockModal({
  open,
  onClose,
  onConfirm,
  lock,
  loading,
}: Readonly<{
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  lock: PeriodLock | null;
  loading: boolean;
}>) {
  const [confirmText, setConfirmText] = useState("");
  const isMatch = confirmText.trim().toUpperCase() === "BUKA";

  const handleClose = () => {
    setConfirmText("");
    onClose();
  };

  return (
    <Modal open={open} onClose={loading ? () => {} : handleClose} size="sm" ariaLabel="Konfirmasi buka kunci">
      <ModalContent>
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-clay-100">
            <Unlock className="h-6 w-6 text-clay-600" />
          </div>
          <h3 className="text-lg font-semibold text-clay-800">Buka Kunci Periode?</h3>
          <p className="mt-2 text-sm text-wood-600">
            Kunci periode sampai{" "}
            <strong className="font-semibold text-wood-800">
              {lock ? formatLockDate(lock.lockedThroughDate) : ""}
            </strong>{" "}
            akan dihapus.
          </p>
          <p className="mt-2 text-sm text-wood-600">
            Transaksi di periode ini akan bisa diposting dan dibatalkan kembali.
          </p>
          <div className="mt-4 rounded-lg border border-clay-200 bg-clay-50 p-3">
            <p className="text-xs font-medium text-clay-700">
              Ketik <strong className="font-mono">BUKA</strong> untuk mengonfirmasi:
            </p>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="BUKA"
              className="mt-2 w-full rounded-md border border-clay-300 bg-cream-50 px-3 py-2 text-sm text-wood-900 placeholder:text-wood-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clay-500 font-mono"
              disabled={loading}
              autoFocus
              aria-label="Ketik Buka untuk konfirmasi"
            />
          </div>
        </div>
      </ModalContent>
      <ModalFooter>
        <Button variant="ghost" onClick={handleClose} disabled={loading}>
          Batal
        </Button>
        <Button
          variant="danger"
          onClick={() => {
            setConfirmText("");
            onConfirm();
          }}
          loading={loading}
          disabled={loading || !isMatch}
        >
          <Unlock className="h-4 w-4" />
          Buka Kunci
        </Button>
      </ModalFooter>
    </Modal>
  );
}

/* ─── AddLockForm ─── */

function AddLockForm({
  disabled,
  disabledReason,
  locks,
}: Readonly<{
  disabled: boolean;
  disabledReason?: string;
  locks: PeriodLock[];
}>) {
  const queryClient = useQueryClient();
  const [newDate, setNewDate] = useState(todayISO());
  const [newReason, setNewReason] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [dateError, setDateError] = useState<string | null>(null);

  const latest = latestLockDate(locks);

  const createMutation = useMutation({
    mutationFn: createPeriodLock,
    onSuccess: () => {
      setNewReason("");
      setNewDate(todayISO());
      queryClient.invalidateQueries({ queryKey: queryKeys.periodLocks.all() });
      toast.success("Periode berhasil dikunci");
      setConfirmOpen(false);
    },
    onError: (err) => {
      toast.error(translateError(err));
      setConfirmOpen(false);
    },
  });

  const validateDate = (date: string): string | null => {
    if (!date) return "Tanggal harus diisi.";
    if (latest && date < latest) {
      return `Tanggal harus setelah ${formatLockDate(latest)} (periode terkunci terakhir).`;
    }
    return null;
  };

  const handleOpenConfirm = () => {
    const err = validateDate(newDate);
    if (err) {
      setDateError(err);
      return;
    }
    setDateError(null);
    setConfirmOpen(true);
  };

  return (
    <>
      <Card>
        <CardHeader>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-wood-700">
            <Lock className="h-4 w-4" />
            Tambah Kunci Periode
          </h2>
        </CardHeader>
        <CardContent>
          {/* Contextual explanation */}
          <div className="rounded-lg border border-clay-200 bg-clay-50 p-3 mb-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-clay-600" />
              <div className="text-xs text-clay-800">
                <p className="font-medium">Apa yang terjadi setelah dikunci?</p>
                <ul className="mt-1 list-disc list-inside space-y-0.5 text-clay-700">
                  <li>Transaksi pada atau sebelum tanggal ini tidak bisa diposting</li>
                  <li>Transaksi yang sudah posted tidak bisa dibatalkan</li>
                  <li>Hanya pemilik dan admin yang bisa membuka kembali</li>
                </ul>
              </div>
            </div>
          </div>

          {disabled && disabledReason && (
            <div className="mb-4 rounded-lg border border-sky-200 bg-sky-50 p-3">
              <div className="flex items-start gap-2">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
                <p className="text-xs text-sky-800">{disabledReason}</p>
              </div>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] sm:items-end">
            <Input
              label="Tanggal tutup"
              type="date"
              value={newDate}
              onChange={(e) => {
                setNewDate(e.target.value);
                if (dateError) setDateError(null);
              }}
              max={todayISO()}
              error={dateError ?? undefined}
              disabled={disabled}
              containerClassName="min-w-0"
            />
            <Input
              label="Alasan (opsional)"
              value={newReason}
              onChange={(e) => setNewReason(e.target.value)}
              placeholder="Contoh: Tutup buku bulan Juni 2026"
              maxLength={500}
              disabled={disabled}
              containerClassName="min-w-0"
            />
            <Button
              type="button"
              onClick={handleOpenConfirm}
              disabled={!newDate || disabled || createMutation.isPending}
              loading={createMutation.isPending}
              className="sm:mt-7"
            >
              <Plus className="h-4 w-4" />
              Kunci
            </Button>
          </div>
        </CardContent>
      </Card>

      <ConfirmLockModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => createMutation.mutate({ lockedThroughDate: newDate, reason: newReason.trim() || undefined })}
        date={newDate}
        reason={newReason.trim()}
        loading={createMutation.isPending}
      />
    </>
  );
}

/* ─── LockedPeriodList ─── */

function LockedPeriodList({
  isLoading,
  locks,
  onDeleteClick,
  deletePending,
  disabled,
}: Readonly<{
  isLoading: boolean;
  locks: PeriodLock[];
  onDeleteClick: (lock: PeriodLock) => void;
  deletePending: boolean;
  disabled?: boolean;
}>) {
  if (isLoading) return <PageSpinner />;

  if (locks.length === 0) {
    return (
      <EmptyState
        icon={<Lock className="h-8 w-8" />}
        title="Belum ada periode terkunci"
        description="Kunci periode untuk mencegah perubahan data di periode yang sudah ditutup."
      />
    );
  }

  return (
    <>
      {/* Mobile: cards */}
      <div className="space-y-3 lg:hidden">
        {locks.map((lock) => (
          <div
            key={lock.id}
            className="rounded-lg border border-wood-200 bg-cream-50 p-4"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-leaf-100 text-leaf-700">
                <Lock className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-wood-800">
                  Sampai {formatLockDate(lock.lockedThroughDate)}
                </p>
                <p className="mt-0.5 text-xs text-wood-500">
                  Dikunci {formatCreatedAt(lock.createdAt)}
                </p>
                {lock.reason && (
                  <p className="mt-1 text-xs text-wood-600 italic">{lock.reason}</p>
                )}
              </div>
            </div>
            <div className="mt-3 flex justify-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onDeleteClick(lock)}
                disabled={deletePending || disabled}
                aria-label={`Buka kunci periode ${lock.lockedThroughDate}`}
                className="text-clay-600 hover:bg-clay-50 hover:text-clay-700"
              >
                <Unlock className="h-4 w-4" />
                Buka Kunci
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop: table */}
      <div className="hidden lg:block ledger-scroll-x">
        <table className="ledger-table">
          <thead>
            <tr>
              <th className="px-4 py-3">Tanggal Tutup</th>
              <th className="px-4 py-3">Dikunci Pada</th>
              <th className="px-4 py-3">Alasan</th>
              <th className="px-4 py-3 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {locks.map((lock) => (
              <tr key={lock.id}>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-2 font-medium text-wood-800">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-leaf-100 text-leaf-700">
                      <Lock className="h-3 w-3" />
                    </span>
                    {formatLockDate(lock.lockedThroughDate)}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-wood-600">
                  {formatCreatedAt(lock.createdAt)}
                </td>
                <td className="px-4 py-3 text-sm text-wood-500 italic max-w-[200px] truncate">
                  {lock.reason || "—"}
                </td>
                <td className="px-4 py-3 text-right">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onDeleteClick(lock)}
                    disabled={deletePending || disabled}
                    aria-label={`Buka kunci periode ${lock.lockedThroughDate}`}
                    className="text-clay-600 hover:bg-clay-50 hover:text-clay-700"
                  >
                    <Unlock className="h-4 w-4" />
                    Buka Kunci
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ─── PeriodLocksPage ─── */

export function PeriodLocksPage() {
  const queryClient = useQueryClient();
  const { data: orgData } = useOrganization();
  const { canManageTeam } = useOrgPermissions();

  const [unlockDialogOpen, setUnlockDialogOpen] = useState(false);
  const [selectedLock, setSelectedLock] = useState<PeriodLock | null>(null);

  const {
    data: locksData,
    isLoading,
    error: locksError,
    refetch,
  } = useQuery({
    queryKey: queryKeys.periodLocks.list(orgData?.organization?.id),
    queryFn: listPeriodLocks,
    enabled: !!orgData?.organization?.id,
  });

  const deleteMutation = useMutation({
    mutationFn: deletePeriodLock,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.periodLocks.all() });
      toast.success("Kunci periode berhasil dihapus");
      setUnlockDialogOpen(false);
      setSelectedLock(null);
    },
    onError: (err) => toast.error(translateError(err)),
  });

  const locks = locksData?.periodLocks ?? [];

  const handleDeleteClick = (lock: PeriodLock) => {
    setSelectedLock(lock);
    setUnlockDialogOpen(true);
  };

  /* ─── Error state ─── */
  if (locksError) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <ErrorState error={locksError} onRetry={refetch} />
      </div>
    );
  }

  return (
    <div className="ledger-page mx-auto max-w-5xl">
      <div className="min-w-0 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Kunci Periode</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Kunci periode akuntansi untuk mencegah posting transaksi di tanggal yang sudah ditutup.
          </p>
        </div>

        {/* Create form */}
        <section aria-labelledby="create-lock-heading">
          <AddLockForm
            disabled={!canManageTeam}
            disabledReason="Anda tidak memiliki izin untuk mengunci periode. Hubungi pemilik atau admin."
            locks={locks}
          />
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
              <LockedPeriodList
                isLoading={isLoading}
                locks={locks}
                deletePending={deleteMutation.isPending}
                onDeleteClick={handleDeleteClick}
                disabled={!canManageTeam}
              />
            </CardContent>
          </Card>
        </section>

        {/* Info footer */}
        <div className="flex items-start gap-2 rounded-lg border border-wood-100 bg-cream-50 px-4 py-3 text-xs text-wood-500">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-wood-400" />
          <span>
            Hapus kunci periode jika perlu membuka kembali periode yang sudah ditutup. Transaksi di periode tersebut akan bisa diposting dan dibatalkan kembali.
          </span>
        </div>
      </div>

      {/* Unlock confirmation modal */}
      <ConfirmUnlockModal
        open={unlockDialogOpen}
        onClose={() => {
          setUnlockDialogOpen(false);
          setSelectedLock(null);
        }}
        onConfirm={() => selectedLock && deleteMutation.mutate(selectedLock.id)}
        lock={selectedLock}
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
