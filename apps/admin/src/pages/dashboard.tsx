import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api/client";
import { Badge, Card, CardHeader, EmptyState, PageHeader, PageLoader } from "@/components/ui";

interface PlatformSummary {
  counts: {
    users: number;
    active_users: number;
    organizations: number;
    active_organizations: number;
    transactions: number;
    journal_entries: number;
    products: number;
    admins: number;
    active_admins: number;
  };
  registrationsLast7Days: { date: string; count: number }[];
  mainAppHealth: "up" | "down" | "unknown";
}

function StatCard({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <Card className="p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-text-secondary">{label}</p>
      <p className="num-mono mt-2 text-3xl font-semibold tabular-nums text-text-primary">{value.toLocaleString("id-ID")}</p>
      {sub ? <p className="mt-1 text-xs text-text-secondary">{sub}</p> : null}
    </Card>
  );
}

export function DashboardPage() {
  const [summary, setSummary] = useState<PlatformSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiRequest<PlatformSummary>("/api/admin/monitoring/summary")
      .then(setSummary)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Gagal memuat ringkasan"));
  }, []);

  if (error) return <EmptyState title="Gagal memuat data" description={error} />;
  if (!summary) return <PageLoader />;

  const maxReg = Math.max(1, ...summary.registrationsLast7Days.map((r) => r.count));

  return (
    <div>
      <PageHeader
        title="Ringkasan Platform"
        description="Statistik agregat seluruh tenant di sistem."
        action={
          <Badge tone={summary.mainAppHealth === "up" ? "success" : "danger"}>
            Aplikasi utama: {summary.mainAppHealth === "up" ? "Sehat" : summary.mainAppHealth === "down" ? "Turun" : "Tidak diketahui"}
          </Badge>
        }
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Total Pengguna" value={summary.counts.users} sub={`${summary.counts.active_users} aktif`} />
        <StatCard label="Total Organisasi" value={summary.counts.organizations} sub={`${summary.counts.active_organizations} aktif`} />
        <StatCard label="Transaksi" value={summary.counts.transactions} />
        <StatCard label="Jurnal" value={summary.counts.journal_entries} />
        <StatCard label="Produk" value={summary.counts.products} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Registrasi 7 Hari Terakhir" description="Pengguna baru per hari (WIB)." />
          <div className="p-5">
            {summary.registrationsLast7Days.length === 0 ? (
              <EmptyState title="Belum ada registrasi" description="Tidak ada pengguna baru dalam 7 hari terakhir." />
            ) : (
              <div className="flex h-40 items-end gap-2">
                {summary.registrationsLast7Days.map((r) => (
                  <div key={r.date} className="flex flex-1 flex-col items-center gap-1" title={`${r.date}: ${r.count} pengguna`}>
                    <span className="text-xs font-medium tabular-nums">{r.count}</span>
                    <div
                      className="w-full rounded-t bg-wood-500"
                      style={{ height: `${Math.max(4, (r.count / maxReg) * 100)}%` }}
                    />
                    <span className="text-[10px] text-text-tertiary">{r.date.slice(5)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Status Sistem" description="Kesehatan komponen platform." />
          <div className="divide-y divide-border-subtle">
            <div className="flex items-center justify-between px-5 py-3.5">
              <span className="text-sm text-text-secondary">Database (D1)</span>
              <Badge tone="success">Terkoneksi</Badge>
            </div>
            <div className="flex items-center justify-between px-5 py-3.5">
              <span className="text-sm text-text-secondary">Aplikasi utama (ledjer.id)</span>
              <Badge tone={summary.mainAppHealth === "up" ? "success" : summary.mainAppHealth === "down" ? "danger" : "neutral"}>
                {summary.mainAppHealth === "up" ? "Sehat" : summary.mainAppHealth === "down" ? "Turun" : "Tidak dicek"}
              </Badge>
            </div>
            <div className="flex items-center justify-between px-5 py-3.5">
              <span className="text-sm text-text-secondary">Akun admin aktif</span>
              <span className="num-mono text-sm font-medium tabular-nums">
                {summary.counts.active_admins} / {summary.counts.admins}
              </span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
