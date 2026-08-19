import { useCallback, useEffect, useState, type ReactNode } from "react";
import { apiRequest } from "@/lib/api/client";
import { Badge, Button, Card, CardHeader, EmptyState, PageHeader, PageLoader, Toast, formatDateTime } from "@/components/ui";

interface BackupSummary {
  date: string;
  completed: boolean;
  tableCount: number;
  totalRows: number;
  version: number;
  sha256: string;
  startedAt: number;
  completedAt: number | null;
  sizeWarning?: string;
  consistencyWarning?: boolean;
}

interface BackupDetail extends BackupSummary {
  tables: Record<string, { rowCount: number }>;
  errors: string[];
  valid: boolean;
}

interface DrillReport {
  date: string;
  backupExists: boolean;
  valid: boolean;
  errors: string[];
  tableCount: number;
  totalRows: number;
  checkedAt: number;
}

export function BackupsPage() {
  const [backups, setBackups] = useState<BackupSummary[] | null>(null);
  const [detail, setDetail] = useState<BackupDetail | null>(null);
  const [drill, setDrill] = useState<DrillReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fetchBackups = useCallback(async () => {
    return apiRequest<{ backups: BackupSummary[] }>("/api/admin/backups");
  }, []);

  const load = useCallback(async () => {
    setError(null);
    try {
      setBackups((await fetchBackups()).backups);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat backup");
    }
  }, [fetchBackups]);

  useEffect(() => {
    let cancelled = false;
    fetchBackups()
      .then((result) => {
        if (!cancelled) setBackups(result.backups);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Gagal memuat backup");
      });
    return () => {
      cancelled = true;
    };
  }, [fetchBackups]);

  async function openDetail(date: string) {
    setError(null);
    setDetail(null);
    try {
      const result = await apiRequest<BackupDetail>(`/api/admin/backups/${date}`);
      setDetail(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat detail backup");
    }
  }

  async function runDrill() {
    setBusy(true);
    setError(null);
    try {
      const result = await apiRequest<DrillReport>("/api/admin/backups/drill");
      setDrill(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menjalankan restore drill");
    } finally {
      setBusy(false);
    }
  }

  async function trigger() {
    if (!window.confirm("Jalankan backup manual sekarang? Backup penuh semua tabel akan ditulis ke R2, lalu restore drill dijalankan.")) return;
    setBusy(true);
    setError(null);
    try {
      const result = await apiRequest<{ summary: BackupSummary; drill: DrillReport }>("/api/admin/backups", { method: "POST" });
      setDrill(result.drill);
      await load();
      if (result.summary.date) await openDetail(result.summary.date);
      alert(`Backup ${result.summary.date} selesai (${result.summary.totalRows.toLocaleString("id-ID")} baris). Drill: ${result.drill.valid ? "LULUS" : "GAGAL"}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menjalankan backup");
    } finally {
      setBusy(false);
    }
  }

  let listBody: ReactNode;
  if (!backups) {
    listBody = <PageLoader />;
  } else if (backups.length === 0) {
    listBody = <EmptyState title="Belum ada backup" description="Backup harian otomatis akan muncul di sini." />;
  } else {
    const rows = backups.map((b) => (
      <tr key={b.date} className="cursor-pointer" onClick={() => void openDetail(b.date)}>
        <td data-label="Tanggal" className="px-4 py-3 font-medium">{b.date}</td>
        <td data-label="Status" className="px-4 py-3">
          <Badge tone={b.completed ? "success" : "danger"}>
            {b.completed ? "Lengkap" : "Tidak selesai"}
          </Badge>
        </td>
        <td data-label="Baris" className="num-mono px-4 py-3 text-right tabular-nums">{b.totalRows.toLocaleString("id-ID")}</td>
        <td data-label="Tabel" className="num-mono px-4 py-3 text-right tabular-nums">{b.tableCount}</td>
        <td data-label="Selesai" className="px-4 py-3 text-xs text-text-secondary">{formatDateTime(b.completedAt)}</td>
      </tr>
    ));
    listBody = (
      <div className="overflow-x-auto">
        <table className="ledger-table w-full text-sm">
          <thead>
            <tr>
              <th className="px-4 py-3">Tanggal</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Baris</th>
              <th className="px-4 py-3 text-right">Tabel</th>
              <th className="px-4 py-3">Selesai</th>
            </tr>
          </thead>
          <tbody>{rows}</tbody>
        </table>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Backup"
        description="Snapshot harian D1 ke R2 (cron 03:00 UTC) + restore drill."
        action={
          <Button disabled={busy} onClick={() => void trigger()}>
            {busy ? "Menjalankan..." : "Backup manual + drill"}
          </Button>
        }
      />

      {error ? <div className="mb-4"><Toast message={error} /></div> : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Riwayat Backup"
            description="Backup per tanggal dari R2 (disimpan 30 hari)."
            action={<Button variant="secondary" onClick={() => void runDrill()} disabled={busy}>Jalankan drill</Button>}
          />
          {listBody}

          {drill ? (
            <div className="border-t border-border-subtle px-5 py-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Restore Drill terakhir</p>
                <Badge tone={drill.valid ? "success" : "danger"}>
                  {drill.valid ? "LULUS" : "GAGAL"}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-text-secondary">
                Backup {drill.date} — {drill.tableCount} tabel, {drill.totalRows.toLocaleString("id-ID")} baris, dicek {formatDateTime(drill.checkedAt)}
              </p>
              {drill.errors.length > 0 ? (
                <ul className="mt-2 list-inside list-disc space-y-0.5 text-xs text-error">
                  {drill.errors.map((e) => <li key={e}>{e}</li>)}
                </ul>
              ) : null}
            </div>
          ) : null}
        </Card>

        <Card>
          <CardHeader title="Detail Backup" description="Klik baris untuk memeriksa manifest." />
          {!detail ? (
            <EmptyState title="Pilih backup" description="Periksa integritas per tanggal." />
          ) : (
            <div className="p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">{detail.date}</h3>
                <Badge tone={detail.valid ? "success" : "danger"}>{detail.valid ? "Valid" : "Bermasalah"}</Badge>
              </div>
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between"><dt className="text-text-secondary">Total baris</dt><dd className="num-mono tabular-nums">{detail.totalRows.toLocaleString("id-ID")}</dd></div>
                <div className="flex justify-between"><dt className="text-text-secondary">Tabel</dt><dd className="num-mono tabular-nums">{detail.tableCount}</dd></div>
                <div className="flex justify-between"><dt className="text-text-secondary">Versi</dt><dd className="num-mono tabular-nums">{detail.version}</dd></div>
                <div className="flex justify-between"><dt className="text-text-secondary">Mulai</dt><dd>{formatDateTime(detail.startedAt)}</dd></div>
                <div className="flex justify-between"><dt className="text-text-secondary">Selesai</dt><dd>{formatDateTime(detail.completedAt)}</dd></div>
              </dl>
              <p className="mt-3 break-all font-mono text-[10px] text-text-tertiary">SHA-256: {detail.sha256}</p>

              {detail.sizeWarning ? <p className="mt-3 text-xs text-warning">{detail.sizeWarning}</p> : null}
              {detail.consistencyWarning ? (
                <p className="mt-3 text-xs text-warning">Catatan: backup bukan snapshot point-in-time transaksional.</p>
              ) : null}

              {detail.errors.length > 0 ? (
                <div className="mt-4">
                  <h4 className="mb-1 text-sm font-semibold">Masalah</h4>
                  <ul className="list-inside list-disc space-y-0.5 text-xs text-error">
                    {detail.errors.map((e) => <li key={e}>{e}</li>)}
                  </ul>
                </div>
              ) : null}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
