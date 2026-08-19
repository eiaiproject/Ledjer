import { useCallback, useEffect, useState, type ReactNode } from "react";
import { apiRequest } from "@/lib/api/client";
import { Badge, Button, Card, EmptyState, Input, PageHeader, PageLoader, Select, Toast, formatDateTime } from "@/components/ui";

interface UserRow {
  id: string;
  email: string;
  full_name: string;
  status: "active" | "disabled";
  email_verified_at: number | null;
  organization_count: number;
  has_oauth: boolean;
  created_at: number;
}

interface UserListResponse {
  users: UserRow[];
  total: number;
}

export function UsersPage() {
  const [data, setData] = useState<UserListResponse | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [limit, setLimit] = useState(50);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fetchUsers = useCallback(async () => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (status) params.set("status", status);
    params.set("limit", String(limit));
    return apiRequest<UserListResponse>(`/api/admin/users?${params.toString()}`);
  }, [search, status, limit]);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await fetchUsers());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat data");
    }
  }, [fetchUsers]);

  useEffect(() => {
    let cancelled = false;
    fetchUsers()
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Gagal memuat data");
      });
    return () => {
      cancelled = true;
    };
  }, [fetchUsers]);

  async function setUserStatus(user: UserRow, next: "active" | "disabled") {
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/api/admin/users/${user.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: next }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengubah status");
    } finally {
      setBusy(false);
    }
  }

  async function sendReset(user: UserRow) {
    if (!window.confirm(`Kirim email reset password untuk ${user.email}?`)) return;
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/api/admin/users/${user.id}/send-reset`, { method: "POST" });
      alert("Email reset password berhasil dikirim (jika EMAIL_API_KEY terkonfigurasi).");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengirim reset password");
    } finally {
      setBusy(false);
    }
  }

  async function deleteUser(user: UserRow) {
    if (!window.confirm(`HAPUS PERMANEN akun ${user.email} beserta organisasi yang dimiliki? Aksi ini tidak dapat dibatalkan.`)) return;
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/api/admin/users/${user.id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menghapus akun");
    } finally {
      setBusy(false);
    }
  }

  let tableBody: ReactNode;
  if (!data) {
    tableBody = <PageLoader />;
  } else if (data.users.length === 0) {
    tableBody = <EmptyState title="Tidak ada pengguna" description="Ubah filter pencarian." />;
  } else {
    const rows = data.users.map((user) => (
      <tr key={user.id}>
        <td data-label="Pengguna" className="px-4 py-3">
          <p className="font-medium">{user.full_name || "—"}</p>
          <p className="text-xs text-text-secondary">{user.email}</p>
        </td>
        <td data-label="Status" className="px-4 py-3">
          <Badge tone={user.status === "active" ? "success" : "neutral"}>
            {user.status === "active" ? "Aktif" : "Nonaktif"}
          </Badge>
          {user.has_oauth ? <span className="ml-2 text-xs text-text-tertiary">Google</span> : null}
        </td>
        <td data-label="Org" className="num-mono px-4 py-3 text-right tabular-nums">{user.organization_count}</td>
        <td data-label="Terdaftar" className="px-4 py-3 text-xs text-text-secondary">{formatDateTime(user.created_at)}</td>
        <td data-label="Aksi" className="px-4 py-3">
          <div className="flex flex-wrap items-center justify-end gap-2">
            {user.status === "active" ? (
              <Button variant="secondary" disabled={busy} onClick={() => void setUserStatus(user, "disabled")}>
                Nonaktifkan
              </Button>
            ) : (
              <Button variant="secondary" disabled={busy} onClick={() => void setUserStatus(user, "active")}>
                Aktifkan
              </Button>
            )}
            <Button variant="ghost" disabled={busy} onClick={() => void sendReset(user)}>Reset password</Button>
            <Button variant="danger" disabled={busy} onClick={() => void deleteUser(user)}>Hapus</Button>
          </div>
        </td>
      </tr>
    ));
    tableBody = (
      <div className="overflow-x-auto">
        <table className="ledger-table w-full text-sm">
          <thead>
            <tr>
              <th className="px-4 py-3">Pengguna</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Org</th>
              <th className="px-4 py-3">Terdaftar</th>
              <th className="px-4 py-3 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>{rows}</tbody>
        </table>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Pengguna" description={`${data?.total ?? 0} akun terdaftar di platform.`} />

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-border-subtle p-4">
          <Input
            placeholder="Cari email atau nama..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="max-w-[10rem]">
            <option value="">Semua status</option>
            <option value="active">Aktif</option>
            <option value="disabled">Nonaktif</option>
          </Select>
          <div className="ml-auto flex items-center gap-2">
            <Select value={String(limit)} onChange={(e) => setLimit(Number(e.target.value))} className="w-28">
              <option value="50">50 / halaman</option>
              <option value="100">100 / halaman</option>
              <option value="200">200 / halaman</option>
            </Select>
            <Button variant="secondary" onClick={() => void load()}>Muat ulang</Button>
          </div>
        </div>

        {error ? <div className="px-4 pt-4"><Toast message={error} /></div> : null}

        {tableBody}
      </Card>
    </div>
  );
}
