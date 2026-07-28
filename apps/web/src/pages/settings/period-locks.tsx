import { useState, useCallback, useMemo } from "react";
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
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Modal, ModalContent, ModalFooter } from "@/components/ui/modal";
import { translateError } from "@/lib/errors";
import { toast } from "@/components/ui/toast";
import { formatDateLong, formatShortDate, cn } from "@/lib/utils";
import {
  Lock,
  Unlock,
  Calendar,
  AlertTriangle,
  InfoCircle,
  ShieldCheck,
} from "reicon-react";
import { PageShell } from "@/components/ui/page-shell";

/* ─── Helpers ────────────────────────────────────────────────────── */

function formatLockDate(dateStr: string): string {
  return formatDateLong(dateStr + "T00:00:00");
}

function formatShort(dateStr: string): string {
  return formatShortDate(dateStr + "T00:00:00");
}

/** End of previous month in YYYY-MM-DD (local tz). Safe default that never locks current period. */
function endOfPreviousMonthISO(): string {
  const now = new Date();
  const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const month = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
  const lastDay = new Date(year, month + 1, 0).getDate();
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
}

/** Tomorrow in YYYY-MM-DD — minimum allowed lock date (must be >= first transaction date). */
function tomorrowISO(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toLocaleDateString("en-CA");
}

/** Latest lock date from sorted list, or null if none. */
function latestLockDate(locks: PeriodLock[]): string | null {
  if (locks.length === 0) return null;
  const sorted = [...locks].sort(
    (a, b) => b.lockedThroughDate.localeCompare(a.lockedThroughDate),
  );
  return sorted[0].lockedThroughDate;
}

/** Next day after a date string (YYYY-MM-DD). */
function nextDay(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + 1);
  return d.toLocaleDateString("en-CA");
}

function isValidDate(dateStr: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateStr) && !Number.isNaN(new Date(dateStr + "T00:00:00").getTime());
}

/* ─── Skeleton ────────────────────────────────────────────────────── */

function LockSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2].map((i) => (
        <div key={`lock-skeleton-${i}`} className="flex items-center gap-3 rounded-lg border border-wood-200 bg-cream-50 p-4">
          <div className="h-10 w-10 animate-pulse rounded-full bg-cream-200" />
          <div className="space-y-2 flex-1">
            <div className="h-4 w-40 animate-pulse rounded bg-cream-200" />
            <div className="h-3 w-28 animate-pulse rounded bg-cream-200" />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── ConfirmLockDialog ──────────────────────────────────────────── */

function ConfirmLockDialog({
  open,
  onClose,
  onConfirm,
  date,
  reason,
  currentLock,
  isExtend,
  loading,
}: Readonly<{
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  date: string;
  reason: string;
  currentLock: string | null;
  isExtend: boolean;
  loading: boolean;
}>) {
  const nextOpen = nextDay(date);

  return (
    <Modal open={open} onClose={loading ? () => {} : onClose} size="sm" ariaLabel="Konfirmasi kunci periode">
      <ModalContent>
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-clay-50">
            <Lock className="h-6 w-6 text-clay-600" />
          </div>
          <h3 className="text-lg font-semibold text-wood-800">
            {isExtend ? "Perpanjang kunci periode?" : "Kunci transaksi hingga " + formatShort(date) + "?"}
          </h3>
          <div className="mt-3 space-y-2 text-left text-sm text-wood-600">
            {isExtend && currentLock && (
              <p className="rounded bg-wood-50 px-3 py-2 text-xs text-wood-700">
                Kunci saat ini berlaku hingga <strong>{formatShort(currentLock)}</strong>. Akan diperpanjang hingga <strong>{formatShort(date)}</strong>.
              </p>
            )}
            <div className="rounded-lg border border-wood-100 bg-cream-50 p-3">
              <p className="text-xs font-medium text-wood-700">Akan dikunci:</p>
              <p className="text-xs text-wood-600">Semua transaksi hingga {formatShort(date)}</p>
              <p className="mt-1 text-xs font-medium text-wood-700">Tetap terbuka:</p>
              <p className="text-xs text-wood-600">Transaksi mulai {formatShort(nextOpen)}</p>
            </div>
            {reason && (
              <p className="text-xs text-wood-500 italic">Alasan: {reason}</p>
            )}
          </div>
        </div>
      </ModalContent>
      <ModalFooter>
        <Button variant="ghost" onClick={onClose} disabled={loading}>
          Batal
        </Button>
        <Button variant="primary" onClick={onConfirm} loading={loading} disabled={loading}>
          <Lock className="h-4 w-4" />
          {isExtend ? "Perpanjang kunci" : "Kunci hingga tanggal ini"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

/* ─── ConfirmReopenDialog ────────────────────────────────────────── */

function ConfirmReopenDialog({
  open,
  onClose,
  onConfirm,
  lock,
  loading,
}: Readonly<{
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  lock: PeriodLock | null;
  loading: boolean;
}>) {
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState(false);

  const handleConfirm = useCallback(() => {
    if (!reason.trim()) {
      setReasonError(true);
      return;
    }
    setReasonError(false);
    onConfirm(reason.trim());
  }, [reason, onConfirm]);

  const handleClose = useCallback(() => {
    setReason("");
    setReasonError(false);
    onClose();
  }, [onClose]);

  if (!lock) return null;

  const nextOpen = nextDay(lock.lockedThroughDate);

  return (
    <Modal
      open={open}
      onClose={loading ? () => {} : handleClose}
      size="sm"
      ariaLabel="Konfirmasi buka kembali periode"
    >
      <ModalContent>
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-honey-50">
            <Unlock className="h-6 w-6 text-honey-600" />
          </div>
          <h3 className="text-lg font-semibold text-wood-800">Buka kembali periode?</h3>
          <div className="mt-3 space-y-2 text-left text-sm text-wood-600">
            <p>
              Transaksi pada periode yang dibuka kembali dapat diposting, diedit, atau dibatalkan sesuai izin pengguna.
            </p>
            <div className="rounded-lg border border-wood-100 bg-cream-50 p-3">
              <p className="text-xs text-wood-600">
                Saat ini: transaksi hingga <strong>{formatShort(lock.lockedThroughDate)}</strong> dikunci
              </p>
              <p className="mt-1 text-xs text-wood-600">
                Setelah dibuka: transaksi mulai <strong>{formatShort(nextOpen)}</strong> tetap terbuka, dan seluruh periode sebelumnya juga terbuka
              </p>
            </div>
          </div>
          <div className="mt-4 text-left">
            <label htmlFor="reopen-reason" className="block text-sm font-medium text-wood-700">
              Alasan pembukaan kembali
            </label>
            <textarea
              id="reopen-reason"
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
                if (reasonError) setReasonError(false);
              }}
              rows={3}
              maxLength={500}
              placeholder="Contoh: Koreksi data transaksi periode lalu"
              disabled={loading}
              aria-invalid={reasonError || undefined}
              aria-describedby={reasonError ? "reopen-reason-error" : undefined}
              className={cn(
                "mt-1 min-h-[80px] w-full rounded-md border bg-cream-50 px-3 py-2 text-sm text-wood-700",
                "focus:border-wood-500 focus:outline-none focus:ring-2 focus:ring-wood-200",
                "disabled:opacity-50",
                reasonError ? "border-error" : "border-wood-200",
              )}
            />
            {reasonError && (
              <p id="reopen-reason-error" className="mt-1 text-xs text-error" role="alert">
                Alasan pembukaan kembali wajib diisi.
              </p>
            )}
          </div>
        </div>
      </ModalContent>
      <ModalFooter>
        <Button variant="ghost" onClick={handleClose} disabled={loading}>
          Batal
        </Button>
        <Button variant="danger" onClick={handleConfirm} loading={loading} disabled={loading}>
          <Unlock className="h-4 w-4" />
          Buka kembali periode
        </Button>
      </ModalFooter>
    </Modal>
  );
}

/* ─── EffectiveLockCard ──────────────────────────────────────────── */

function EffectiveLockCard({
  locks,
  canManage,
  onReopen,
}: Readonly<{
  locks: PeriodLock[];
  canManage: boolean;
  onReopen: (lock: PeriodLock) => void;
}>) {
  const sorted = useMemo(
    () => [...locks].sort((a, b) => b.lockedThroughDate.localeCompare(a.lockedThroughDate)),
    [locks],
  );
  const effective = sorted[0];
  const nextOpen = effective ? nextDay(effective.lockedThroughDate) : null;

  if (!effective) return null;

  return (
    <section aria-labelledby="effective-lock-heading">
      <Card>
        <CardHeader>
          <h2 id="effective-lock-heading" className="flex items-center gap-2 text-sm font-semibold text-wood-700">
            <Lock className="h-4 w-4" />
            Periode aktif
          </h2>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-clay-200 bg-clay-50 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-clay-100 text-clay-700">
                  <Lock className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-wood-800">
                    Dikunci hingga {formatLockDate(effective.lockedThroughDate)}
                  </p>
                  <p className="mt-0.5 text-xs text-wood-500">
                    Transaksi mulai {formatShort(nextOpen!)} tetap terbuka
                  </p>
                  {effective.reason && (
                    <p className="mt-1 text-xs text-wood-600 italic">{effective.reason}</p>
                  )}
                  <p className="mt-1 text-xs text-wood-500">
                    Dikunci {formatShort(effective.createdAt)}
                  </p>
                </div>
              </div>
              {canManage && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onReopen(effective)}
                  className="self-start text-honey-700 hover:bg-honey-50 hover:text-honey-800"
                >
                  <Unlock className="h-4 w-4" />
                  Buka kembali
                </Button>
              )}
            </div>
          </div>
          {sorted.length > 1 && (
            <p className="mt-3 text-xs text-wood-500">
              {sorted.length} catatan histori tercatat
            </p>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

/* ─── LockHistoryList ────────────────────────────────────────────── */

function LockHistoryList({
  isLoading,
  locks,
  effectiveId,
}: Readonly<{
  isLoading: boolean;
  locks: PeriodLock[];
  effectiveId: string | null;
}>) {
  const sorted = useMemo(
    () => [...locks].sort((a, b) => b.lockedThroughDate.localeCompare(a.lockedThroughDate)),
    [locks],
  );

  if (isLoading) return <LockSkeleton />;

  if (sorted.length === 0) return null;

  return (
    <section aria-labelledby="lock-history-heading">
      <Card>
        <CardHeader>
          <h2 id="lock-history-heading" className="flex items-center gap-2 text-sm font-semibold text-wood-700">
            <Calendar className="h-4 w-4" />
            Histori kunci periode
          </h2>
        </CardHeader>
        <CardContent>
          {/* Mobile: cards */}
          <div className="space-y-3 lg:hidden">
            {sorted.map((lock) => {
              const isActive = lock.id === effectiveId;
              return (
                <div
                  key={lock.id}
                  className={cn(
                    "rounded-lg border p-4",
                    isActive
                      ? "border-leaf-200 bg-leaf-50"
                      : "border-wood-200 bg-cream-50",
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                        isActive
                          ? "bg-leaf-100 text-leaf-700"
                          : "bg-wood-100 text-wood-500",
                      )}
                    >
                      <Lock className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-wood-800">
                          {formatShort(lock.lockedThroughDate)}
                        </p>
                        {isActive && (
                          <Badge variant="success" size="sm">Aktif</Badge>
                        )}
                        {!isActive && (
                          <Badge variant="neutral" size="sm">Digantikan</Badge>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-wood-500">
                        Transaksi hingga {formatShort(lock.lockedThroughDate)} dikunci
                      </p>
                      {lock.reason && (
                        <p className="mt-1 text-xs text-wood-600 italic">{lock.reason}</p>
                      )}
                      <p className="mt-1 text-xs text-wood-500">
                        {formatShort(lock.createdAt)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop: table */}
          <div className="hidden lg:block ledger-scroll-x">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th scope="col" className="px-4 py-3">Tanggal tutup</th>
                  <th scope="col" className="px-4 py-3">Status</th>
                  <th scope="col" className="px-4 py-3">Alasan</th>
                  <th scope="col" className="px-4 py-3">Dicatat</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((lock) => {
                  const isActive = lock.id === effectiveId;
                  return (
                    <tr key={lock.id}>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-2 font-medium text-wood-800">
                          <span
                            className={cn(
                              "flex h-6 w-6 items-center justify-center rounded-full",
                              isActive
                                ? "bg-leaf-100 text-leaf-700"
                                : "bg-wood-100 text-wood-500",
                            )}
                          >
                            <Lock className="h-3 w-3" />
                          </span>
                          {formatShort(lock.lockedThroughDate)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={isActive ? "success" : "neutral"} size="sm">
                          {isActive ? "Aktif" : "Digantikan"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-sm text-wood-500 max-w-[200px] truncate">
                        {lock.reason || "—"}
                      </td>
                      <td className="px-4 py-3 text-sm text-wood-500">
                        {formatShort(lock.createdAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

/* ─── CreateLockForm ─────────────────────────────────────────────── */

function CreateLockForm({
  disabled,
  disabledReason,
  locks,
}: Readonly<{
  disabled: boolean;
  disabledReason?: string;
  locks: PeriodLock[];
}>) {
  const queryClient = useQueryClient();
  const latest = latestLockDate(locks);
  const suggestedDate = endOfPreviousMonthISO();

  const [selectedDate, setSelectedDate] = useState(suggestedDate);
  const [reason, setReason] = useState("");
  const [dateError, setDateError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const createMutation = useMutation({
    mutationFn: createPeriodLock,
    onSuccess: () => {
      setReason("");
      setSelectedDate(suggestedDate);
      queryClient.invalidateQueries({ queryKey: queryKeys.periodLocks.all() });
      toast.success("Periode berhasil dikunci");
      setConfirmOpen(false);
    },
    onError: (err) => {
      const msg = translateError(err);
      if (msg.includes("sudah ada") || msg.includes("overlaps")) {
        setDateError("Sudah ada kunci periode untuk tanggal ini atau yang lebih baru.");
      } else {
        toast.error(msg);
        setConfirmOpen(false);
      }
    },
  });

  const isExtend = latest !== null && selectedDate > latest;

  const validateDate = useCallback(
    (date: string): string | null => {
      if (!date) return "Pilih tanggal tutup.";
      if (!isValidDate(date)) return "Tanggal tutup tidak valid.";
      if (latest && date <= latest) {
        return `Periode sudah dikunci hingga ${formatShort(latest)}. Pilih tanggal yang lebih baru.`;
      }
      return null;
    },
    [latest],
  );

  const handleOpenConfirm = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const err = validateDate(selectedDate);
      if (err) {
        setDateError(err);
        return;
      }
      setDateError(null);
      setConfirmOpen(true);
    },
    [selectedDate, validateDate],
  );

  const handleDateChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSelectedDate(e.target.value);
      if (dateError) setDateError(null);
    },
    [dateError],
  );

  const nextOpen = nextDay(selectedDate);

  return (
    <>
      <section aria-labelledby="create-lock-heading">
        <Card>
          <CardHeader>
            <h2 id="create-lock-heading" className="flex items-center gap-2 text-sm font-semibold text-wood-700">
              <Lock className="h-4 w-4" />
              Tambah kunci periode
            </h2>
          </CardHeader>
          <CardContent>
            {/* Impact explanation */}
            <div className="mb-4 rounded-lg border border-clay-200 bg-clay-50 p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-clay-600" />
                <div className="text-xs text-clay-800">
                  <p className="font-medium">Apa yang terjadi setelah dikunci?</p>
                  <ul className="mt-1 space-y-0.5 text-clay-700 pl-4 list-disc">
                    <li>Semua transaksi pada atau sebelum tanggal tersebut tidak dapat diposting, diedit, atau dibatalkan</li>
                    <li>Hanya pemilik dan admin yang dapat membuka kembali periode</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Permission notice */}
            {disabled && disabledReason && (
              <div className="mb-4 rounded-lg border border-sky-200 bg-sky-50 p-3">
                <div className="flex items-start gap-2">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
                  <p className="text-xs text-sky-800">{disabledReason}</p>
                </div>
              </div>
            )}

            {/* Date preview */}
            {selectedDate && !dateError && isValidDate(selectedDate) && (
              <div className="mb-4 rounded-lg border border-wood-100 bg-cream-50 p-3">
                <p className="text-xs text-wood-600">
                  Akan dikunci: semua transaksi hingga <strong className="font-medium text-wood-800">{formatShort(selectedDate)}</strong>
                </p>
                <p className="text-xs text-wood-600">
                  Tetap terbuka: transaksi mulai <strong className="font-medium text-leaf-700">{formatShort(nextOpen)}</strong>
                </p>
                {latest && (
                  <p className="mt-1 text-xs text-wood-500">
                    {isExtend
                      ? `Memperpanjang kunci dari ${formatShort(latest)} ke ${formatShort(selectedDate)}`
                      : "Memperpanjang kunci periode yang sudah ada"}
                  </p>
                )}
              </div>
            )}

            {latest && (
              <p className="mb-3 text-xs text-wood-500">
                Kunci saat ini: hingga {formatShort(latest)}
              </p>
            )}

            {!latest && (
              <p className="mb-3 text-xs text-wood-500">
                Tanggal yang disarankan berdasarkan akhir bulan sebelumnya.
              </p>
            )}

            <form onSubmit={handleOpenConfirm} noValidate>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-start">
                <div>
                  <label htmlFor="lock-date" className="block text-sm font-medium text-wood-700">
                    Tanggal tutup
                  </label>
                  <input
                    id="lock-date"
                    type="date"
                    value={selectedDate}
                    onChange={handleDateChange}
                    max={tomorrowISO()}
                    disabled={disabled || createMutation.isPending}
                    aria-invalid={!!dateError || undefined}
                    aria-describedby={dateError ? "lock-date-error" : "lock-date-help"}
                    className={cn(
                      "mt-1 min-h-[44px] w-full rounded-md border bg-cream-50 px-3 py-2 text-sm text-wood-700",
                      "focus:border-wood-500 focus:outline-none focus:ring-2 focus:ring-wood-200",
                      "disabled:opacity-50",
                      dateError ? "border-error" : "border-wood-200",
                    )}
                  />
                  {dateError ? (
                    <p id="lock-date-error" className="mt-1 text-xs text-error" role="alert">
                      {dateError}
                    </p>
                  ) : (
                    <p id="lock-date-help" className="mt-1 text-xs text-wood-500">
                      Semua transaksi pada atau sebelum tanggal ini akan dikunci.
                    </p>
                  )}
                </div>
                <div>
                  <label htmlFor="alasan-kunci" className="block text-sm font-medium text-wood-700">
                    Alasan (opsional)
                  </label>
                  <textarea
                    id="alasan-kunci"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={3}
                    maxLength={500}
                    placeholder="Contoh: Tutup buku bulan Juni 2026"
                    disabled={disabled || createMutation.isPending}
                    aria-describedby="alasan-kunci-help"
                    className="mt-1 min-h-[80px] w-full rounded-md border border-wood-200 bg-cream-50 px-3 py-2 text-sm text-wood-700 placeholder:text-wood-500 focus:border-wood-500 focus:outline-none focus:ring-2 focus:ring-wood-200 disabled:opacity-50"
                  />
                  <p id="alasan-kunci-help" className="mt-1 text-xs text-wood-500">
                    Maksimal 500 karakter
                  </p>
                </div>
                <Button
                  type="submit"
                  disabled={!selectedDate || disabled || createMutation.isPending}
                  loading={createMutation.isPending}
                  className="sm:mt-6"
                >
                  <Lock className="h-4 w-4" />
                  {isExtend ? "Perpanjang kunci" : "Kunci hingga tanggal ini"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </section>

      <ConfirmLockDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() =>
          createMutation.mutate({
            lockedThroughDate: selectedDate,
            reason: reason.trim() || undefined,
          })
        }
        date={selectedDate}
        reason={reason.trim()}
        currentLock={latest}
        isExtend={isExtend}
        loading={createMutation.isPending}
      />
    </>
  );
}

/* ─── PeriodLocksPage ────────────────────────────────────────────── */

export function PeriodLocksPage() {
  const queryClient = useQueryClient();
  const { data: orgData } = useOrganization();
  const { canManageTeam } = useOrgPermissions();

  const [reopenDialogOpen, setReopenDialogOpen] = useState(false);
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
    mutationFn: ({ lockId, reason }: { lockId: string; reason: string }) =>
      deletePeriodLock(lockId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.periodLocks.all() });
      toast.success("Periode berhasil dibuka kembali");
      setReopenDialogOpen(false);
      setSelectedLock(null);
    },
    onError: (err) => toast.error(translateError(err)),
  });

  const locks = useMemo(() => locksData?.periodLocks ?? [], [locksData]);
  const effectiveLockId = useMemo(() => {
    if (locks.length === 0) return null;
    const sorted = [...locks].sort(
      (a, b) => b.lockedThroughDate.localeCompare(a.lockedThroughDate),
    );
    return sorted[0].id;
  }, [locks]);

  const handleReopenClick = useCallback((lock: PeriodLock) => {
    setSelectedLock(lock);
    setReopenDialogOpen(true);
  }, []);

  /* ─── Loading ──────────────────────────────────────────────────── */
  if (isLoading) {
    return (
      <PageShell
        header={{
          title: "Kunci Periode",
          description: "Kunci transaksi hingga tanggal tertentu agar pembukuan yang sudah ditutup tidak berubah.",
        }}
      >
        <LockSkeleton />
      </PageShell>
    );
  }

  /* ─── Error ────────────────────────────────────────────────────── */
  if (locksError) {
    return (
      <PageShell
        header={{
          title: "Kunci Periode",
          description: "Kunci transaksi hingga tanggal tertentu agar pembukuan yang sudah ditutup tidak berubah.",
        }}
      >
        <ErrorState
          error={locksError}
          message="Kunci periode gagal dimuat. Periksa koneksi Anda, lalu coba lagi."
          onRetry={refetch}
        />
      </PageShell>
    );
  }

  /* ─── Render ───────────────────────────────────────────────────── */
  return (
    <PageShell
      header={{
        title: "Kunci Periode",
        description: "Kunci transaksi hingga tanggal tertentu agar pembukuan yang sudah ditutup tidak berubah.",
      }}
    >

      {/* Effective lock (prominent) */}
      {locks.length > 0 && (
        <EffectiveLockCard
          locks={locks}
          canManage={canManageTeam}
          onReopen={handleReopenClick}
        />
      )}

      {/* Create form */}
      <CreateLockForm
        disabled={!canManageTeam}
        disabledReason="Anda tidak memiliki izin untuk mengunci periode. Hubungi pemilik atau admin."
        locks={locks}
      />

      {/* Lock history */}
      <LockHistoryList
        isLoading={isLoading}
        locks={locks}
        effectiveId={effectiveLockId}
      />

      {/* Empty state */}
      {!isLoading && locks.length === 0 && (
        <EmptyState
          icon={<Lock className="h-8 w-8" />}
          title="Belum ada periode terkunci"
          description="Transaksi masih dapat diposting dan dibatalkan sesuai izin pengguna."
        />
      )}

      {/* Read-only notice */}
      {!canManageTeam && (
        <div className="flex items-start gap-2 rounded-lg border border-wood-100 bg-cream-50 px-4 py-3 text-xs text-wood-500">
          <InfoCircle className="mt-0.5 h-4 w-4 shrink-0 text-wood-500" />
          <span>
            Anda dapat melihat kunci periode, tetapi tidak memiliki izin untuk mengubahnya.
          </span>
        </div>
      )}

      {/* Reopen dialog */}
      <ConfirmReopenDialog
        open={reopenDialogOpen}
        onClose={() => {
          setReopenDialogOpen(false);
          setSelectedLock(null);
        }}
        onConfirm={(reason) =>
          selectedLock && deleteMutation.mutate({ lockId: selectedLock.id, reason })
        }
        lock={selectedLock}
        loading={deleteMutation.isPending}
      />
    </PageShell>
  );
}
