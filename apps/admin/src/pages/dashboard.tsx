import { useEffect, useState, type ReactNode } from "react";
import { apiRequest } from "@/lib/api/client";
import { Badge, Button, Card, CardHeader, EmptyState, PageHeader, PageLoader } from "@/components/ui";

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

type IdEntity = "users" | "organizations" | "transactions" | "journal_entries" | "products";
const ENTITY_TITLES: Record<IdEntity, string> = {
  users: "Total Pengguna",
  organizations: "Total Organisasi",
  transactions: "Transaksi",
  journal_entries: "Jurnal",
  products: "Produk",
};

interface EntityIdRow {
  id: string;
  label: string | null;
}

interface EntityIdsResponse {
  entity: string;
  items: EntityIdRow[];
}

function StatCard({ label, value, sub, onClick }: { readonly label: string; readonly value: number | string; readonly sub?: string; readonly onClick?: () => void }) {
  const body = (
    <>
      <p className="text-xs font-semibold uppercase tracking-wider text-text-secondary">{label}</p>
      <p className="num-mono mt-2 text-3xl font-semibold tabular-nums text-text-primary">{value.toLocaleString("id-ID")}</p>
      {sub ? <p className="mt-1 text-xs text-text-secondary">{sub}</p> : null}
    </>
  );
  if (!onClick) {
    return <Card className="p-5">{body}</Card>;
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="block w-full rounded-lg p-0 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-wood-500"
      title="Lihat detail ID"
    >
      <Card className="p-5 transition-colors hover:border-wood-400">{body}</Card>
    </button>
  );
}

function IdListModal({ entity, count, onClose }: { readonly entity: IdEntity; readonly count: number; readonly onClose: () => void }) {
  const [data, setData] = useState<EntityIdsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiRequest<EntityIdsResponse>(`/api/admin/monitoring/ids?entity=${encodeURIComponent(entity)}`)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Gagal memuat ID");
      });
    return () => {
      cancelled = true;
    };
  }, [entity]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  let listBody: ReactNode;
  if (error) {
    listBody = <div className="p-5"><EmptyState title="Gagal memuat ID" description={error} /></div>;
  } else if (!data) {
    listBody = <PageLoader />;
  } else if (data.items.length === 0) {
    listBody = <EmptyState title="Belum ada data" description="Tidak ada entri untuk ditampilkan." />;
  } else {
    listBody = (
      <ul className="divide-y divide-border-subtle">
        {data.items.map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-4 px-5 py-2.5 text-sm">
            <code className="min-w-0 break-all font-mono text-xs text-wood-700">{item.id}</code>
            {item.label ? <span className="shrink-0 text-xs text-text-tertiary">{item.label}</span> : null}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={`${ENTITY_TITLES[entity]} — ${count} item`}>
      <button type="button" aria-label="Tutup" onClick={onClose} className="absolute inset-0 cursor-default bg-wood-900/60" />
      <div className="relative flex max-h-[75vh] w-full max-w-lg flex-col rounded-lg border border-border bg-surface shadow-lg">
        <div className="flex items-center justify-between gap-3 border-b border-border-subtle px-5 py-4">
          <h2 className="text-base font-semibold">{ENTITY_TITLES[entity]}</h2>
          <div className="flex items-center gap-3">
            <span className="num-mono text-sm tabular-nums text-text-secondary">{count.toLocaleString("id-ID")} item</span>
            <Button variant="ghost" onClick={onClose}>Tutup</Button>
          </div>
        </div>
        <div className="min-h-[8rem] overflow-auto">{listBody}</div>
      </div>
    </div>
  );
}

function healthLabel(health: PlatformSummary["mainAppHealth"], unknown = "Tidak diketahui"): string {
  if (health === "up") return "Sehat";
  if (health === "down") return "Turun";
  return unknown;
}

function healthTone(health: PlatformSummary["mainAppHealth"]): "success" | "danger" | "neutral" {
  if (health === "up") return "success";
  if (health === "down") return "danger";
  return "neutral";
}

export function DashboardPage() {
  const [summary, setSummary] = useState<PlatformSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [idEntity, setIdEntity] = useState<IdEntity | null>(null);

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
          <Badge tone={healthTone(summary.mainAppHealth)}>
            Aplikasi utama: {healthLabel(summary.mainAppHealth)}
          </Badge>
        }
      />

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Total Pengguna" value={summary.counts.users} sub={`${summary.counts.active_users} aktif`} onClick={() => setIdEntity("users")} />
        <StatCard label="Total Organisasi" value={summary.counts.organizations} sub={`${summary.counts.active_organizations} aktif`} onClick={() => setIdEntity("organizations")} />
        <StatCard label="Transaksi" value={summary.counts.transactions} onClick={() => setIdEntity("transactions")} />
        <StatCard label="Jurnal" value={summary.counts.journal_entries} onClick={() => setIdEntity("journal_entries")} />
        <StatCard label="Produk" value={summary.counts.products} onClick={() => setIdEntity("products")} />
      </div>

      {idEntity ? <IdListModal key={idEntity} entity={idEntity} count={summary.counts[idEntity]} onClose={() => setIdEntity(null)} /> : null}

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
              <Badge tone={healthTone(summary.mainAppHealth)}>
                {healthLabel(summary.mainAppHealth, "Tidak dicek")}
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
