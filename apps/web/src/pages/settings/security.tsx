import { useState, useCallback } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization, useOrgPermissions } from "@/hooks/useOrganization";
import { deleteAccount } from "@/lib/api/auth";
import { Modal, ModalContent, ModalFooter } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "@/components/ui/toast";
import { PageShell } from "@/components/ui/page-shell";
import { PageGuide } from "@/components/ui/page-guide";
import { translateError } from "@/lib/errors";
import { apiRequest } from "@/lib/api/client";
import { formatShortDate } from "@/lib/utils";
import {
  Lock,
  History,
  ShieldCheck,
  InfoCircle,
  AlertTriangle,
} from "reicon-react";

// ── Password change types ──────────────────────────────────────────

interface ChangePasswordInput {
  currentPassword: string;
  password: string;
}

function changePasswordAPI(input: ChangePasswordInput): Promise<void> {
  return apiRequest<void>("/api/auth/change-password", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

// ── Audit log types ────────────────────────────────────────────────

interface AuditLogEntry {
  id: string;
  actor_user_id: string;
  actor_email: string;
  entity_type: string;
  entity_id: string;
  action: string;
  before_json: string | null;
  after_json: string | null;
  reason: string | null;
  created_at: string;
}

interface AuditLogResponse {
  auditLogs: AuditLogEntry[];
}

const ACTION_LABELS: Record<string, string> = {
  login: "Login",
  logout: "Logout",
  password_change: "Ganti password",
  organization_created: "Buat organisasi",
  organization_updated: "Update profil usaha",
  team_invite: "Undang anggota",
  team_invite_revoked: "Batalkan undangan",
  team_member_removed: "Hapus anggota",
  team_role_updated: "Ubah role anggota",
  transaction_created: "Buat transaksi",
  transaction_voided: "Batalkan transaksi",
  invoice_created: "Buat invoice",
  invoice_voided: "Batalkan invoice",
  invoice_payment: "Pembayaran invoice",
};

function formatAction(action: string): string {
  return ACTION_LABELS[action] || action.replaceAll("_", " ");
}

function formatAuditDate(epochStr: string): string {
  const ms = Number(epochStr);
  return formatShortDate(new Date(ms));
}

// ── Component ──────────────────────────────────────────────────────

export function SecuritySettingsPage() {
  const { user, signOut } = useAuth();
  const { data: orgData } = useOrganization();
  const { canViewAuditLog, isOwner } = useOrgPermissions();

  // Password form state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const changePasswordMutation = useMutation({
    mutationFn: changePasswordAPI,
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordError(null);
      toast.success("Password berhasil diubah. Silakan login kembali.");
    },
    onError: (err) => {
      const msg = translateError(err);
      setPasswordError(msg);
      toast.error(msg);
    },
  });

  const handleChangePassword = useCallback(
    (e: React.SyntheticEvent) => {
      e.preventDefault();
      setPasswordError(null);

      if (!currentPassword) {
        setPasswordError("Masukkan password saat ini.");
        return;
      }
      if (newPassword.length < 8) {
        setPasswordError("Password baru minimal 8 karakter.");
        return;
      }
      if (!/[A-Z]/.test(newPassword)) {
        setPasswordError("Password baru harus mengandung minimal 1 huruf besar.");
        return;
      }
      if (!/\d/.test(newPassword)) {
        setPasswordError("Password baru harus mengandung minimal 1 angka.");
        return;
      }
      if (newPassword !== confirmPassword) {
        setPasswordError("Konfirmasi password tidak cocok.");
        return;
      }

      changePasswordMutation.mutate({ currentPassword, password: newPassword });
    },
    [currentPassword, newPassword, confirmPassword, changePasswordMutation],
  );

  // ── Delete account state ────────────────────────────────────────

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteInput, setDeleteInput] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const deleteMutation = useMutation({
    mutationFn: (input: { password?: string; confirmation?: string }) => deleteAccount(input),
    onSuccess: async () => {
      await signOut();
      window.location.href = "/";
    },
    onError: (err) => {
      const msg = translateError(err);
      setDeleteError(msg);
      toast.error(msg);
    },
  });

  const handleDeleteAccount = useCallback(() => {
    setDeleteError(null);
    deleteMutation.mutate(
      user?.has_oauth ? { confirmation: deleteInput.trim() } : { password: deleteInput },
    );
  }, [user?.has_oauth, deleteInput, deleteMutation]);

  // Audit log query
  const {
    data: auditData,
    isLoading: auditLoading,
    error: auditError,
  } = useQuery({
    queryKey: ["audit-logs", orgData?.organization?.id],
    queryFn: () => apiRequest<AuditLogResponse>("/api/audit-logs?limit=20"),
    enabled: !!orgData?.organization?.id && canViewAuditLog,
    staleTime: 30_000,
  });

  const auditLogs = auditData?.auditLogs ?? [];

  // Compute audit log content to avoid nested ternary (S3358)
  const auditLogContent = (() => {
    if (!canViewAuditLog) {
      return (
        <div className="flex items-start gap-2 rounded-lg border border-wood-100 bg-cream-50 p-4">
          <InfoCircle className="mt-0.5 h-4 w-4 shrink-0 text-wood-400" />
          <p className="text-sm text-wood-500">
            Hanya pemilik dan admin yang dapat melihat aktivitas akun.
          </p>
        </div>
      );
    }
    if (auditLoading) {
      return (
        <div className="flex items-center justify-center py-6">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-wood-500 border-t-transparent" />
        </div>
      );
    }
    if (auditError) {
      return (
        <Callout variant="error">
          Gagal memuat aktivitas. Coba lagi nanti.
        </Callout>
      );
    }
    if (auditLogs.length === 0) {
      return (
        <EmptyState
          icon={<History className="h-6 w-6" />}
          title="Belum ada aktivitas"
          description="Aktivitas akun akan muncul di sini."
        />
      );
    }
    return (
      <div className="space-y-2">
        {auditLogs.map((log) => (
          <div
            key={log.id}
            className="flex items-start gap-3 rounded-lg border border-wood-100 bg-cream-50 p-3 transition-colors hover:bg-cream-100"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-wood-100 text-wood-600">
              <History className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-wood-700">
                  {formatAction(log.action)}
                </span>
                <span className="text-xs text-wood-500">
                  {formatAuditDate(log.created_at)}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-wood-500">
                {log.actor_email || "-"}
              </p>
            </div>
          </div>
        ))}
      </div>
    );
  })();

  return (
    <PageShell
      header={{
        title: "Akun & Keamanan",
        description: "Kelola akun, password, dan aktivitas keamanan.",
      }}
    >
      {/* Panduan halaman */}
      <PageGuide guideKey="settings/security" />

      {/* User Info */}
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-wood-700">Informasi Akun</h2>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <span className="block text-sm font-medium text-wood-700">Nama</span>
              <p className="mt-1 rounded-md border border-wood-100 bg-cream-50 px-3 py-2 text-sm text-wood-600">
                {user?.full_name || "-"}
              </p>
            </div>
            <div>
              <span className="block text-sm font-medium text-wood-700">Email</span>
              <p className="mt-1 rounded-md border border-wood-100 bg-cream-50 px-3 py-2 text-sm text-wood-600">
                {user?.email || "-"}
              </p>
            </div>
          </div>

          <div className="mt-4">
            <span className="block text-sm font-medium text-wood-700">Metode Masuk</span>
            <div className="mt-1 flex items-center gap-2 rounded-md border border-wood-100 bg-cream-50 px-3 py-2 text-sm text-wood-600">
              <ShieldCheck className="h-4 w-4 text-wood-400" />
              <span>Email & Password</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Password Change */}
      <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-wood-700">Ganti Password</h2>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleChangePassword} noValidate className="space-y-4">
              <Input
                label="Password Saat Ini"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Masukkan password saat ini"
                disabled={changePasswordMutation.isPending}
                autoComplete="current-password"
              />
              <Input
                label="Password Baru"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimal 8 karakter, 1 huruf besar, 1 angka"
                disabled={changePasswordMutation.isPending}
                autoComplete="new-password"
                helperText="Minimal 8 karakter, mengandung huruf besar dan angka."
              />
              <Input
                label="Konfirmasi Password Baru"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Ketik ulang password baru"
                disabled={changePasswordMutation.isPending}
                autoComplete="new-password"
              />

              {passwordError && (
                <Callout variant="error">
                  {passwordError}
                </Callout>
              )}

              <div className="flex justify-end">
                <Button
                  type="submit"
                  loading={changePasswordMutation.isPending}
                  disabled={changePasswordMutation.isPending}
                >
                  <Lock className="h-4 w-4" />
                  Ganti Password
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

      {/* Account Activity */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-wood-700">Aktivitas Akun</h2>
            {!auditLoading && auditLogs.length > 0 && (
              <Badge variant="neutral" size="sm">
                {auditLogs.length} aktivitas
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {auditLogContent}
        </CardContent>
      </Card>

      {/* Danger Zone - owner only */}
      {isOwner && (
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-error">Hapus Akun</h2>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-wood-600">
              Menghapus akun akan menghapus permanen{" "}
              {orgData?.organization?.name || "organisasi Anda"} beserta seluruh datanya
              (transaksi, jurnal, invoice, dan lainnya). Tindakan ini tidak dapat dibatalkan.
            </p>
            <div className="mt-4">
              <Button variant="danger" onClick={() => setDeleteOpen(true)}>
                <AlertTriangle className="h-4 w-4" />
                Hapus Akun
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Modal open={deleteOpen} onClose={() => setDeleteOpen(false)} size="sm" ariaLabel="Hapus Akun">
        <ModalContent>
          <h3 className="text-lg font-semibold text-wood-800">Hapus Akun Permanen</h3>
          <p className="mt-2 text-sm text-wood-600">
            Akun <span className="font-medium">{user?.email}</span> dan organisasi yang Anda
            miliki sendiri beserta seluruh datanya akan dihapus permanen. Tindakan ini tidak dapat
            dibatalkan.
          </p>
          <div className="mt-2 rounded-md border border-wood-100 bg-cream-50 p-3 text-xs text-wood-500">
            Sebelum menghapus, unduh backup data Anda:{" "}
            <a className="font-medium text-wood-700 underline" href="/api/exports/transactions.csv" download>
              Transaksi (CSV)
            </a>
            {" · "}
            <a className="font-medium text-wood-700 underline" href="/api/exports/accounts.csv" download>
              Akun (CSV)
            </a>
          </div>
          <div className="mt-4">
            <Input
              label={user?.has_oauth ? "Ketik HAPUS untuk konfirmasi" : "Password"}
              type={user?.has_oauth ? "text" : "password"}
              value={deleteInput}
              onChange={(e) => {
                setDeleteInput(e.target.value);
                setDeleteError(null);
              }}
              placeholder={user?.has_oauth ? "HAPUS" : "Masukkan password"}
              autoComplete={user?.has_oauth ? "off" : "current-password"}
              disabled={deleteMutation.isPending}
            />
          </div>
          {deleteError && (
            <Callout variant="error" className="mt-2">
              {deleteError}
            </Callout>
          )}
        </ModalContent>
        <ModalFooter>
          <Button variant="ghost" onClick={() => setDeleteOpen(false)} disabled={deleteMutation.isPending}>
            Batal
          </Button>
          <Button
            variant="danger"
            onClick={handleDeleteAccount}
            loading={deleteMutation.isPending}
            disabled={!deleteInput.trim() || deleteMutation.isPending}
          >
            Hapus Akun
          </Button>
        </ModalFooter>
      </Modal>
    </PageShell>
  );
}
