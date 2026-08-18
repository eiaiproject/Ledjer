import { useCallback, useEffect, useState, type FormEvent } from "react";
import { apiRequest, ApiError } from "@/lib/api/client";
import { Badge, Button, Card, CardHeader, EmptyState, Field, Input, PageHeader, PageLoader, Toast } from "@/components/ui";

interface AdminAccount {
  id: string;
  email: string;
  full_name: string;
  status: "active" | "disabled";
  last_login_at: number | null;
}

export function SettingsPage() {
  const [admins, setAdmins] = useState<AdminAccount[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [changing, setChanging] = useState(false);

  const [newEmail, setNewEmail] = useState("");
  const [newFullName, setNewFullName] = useState("");
  const [newAdminPassword, setNewAdminPassword] = useState("");
  const [creating, setCreating] = useState(false);

  const fetchAdmins = useCallback(async () => {
    return apiRequest<{ admins: AdminAccount[] }>("/api/admin/admins");
  }, []);

  const load = useCallback(async () => {
    setError(null);
    try {
      setAdmins((await fetchAdmins()).admins);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat admin");
    }
  }, [fetchAdmins]);

  useEffect(() => {
    let cancelled = false;
    fetchAdmins()
      .then((result) => {
        if (!cancelled) setAdmins(result.admins);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Gagal memuat admin");
      });
    return () => {
      cancelled = true;
    };
  }, [fetchAdmins]);

  async function handleChangePassword(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setChanging(true);
    try {
      await apiRequest("/api/admin/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, password: newPassword }),
      });
      setSuccess("Password berhasil diubah. Silakan masuk kembali.");
      setCurrentPassword("");
      setNewPassword("");
      setTimeout(() => { window.location.href = "/login"; }, 1200);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal mengubah password");
    } finally {
      setChanging(false);
    }
  }

  async function handleCreateAdmin(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setCreating(true);
    try {
      await apiRequest("/api/admin/admins", {
        method: "POST",
        body: JSON.stringify({ email: newEmail, password: newAdminPassword, fullName: newFullName }),
      });
      setSuccess("Akun admin baru berhasil dibuat.");
      setNewEmail("");
      setNewFullName("");
      setNewAdminPassword("");
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal membuat admin");
    } finally {
      setCreating(false);
    }
  }

  async function setAdminStatus(admin: AdminAccount, next: "active" | "disabled") {
    if (next === "disabled" && !window.confirm(`Nonaktifkan admin ${admin.email}? Semua sesinya akan diakhiri.`)) return;
    setError(null);
    setSuccess(null);
    try {
      await apiRequest(`/api/admin/admins/${admin.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: next }),
      });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal mengubah status admin");
    }
  }

  return (
    <div>
      <PageHeader title="Pengaturan" description="Kelola kredensial admin internal." />

      {error ? <div className="mb-4"><Toast message={error} /></div> : null}
      {success ? <div className="mb-4"><Toast message={success} tone="success" /></div> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Ubah Password Saya" description="Setelah diubah, semua sesi admin Anda berakhir." />
          <form onSubmit={handleChangePassword} className="space-y-4 p-5">
            <Field label="Password saat ini">
              <Input type="password" autoComplete="current-password" required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
            </Field>
            <Field label="Password baru" hint="Minimal 8 karakter, harus mengandung huruf besar dan angka.">
              <Input type="password" autoComplete="new-password" required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </Field>
            <Button type="submit" disabled={changing}>{changing ? "Menyimpan..." : "Ubah password"}</Button>
          </form>
        </Card>

        <Card>
          <CardHeader title="Tambah Admin" description="Buat akun admin internal baru." />
          <form onSubmit={handleCreateAdmin} className="space-y-4 p-5">
            <Field label="Nama lengkap">
              <Input required value={newFullName} onChange={(e) => setNewFullName(e.target.value)} />
            </Field>
            <Field label="Email">
              <Input type="email" required value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
            </Field>
            <Field label="Password awal" hint="Minimal 8 karakter, huruf besar dan angka.">
              <Input type="password" required value={newAdminPassword} onChange={(e) => setNewAdminPassword(e.target.value)} />
            </Field>
            <Button type="submit" disabled={creating}>{creating ? "Membuat..." : "Buat admin"}</Button>
          </form>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title="Daftar Admin" description="Semua akun dengan akses ke panel ini." />
        {!admins ? (
          <PageLoader />
        ) : admins.length === 0 ? (
          <EmptyState title="Belum ada admin" />
        ) : (
          <div className="overflow-x-auto">
            <table className="ledger-table w-full text-sm">
              <thead>
                <tr>
                  <th className="px-4 py-3">Admin</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Login terakhir</th>
                  <th className="px-4 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {admins.map((admin) => (
                  <tr key={admin.id}>
                    <td className="px-4 py-3">
                      <p className="font-medium">{admin.full_name || "—"}</p>
                      <p className="text-xs text-text-secondary">{admin.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={admin.status === "active" ? "success" : "neutral"}>
                        {admin.status === "active" ? "Aktif" : "Nonaktif"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-text-secondary">
                      {admin.last_login_at ? new Date(admin.last_login_at).toLocaleString("id-ID") : "Belum pernah"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {admin.status === "active" ? (
                        <Button variant="secondary" onClick={() => void setAdminStatus(admin, "disabled")}>Nonaktifkan</Button>
                      ) : (
                        <Button variant="secondary" onClick={() => void setAdminStatus(admin, "active")}>Aktifkan</Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
