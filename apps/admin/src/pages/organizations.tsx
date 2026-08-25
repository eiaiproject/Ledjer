import { useCallback, useEffect, useState, type ReactNode } from "react";
import { apiRequest } from "@/lib/api/client";
import { Badge, Button, Card, EmptyState, Input, PageHeader, PageLoader, Select, Toast, formatDateTime } from "@/components/ui";

interface OrganizationRow {
  id: string;
  name: string;
  business_type: "service" | "simple_trading";
  status: "active" | "disabled";
  onboarding_status: string;
  created_at: number;
  member_count: number;
}

interface OrganizationListResponse {
  organizations: OrganizationRow[];
  total: number;
}

interface OrganizationDetail {
  id: string;
  name: string;
  business_type: "service" | "simple_trading";
  base_currency: string;
  books_start_date: string;
  status: "active" | "disabled";
  created_at: number;
  member_count: number;
  transaction_count: number;
  journal_entry_count: number;
  owner_email: string | null;
  members: {
    id: string;
    email: string | null;
    full_name: string | null;
    role: "owner" | "admin" | "member" | "viewer";
    status: string;
    joined_at: number | null;
  }[];
}

function roleTone(role: string): "info" | "warning" | "neutral" {
  if (role === "owner") return "info";
  if (role === "admin") return "warning";
  return "neutral";
}

export function OrganizationsPage() {
  const [data, setData] = useState<OrganizationListResponse | null>(null);
  const [detail, setDetail] = useState<OrganizationDetail | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fetchOrganizations = useCallback(async () => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (status) params.set("status", status);
    return apiRequest<OrganizationListResponse>(`/api/admin/organizations?${params.toString()}`);
  }, [search, status]);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await fetchOrganizations());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat data");
    }
  }, [fetchOrganizations]);

  useEffect(() => {
    let cancelled = false;
    fetchOrganizations()
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Gagal memuat data");
      });
    return () => {
      cancelled = true;
    };
  }, [fetchOrganizations]);

  async function openDetail(org: OrganizationRow) {
    setError(null);
    setDetail(null);
    try {
      const result = await apiRequest<{ organization: OrganizationDetail }>(`/api/admin/organizations/${org.id}`);
      setDetail(result.organization);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat detail");
    }
  }

  async function setOrgStatus(orgId: string, next: "active" | "disabled") {
    if (!window.confirm(`Ubah status organisasi menjadi ${next === "disabled" ? "NONAKTIF" : "aktif"}? ${next === "disabled" ? "Anggota tidak bisa mengakses data sampai diaktifkan kembali." : ""}`)) return;
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/api/admin/organizations/${orgId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: next }),
      });
      await load();
      if (detail?.id === orgId) {
        const result = await apiRequest<{ organization: OrganizationDetail }>(`/api/admin/organizations/${orgId}`);
        setDetail(result.organization);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengubah status");
    } finally {
      setBusy(false);
    }
  }

  let listBody: ReactNode;
  if (!data) {
    listBody = <PageLoader />;
  } else if (data.organizations.length === 0) {
    listBody = <EmptyState title="Tidak ada organisasi" description="Ubah filter pencarian." />;
  } else {
    const rows = data.organizations.map((org) => (
      <tr key={org.id} className="cursor-pointer" onClick={() => void openDetail(org)}>
        <td data-label="Organisasi" className="px-4 py-3">
          <p className="font-medium">{org.name}</p>
        </td>
        <td data-label="Tipe" className="px-4 py-3 text-xs text-text-secondary">
          {org.business_type === "service" ? "Jasa" : "Jual beli"}
        </td>
        <td data-label="Status" className="px-4 py-3">
          <Badge tone={org.status === "active" ? "success" : "neutral"}>
            {org.status === "active" ? "Aktif" : "Nonaktif"}
          </Badge>
        </td>
        <td data-label="Anggota" className="num-mono px-4 py-3 text-right tabular-nums">{org.member_count}</td>
        <td data-label="Dibuat" className="px-4 py-3 text-xs text-text-secondary">{formatDateTime(org.created_at)}</td>
      </tr>
    ));
    listBody = (
      <div className="overflow-x-auto">
        <table className="ledger-table w-full text-sm">
          <thead>
            <tr>
              <th className="px-4 py-3">Organisasi</th>
              <th className="px-4 py-3">Tipe</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Anggota</th>
              <th className="px-4 py-3">Dibuat</th>
            </tr>
          </thead>
          <tbody>{rows}</tbody>
        </table>
      </div>
    );
  }

  const roleLabel: Record<string, string> = { owner: "Pemilik", admin: "Admin", member: "Anggota", viewer: "Penonton" };

  return (
    <div>
      <PageHeader title="Organisasi" description={`${data?.total ?? 0} organisasi terdaftar.`} />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="flex flex-wrap items-center gap-3 border-b border-border-subtle p-4">
            <Input
              placeholder="Cari nama organisasi..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-xs"
            />
            <Select value={status} onChange={(e) => setStatus(e.target.value)} className="max-w-[10rem]">
              <option value="">Semua status</option>
              <option value="active">Aktif</option>
              <option value="disabled">Nonaktif</option>
            </Select>
            <Button variant="secondary" className="ml-auto" onClick={() => void load()}>Muat ulang</Button>
          </div>

          {error ? <div className="px-4 pt-4"><Toast message={error} /></div> : null}

              {listBody}

        </Card>

        <Card>
          <div className="border-b border-border-subtle px-5 py-4">
            <h2 className="text-base font-semibold">Detail Organisasi</h2>
          </div>
          {!detail ? (
            <EmptyState title="Pilih organisasi" description="Klik baris untuk melihat detail." />
          ) : (
            <div className="p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">{detail.name}</h3>
                <Badge tone={detail.status === "active" ? "success" : "danger"}>
                  {detail.status === "active" ? "Aktif" : "Nonaktif"}
                </Badge>
              </div>
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between"><dt className="text-text-secondary">Tipe bisnis</dt><dd>{detail.business_type === "service" ? "Jasa" : "Jual beli"}</dd></div>
                <div className="flex justify-between"><dt className="text-text-secondary">Mata uang</dt><dd>{detail.base_currency}</dd></div>
                <div className="flex justify-between"><dt className="text-text-secondary">Buku mulai</dt><dd>{detail.books_start_date}</dd></div>
                <div className="flex justify-between"><dt className="text-text-secondary">Pemilik</dt><dd className="max-w-[55%] truncate">{detail.owner_email ?? "-"}</dd></div>
                <div className="flex justify-between"><dt className="text-text-secondary">Transaksi</dt><dd className="num-mono tabular-nums">{detail.transaction_count.toLocaleString("id-ID")}</dd></div>
                <div className="flex justify-between"><dt className="text-text-secondary">Jurnal</dt><dd className="num-mono tabular-nums">{detail.journal_entry_count.toLocaleString("id-ID")}</dd></div>
              </dl>

              <div className="mt-5">
                <h4 className="mb-2 text-sm font-semibold">Anggota ({detail.members.length})</h4>
                <ul className="divide-y divide-border-subtle">
                  {detail.members.map((m) => (
                    <li key={m.id} className="flex items-center justify-between py-2 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{m.full_name || m.email || "-"}</p>
                        {m.email && m.full_name ? <p className="truncate text-xs text-text-secondary">{m.email}</p> : null}
                      </div>
                      <Badge tone={roleTone(m.role)}>
                        {roleLabel[m.role] ?? m.role}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-5 border-t border-border-subtle pt-4">
                {detail.status === "active" ? (
                  <Button variant="danger" disabled={busy} className="w-full" onClick={() => void setOrgStatus(detail.id, "disabled")}>
                    Nonaktifkan organisasi
                  </Button>
                ) : (
                  <Button disabled={busy} className="w-full" onClick={() => void setOrgStatus(detail.id, "active")}>
                    Aktifkan kembali
                  </Button>
                )}
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
