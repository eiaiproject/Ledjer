import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/database-types";
import { useOrganization, useIsOwner } from "@/hooks/useOrganization";
import { fetchProfilesByUserIds } from "@/lib/profiles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageSpinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { translateError } from "@/lib/errors";
import { toast } from "@/components/ui/toast-api";
import {
  UserPlus,
  Shield,
  Trash2,
  ChevronDown,
  ChevronUp,
  Crown,
  Users,
  Info,
  LinkIcon,
} from "lucide-react";

/* ─── Types ─────────────────────────────────────────────── */

interface StaffMember {
  id: string;
  user_id: string;
  role: string;
  status: string;
  can_create_transaction: boolean;
  can_view_reports: boolean;
  can_manage_accounts: boolean;
  can_void_transaction: boolean;
  can_manage_products: boolean;
  can_view_audit_log: boolean;
  joined_at: string | null;
  profiles?: { full_name: string; email: string };
}

type StaffPermissionKey =
  | "can_create_transaction"
  | "can_view_reports"
  | "can_manage_accounts"
  | "can_void_transaction"
  | "can_manage_products"
  | "can_view_audit_log";

const PERMISSION_LABELS: Record<
  StaffPermissionKey,
  { label: string; desc: string }
> = {
  can_create_transaction: {
    label: "Buat Transaksi",
    desc: "Dapat mencatat transaksi baru",
  },
  can_view_reports: {
    label: "Lihat Laporan",
    desc: "Dapat melihat buku besar, neraca saldo, laba rugi",
  },
  can_manage_accounts: {
    label: "Kelola Akun",
    desc: "Dapat menambah/mengedit akun",
  },
  can_void_transaction: {
    label: "Batalkan Transaksi",
    desc: "Dapat membatalkan transaksi yang sudah posted",
  },
  can_manage_products: {
    label: "Kelola Produk",
    desc: "Dapat menambah/mengedit produk dan persediaan",
  },
  can_view_audit_log: {
    label: "Lihat Audit Log",
    desc: "Dapat melihat log aktivitas",
  },
};

const ALL_PERMISSION_KEYS = Object.keys(PERMISSION_LABELS) as StaffPermissionKey[];

/* ─── Helpers ───────────────────────────────────────────── */

function getInitial(name: string | undefined): string {
  return name?.charAt(0)?.toUpperCase() || "?";
}

function formatJoinedDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return d.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function countActivePermissions(member: StaffMember): number {
  return ALL_PERMISSION_KEYS.filter((k) => Boolean(member[k])).length;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/* ─── Main Page ─────────────────────────────────────────── */

export function TeamSettingsPage() {
  const queryClient = useQueryClient();
  const { data: orgData } = useOrganization();
  const isOwner = useIsOwner();
  const currentPlan = orgData?.organization?.current_plan || "free";

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<StaffMember | null>(null);

  /* ── Queries ── */

  const { data: members, isLoading } = useQuery({
    queryKey: ["org-members", orgData?.organization?.id],
    queryFn: async () => {
      if (!orgData?.organization?.id) return [];
      const { data, error } = await supabase
        .from("organization_members")
        .select(
          "id, user_id, role, status, can_create_transaction, can_view_reports, can_manage_accounts, can_void_transaction, can_manage_products, can_view_audit_log, joined_at"
        )
        .eq("organization_id", orgData.organization.id)
        .neq("status", "removed")
        .order("role");
      if (error) throw error;

      const membersData = (data || []) as StaffMember[];
      const profiles = await fetchProfilesByUserIds(
        membersData.map((m) => m.user_id)
      );

      return membersData.map((m) => ({
        ...m,
        profiles: profiles[m.user_id],
      }));
    },
    enabled: !!orgData?.organization?.id,
  });

  /* ── Mutations ── */

  const inviteMutation = useMutation({
    mutationFn: async (email: string) => {
      const organizationId = orgData?.organization?.id;
      if (!organizationId) throw new Error("Organisasi tidak ditemukan");
      const { data, error } = await supabase.rpc("invite_staff", {
        p_organization_id: organizationId,
        p_email: email.trim(),
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      setInviteEmail("");
      setInviteError(null);
      toast.success("Undangan berhasil dikirim");
      queryClient.invalidateQueries({ queryKey: ["org-members"] });
    },
    onError: (err: Error) => {
      setInviteError(err.message);
    },
  });

  const permissionMutation = useMutation({
    mutationFn: async ({
      memberId,
      permission,
      value,
    }: {
      memberId: string;
      permission: StaffPermissionKey;
      value: boolean;
    }) => {
      const organizationId = orgData?.organization?.id;
      if (!organizationId) throw new Error("Organisasi tidak ditemukan");
      const rpcArgs = {
        p_organization_id: organizationId,
        p_member_id: memberId,
        [permission]: value,
      } as Database["public"]["Functions"]["update_staff_permissions"]["Args"];
      const { error } = await supabase.rpc(
        "update_staff_permissions",
        rpcArgs
      );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org-members"] });
      toast.success("Izin berhasil diupdate");
    },
    onError: (err) => toast.error(translateError(err)),
  });

  const removeMutation = useMutation({
    mutationFn: async (memberId: string) => {
      const organizationId = orgData?.organization?.id;
      if (!organizationId) throw new Error("Organisasi tidak ditemukan");
      const { error } = await supabase.rpc("remove_staff", {
        p_organization_id: organizationId,
        p_member_id: memberId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org-members"] });
      toast.success("Staf berhasil dihapus");
      setRemoveDialogOpen(false);
      setSelectedMember(null);
    },
    onError: (err) => toast.error(translateError(err)),
  });

  /* ── Derived ── */

  const staffMembers = useMemo(
    () => members?.filter((m) => m.role === "staff") || [],
    [members]
  );
  const ownerMembers = useMemo(
    () => members?.filter((m) => m.role === "owner") || [],
    [members]
  );
  const isBusinessPlan = currentPlan === "business";
  const staffSlotFull = staffMembers.length >= 1;
  const canInvite = isOwner && isBusinessPlan && !staffSlotFull;

  const handleInvite = () => {
    const trimmed = inviteEmail.trim();
    if (!isValidEmail(trimmed)) {
      setInviteError("Format email tidak valid.");
      return;
    }
    inviteMutation.mutate(trimmed);
  };

  const handleRemoveClick = (member: StaffMember) => {
    setSelectedMember(member);
    setRemoveDialogOpen(true);
  };

  /* ── Render ── */

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex flex-col gap-8 lg:flex-row">
        {/* ── Main Content ── */}
        <div className="min-w-0 flex-1 space-y-6">
          {/* Page Header */}
          <div>
            <h1 className="text-2xl font-bold text-wood-900">Tim & Izin</h1>
            <p className="mt-1 text-sm text-wood-500">
              Kelola anggota tim dan hak akses mereka.
            </p>
          </div>

          {/* Summary Chips */}
          {members && (
            <div className="flex flex-wrap gap-3">
              <div className="inline-flex items-center gap-2 rounded-lg border border-wood-200 bg-cream-50 px-3 py-2 text-sm">
                <Crown className="h-4 w-4 text-honey-600" />
                <span className="text-wood-600">Pemilik</span>
                <span className="font-semibold text-wood-800">
                  {ownerMembers.length}
                </span>
              </div>
              <div className="inline-flex items-center gap-2 rounded-lg border border-wood-200 bg-cream-50 px-3 py-2 text-sm">
                <Users className="h-4 w-4 text-wood-500" />
                <span className="text-wood-600">Staf</span>
                <span className="font-semibold text-wood-800">
                  {isBusinessPlan
                    ? `${staffMembers.length}/1`
                    : staffMembers.length}
                </span>
              </div>
            </div>
          )}

          {/* Owner Section */}
          <section aria-labelledby="owners-heading">
            <Card>
              <CardHeader>
                <h2
                  id="owners-heading"
                  className="text-sm font-semibold text-wood-700"
                >
                  Pemilik
                </h2>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <PageSpinner />
                ) : (
                  <div className="space-y-3">
                    {ownerMembers.map((member) => (
                      <div
                        key={member.id}
                        className="flex items-center justify-between rounded-lg border border-wood-100 bg-cream-50 p-4"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-honey-100 text-honey-700 text-sm font-semibold">
                            {getInitial(member.profiles?.full_name)}
                          </div>
                          <div>
                            <p className="font-medium text-wood-800">
                              {member.profiles?.full_name || "Pemilik"}
                            </p>
                            <p className="text-xs text-wood-400">
                              {member.profiles?.email}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="premium" size="sm" dot>
                            Owner
                          </Badge>
                          <span className="text-xs text-wood-400 hidden sm:inline">
                            Akses penuh ke semua fitur
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </section>

          {/* Staff Section */}
          <section aria-labelledby="staff-heading">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <h2
                    id="staff-heading"
                    className="text-sm font-semibold text-wood-700"
                  >
                    Staf
                  </h2>
                  {isOwner && isBusinessPlan && (
                    <Badge variant="neutral" size="sm">
                      {staffMembers.length}/1 slot terpakai
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {/* Non-owner */}
                {!isOwner && (
                  <div className="rounded-lg border border-wood-100 bg-cream-50 p-4 text-center">
                    <p className="text-sm text-wood-500">
                      Hanya pemilik yang dapat mengelola staf. Anda dapat
                      melihat daftar staf di bawah.
                    </p>
                  </div>
                )}

                {/* Non-business plan (owner) */}
                {isOwner && !isBusinessPlan && (
                  <div className="rounded-lg border border-warning-border bg-warning-bg p-4">
                    <p className="text-sm font-medium text-warning">
                      Mengundang staf memerlukan paket{" "}
                      <strong>Business</strong>.
                    </p>
                    <Link
                      to="/settings/billing"
                      className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-warning underline underline-offset-2 hover:text-warning/80"
                    >
                      Upgrade ke Business
                      <LinkIcon className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                )}

                {/* Business plan - staff content */}
                {isBusinessPlan && (
                  <>
                    {/* Invite form — always show if can invite */}
                    {canInvite && (
                      <div className="mb-4 rounded-lg border border-dashed border-wood-300 bg-cream-50 p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <UserPlus className="h-4 w-4 text-wood-500" />
                          <p className="text-sm font-medium text-wood-700">
                            Undang staf baru
                          </p>
                        </div>
                        <p className="mb-3 text-xs text-wood-400">
                          Staf harus sudah mendaftar di Ledjer terlebih dahulu.
                        </p>
                        {inviteError && (
                          <div className="mb-3 rounded-md border border-error-border bg-error-bg px-3 py-2 text-xs text-error">
                            {inviteError}
                          </div>
                        )}
                        <div className="flex gap-2">
                          <Input
                            type="email"
                            value={inviteEmail}
                            onChange={(e) => {
                              setInviteEmail(e.target.value);
                              if (inviteError) setInviteError(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleInvite();
                            }}
                            placeholder="email@contoh.com"
                            aria-label="Email staf"
                          />
                          <Button
                            type="button"
                            onClick={handleInvite}
                            loading={inviteMutation.isPending}
                            disabled={
                              !inviteEmail.trim() ||
                              !isValidEmail(inviteEmail) ||
                              inviteMutation.isPending
                            }
                          >
                            Undang
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Slot full message */}
                    {staffSlotFull && isOwner && (
                      <div className="mb-4 flex items-center gap-2 rounded-lg border border-wood-200 bg-cream-100 px-4 py-3 text-sm text-wood-600">
                        <Info className="h-4 w-4 shrink-0 text-wood-400" />
                        Slot staf sudah terpakai. Hapus staf untuk mengundang
                        yang baru.
                      </div>
                    )}

                    {/* Staff list */}
                    {staffMembers.length === 0 ? (
                      <EmptyState
                        title="Belum ada staf"
                        description="Undang staf untuk membantu mengelola bisnis Anda."
                      />
                    ) : (
                      <div className="space-y-3">
                        {staffMembers.map((member) => (
                          <StaffCard
                            key={member.id}
                            member={member}
                            isOwner={isOwner}
                            onPermissionChange={(permission, value) =>
                              permissionMutation.mutate({
                                memberId: member.id,
                                permission,
                                value,
                              })
                            }
                            onRemove={() => handleRemoveClick(member)}
                            permissionPending={permissionMutation.isPending}
                            removePending={removeMutation.isPending}
                          />
                        ))}
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </section>
        </div>

        {/* ── Sidebar (desktop only) ── */}
        <aside className="hidden w-72 shrink-0 lg:block">
          <div className="sticky top-8 space-y-4">
            <Card variant="filled" padding="md">
              <CardHeader>
                <h3 className="text-sm font-semibold text-wood-700">
                  Tentang Izin Staf
                </h3>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3 text-xs text-wood-600">
                  <li className="flex items-start gap-2">
                    <Shield className="mt-0.5 h-3.5 w-3.5 shrink-0 text-wood-400" />
                    Berikan hanya akses yang benar-benar dibutuhkan.
                  </li>
                  <li className="flex items-start gap-2">
                    <Shield className="mt-0.5 h-3.5 w-3.5 shrink-0 text-wood-400" />
                    Tinjau izin staf secara berkala.
                  </li>
                  <li className="flex items-start gap-2">
                    <Shield className="mt-0.5 h-3.5 w-3.5 shrink-0 text-wood-400" />
                    Gunakan log audit untuk memantau aktivitas sensitif.
                  </li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </aside>
      </div>

      {/* Confirm Dialog */}
      <ConfirmDialog
        open={removeDialogOpen}
        onClose={() => {
          setRemoveDialogOpen(false);
          setSelectedMember(null);
        }}
        onConfirm={() =>
          selectedMember && removeMutation.mutate(selectedMember.id)
        }
        title="Hapus Staf?"
        message={`"${selectedMember?.profiles?.full_name}" akan dihapus dari organisasi. Semua aksesnya akan dicabut.`}
        confirmLabel="Ya, Hapus"
        loading={removeMutation.isPending}
      />
    </div>
  );
}

/* ─── Staff Card ────────────────────────────────────────── */

function StaffCard({
  member,
  isOwner,
  onPermissionChange,
  onRemove,
  permissionPending,
  removePending,
}: {
  member: StaffMember;
  isOwner: boolean;
  onPermissionChange: (permission: StaffPermissionKey, value: boolean) => void;
  onRemove: () => void;
  permissionPending: boolean;
  removePending: boolean;
}) {
  const [showPerms, setShowPerms] = useState(false);
  const activeCount = countActivePermissions(member);
  const joinedDate = formatJoinedDate(member.joined_at);

  return (
    <div className="rounded-lg border border-wood-200 bg-cream-50">
      {/* Card Header */}
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-leaf-100 text-leaf-700 text-sm font-semibold">
            {getInitial(member.profiles?.full_name)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="font-medium text-wood-800">
                {member.profiles?.full_name || "Staf"}
              </p>
              {member.status && member.status !== "active" && (
                <Badge variant="warning" size="sm">
                  {member.status}
                </Badge>
              )}
            </div>
            <p className="text-xs text-wood-400">
              {member.profiles?.email}
              {joinedDate && (
                <span className="ml-2 text-wood-300">
                  · Bergabung {joinedDate}
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowPerms(!showPerms)}
            aria-expanded={showPerms}
            disabled={permissionPending}
          >
            <Shield className="h-4 w-4" />
            <span className="hidden sm:inline">Izin</span>
            <span className="text-xs text-wood-400">
              {activeCount}
            </span>
            {showPerms ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
          </Button>
          {isOwner && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onRemove}
              disabled={removePending}
              aria-label={`Hapus ${member.profiles?.full_name || "staf"}`}
              className="text-error hover:text-error hover:bg-error/10"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Permission Summary (collapsed) */}
      {!showPerms && (
        <div className="border-t border-wood-100 px-4 py-2 text-xs text-wood-400">
          {activeCount > 0
            ? `${activeCount} izin aktif`
            : "Belum ada izin aktif"}
        </div>
      )}

      {/* Permission Panel (expanded) */}
      {showPerms && (
        <div className="border-t border-wood-100 bg-cream-100/50 px-4 py-3">
          <p className="mb-2 text-xs font-medium text-wood-600">Hak Akses</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {ALL_PERMISSION_KEYS.map((key) => {
              const { label, desc } = PERMISSION_LABELS[key];
              const checked = Boolean(member[key]);
              return (
                <button
                  key={key}
                  type="button"
                  role="switch"
                  aria-checked={checked}
                  aria-label={`${label}: ${checked ? "aktif" : "nonaktif"}`}
                  disabled={permissionPending}
                  onClick={() => onPermissionChange(key, !checked)}
                  className={`flex items-start gap-3 rounded-md border p-3 text-left transition-colors ${
                    checked
                      ? "border-leaf-300 bg-leaf-50"
                      : "border-wood-200 bg-cream-50 hover:bg-cream-100"
                  } ${permissionPending ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                >
                  <span
                    className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                      checked
                        ? "border-leaf-500 bg-leaf-500"
                        : "border-wood-300 bg-cream-50"
                    }`}
                    aria-hidden="true"
                  >
                    {checked && (
                      <svg
                        className="h-3 w-3 text-white"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={3}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-wood-700">
                      {label}
                    </span>
                    <span className="block text-xs text-wood-400">{desc}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
