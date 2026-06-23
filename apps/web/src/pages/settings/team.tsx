import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Database } from "@ledjer/database-types";
import { useOrganization, useIsOwner, useOrgPermissions } from "@/hooks/useOrganization";
import { fetchProfilesByUserIds } from "@/lib/profiles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageSpinner } from "@/components/ui/spinner";
import { ErrorState } from "@/components/ui/error-state";
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
  Lock,
  Check,
  X,
  Sparkles,
  ArrowRight,
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
  { label: string; icon?: string }
> = {
  can_create_transaction: { label: "Buat transaksi" },
  can_view_reports: { label: "Lihat laporan" },
  can_manage_accounts: { label: "Kelola akun" },
  can_void_transaction: { label: "Batalkan transaksi" },
  can_manage_products: { label: "Kelola produk" },
  can_view_audit_log: { label: "Lihat audit log" },
};

const ALL_PERMISSION_KEYS = Object.keys(PERMISSION_LABELS) as StaffPermissionKey[];

const PLAN_NAMES: Record<string, string> = {
  free: "Gratis",
  solo: "Solo",
  business: "Business",
};

/* ─── Helpers ───────────────────────────────────────────── */

function getInitials(name: string | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
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

/* ─── Plan Info Card ────────────────────────────────────── */

function PlanInfoCard({
  currentPlan,
  staffCount,
  isOwner,
}: {
  currentPlan: string;
  staffCount: number;
  isOwner: boolean;
}) {
  const planName = PLAN_NAMES[currentPlan] || "Gratis";
  const isBusiness = currentPlan === "business";
  const staffLimit = isBusiness ? 1 : 0;
  const staffUsed = staffCount;


  return (
    <Card variant="elevated">
      <CardContent className="p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-wood-500">Paket saat ini:</span>
              <Badge variant={isBusiness ? "success" : "neutral"}>{planName}</Badge>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <Users className="h-4 w-4 text-wood-500" />
              <span className="text-sm text-wood-600">
                Staf digunakan:{" "}
                <span className="font-semibold text-wood-800">
                  {isBusiness ? `${staffUsed} / ${staffLimit}` : staffUsed}
                </span>
              </span>
            </div>
          </div>

          {!isBusiness && isOwner && (
            <Link to="/settings/billing">
              <Button type="button" variant="primary" size="sm">
                <Sparkles className="h-4 w-4" />
                Upgrade ke Business
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── Permission Preview ────────────────────────────────── */

function PermissionPreview() {
  return (
    <div className="rounded-lg border border-wood-200 bg-cream-50 p-4">
      <h4 className="mb-3 text-sm font-medium text-wood-700">Izin yang tersedia untuk staf:</h4>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {ALL_PERMISSION_KEYS.map((key) => (
          <div key={key} className="flex items-center gap-2 text-sm text-wood-600">
            <Check className="h-3.5 w-3.5 text-leaf-600" />
            <span>{PERMISSION_LABELS[key].label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Owner Card ────────────────────────────────────────── */

function OwnerCard({ member }: { member: StaffMember }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-4 rounded-lg border border-honey-200 bg-honey-50 p-4">
      <div className="min-w-0 flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-honey-200 text-honey-800 text-sm font-bold">
          {getInitials(member.profiles?.full_name)}
        </div>
        <div className="min-w-0">
          <p className="break-words font-medium text-wood-800">
            {member.profiles?.full_name || "Pemilik"}
          </p>
          <p className="break-words text-xs text-wood-500">
            {member.profiles?.email}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Badge variant="premium" size="sm">
          <Crown className="h-3 w-3" />
          Pemilik
        </Badge>
        <span className="hidden text-xs text-wood-500 sm:inline">
          Akses penuh ke semua fitur
        </span>
      </div>
    </div>
  );
}

/* ─── Main Page ─────────────────────────────────────────── */

export function TeamSettingsPage() {
  const queryClient = useQueryClient();
  const { data: orgData } = useOrganization();
  const isOwner = useIsOwner();
  const permissions = useOrgPermissions();
  const currentPlan = orgData?.organization?.current_plan || "free";
  const isBusinessPlan = currentPlan === "business";

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<StaffMember | null>(null);

  /* ── Queries ── */

  const { data: members, isLoading, error: membersError, refetch: refetchMembers } = useQuery({
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
    onError: (err) => {
      setInviteError(translateError(err));
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
        [`p_${permission}`]: value,
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
  const staffSlotFull = isBusinessPlan && staffMembers.length >= 1;
  const canInvite = isOwner && isBusinessPlan && !staffSlotFull;

  const handleInvite = () => {
    if (inviteMutation.isPending) return;
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

  if (membersError) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <ErrorState error={membersError} onRetry={refetchMembers} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="min-w-0 space-y-6">
        {/* Page Header */}
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Tim & Izin</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Kelola anggota tim dan hak akses mereka.
          </p>
        </div>

        {/* Plan Info */}
        {members && (
          <PlanInfoCard
            currentPlan={currentPlan}
            staffCount={staffMembers.length}
            isOwner={isOwner}
          />
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
                    <OwnerCard key={member.id} member={member} />
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
                {isBusinessPlan && (
                  <Badge variant="neutral" size="sm">
                    {staffMembers.length}/1 slot terpakai
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {/* Non-owner */}
              {!isOwner && (
                <div className="space-y-4">
                  <div className="rounded-lg border border-wood-100 bg-cream-50 p-4 text-center">
                    <p className="text-sm text-wood-500">
                      Hanya pemilik yang dapat mengelola staf.
                    </p>
                  </div>
                  
                  {/* Show own permissions for staff */}
                  {orgData?.member && (
                    <div className="rounded-lg border border-wood-100 bg-cream-50 p-4">
                      <h4 className="mb-3 text-sm font-medium text-wood-700">Hak akses Anda:</h4>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {ALL_PERMISSION_KEYS.map((key) => {
                          const hasPermission = permissions[
                            key === "can_create_transaction"
                              ? "canCreateTransaction"
                              : key === "can_view_reports"
                                ? "canViewReports"
                                : key === "can_manage_accounts"
                                  ? "canManageAccounts"
                                  : key === "can_void_transaction"
                                    ? "canVoidTransaction"
                                    : key === "can_manage_products"
                                      ? "canManageProducts"
                                      : "canViewAuditLog"
                          ];
                          return (
                            <div key={key} className="flex items-center gap-2 text-sm">
                              {hasPermission ? (
                                <Check className="h-3.5 w-3.5 text-leaf-600" />
                              ) : (
                                <X className="h-3.5 w-3.5 text-wood-400" />
                              )}
                              <span className={hasPermission ? "text-wood-700" : "text-wood-400"}>
                                {PERMISSION_LABELS[key].label}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Owner - Non-business plan */}
              {isOwner && !isBusinessPlan && (
                <div className="space-y-4">
                  {/* Permission Preview */}
                  <PermissionPreview />

                  {/* Upgrade CTA */}
                  <div className="rounded-lg border border-dashed border-wood-300 bg-cream-50 p-5 text-center">
                    <Lock className="mx-auto h-8 w-8 text-wood-400" />
                    <h3 className="mt-3 text-sm font-medium text-wood-700">
                      Undang staf memerlukan paket Business
                    </h3>
                    <p className="mt-1 text-xs text-wood-500">
                      Dengan paket Business, Anda dapat mengundang 1 staf dan mengatur hak aksesnya.
                    </p>
                    <Link to="/settings/billing" className="mt-4 inline-block">
                      <Button type="button" variant="primary" size="sm">
                        <Sparkles className="h-4 w-4" />
                        Lihat Paket Business
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </Link>
                  </div>

                  {/* Locked Invite Button */}
                  <div className="flex items-center gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      disabled
                      className="opacity-60"
                    >
                      <UserPlus className="h-4 w-4" />
                      Undang Staf
                    </Button>
                    <span className="text-xs text-wood-500">
                      <Lock className="mr-1 inline h-3 w-3" />
                      Upgrade ke Business untuk membuka
                    </span>
                  </div>

                  {/* Staff list (if any from legacy) */}
                  {staffMembers.length > 0 && (
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
                </div>
              )}

              {/* Owner - Business plan */}
              {isOwner && isBusinessPlan && (
                <>
                  {/* Permission Preview */}
                  <PermissionPreview />

                  {/* Invite form */}
                  {canInvite ? (
                    <div className="mt-4 rounded-lg border border-dashed border-leaf-300 bg-leaf-50/50 p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <UserPlus className="h-4 w-4 text-leaf-600" />
                        <p className="text-sm font-medium text-leaf-800">
                          Undang staf baru
                        </p>
                      </div>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <Input
                          label="Email staf"
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
                          error={inviteError ?? undefined}
                          autoComplete="email"
                          disabled={inviteMutation.isPending}
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
                  ) : (
                    /* Slot full message */
                    <div className="mt-4 flex items-center gap-2 rounded-lg border border-wood-200 bg-cream-100 px-4 py-3 text-sm text-wood-600">
                      <Info className="h-4 w-4 shrink-0 text-wood-500" />
                      Slot staf sudah terpakai. Hapus staf saat ini untuk mengundang yang baru.
                    </div>
                  )}

                  {/* Staff list */}
                  {staffMembers.length === 0 ? (
                    <div className="mt-4 rounded-lg border border-wood-100 bg-cream-50 p-6 text-center">
                      <Users className="mx-auto h-10 w-10 text-wood-300" />
                      <h3 className="mt-3 text-sm font-medium text-wood-700">
                        Belum ada staf
                      </h3>
                      <p className="mt-1 text-xs text-wood-500 max-w-sm mx-auto">
                        Undang staf untuk membantu mencatat transaksi. Anda dapat mengatur hak akses mereka sesuai kebutuhan.
                      </p>
                      <ul className="mt-3 space-y-1 text-xs text-wood-500 max-w-sm mx-auto text-left">
                        <li className="flex items-center gap-2">
                          <Check className="h-3 w-3 text-leaf-500 shrink-0" />
                          Staf dapat membantu mencatat transaksi harian
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="h-3 w-3 text-leaf-500 shrink-0" />
                          Anda mengontrol izin setiap staf
                        </li>
                        <li className="flex items-center gap-2">
                          <Check className="h-3 w-3 text-leaf-500 shrink-0" />
                          Semua aktivitas staf tercatat di audit log
                        </li>
                      </ul>
                    </div>
                  ) : (
                    <div className="mt-4 space-y-3">
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
        message={`"${selectedMember?.profiles?.full_name || selectedMember?.profiles?.email || "Staf ini"}" akan dihapus dari organisasi. Semua aksesnya akan dicabut.`}
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
    <div className="min-w-0 rounded-lg border border-wood-200 bg-cream-50 transition-[border-color,background-color] duration-150 ease-out">
      {/* Card Header */}
      <div className="flex min-w-0 flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-leaf-100 text-leaf-700 text-sm font-semibold">
            {getInitials(member.profiles?.full_name)}
          </div>
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <p className="break-words font-medium text-wood-800">
                {member.profiles?.full_name || "Staf"}
              </p>
              {member.status && member.status !== "active" && (
                <Badge variant="warning" size="sm">
                  {member.status}
                </Badge>
              )}
            </div>
            <p className="break-words text-xs text-wood-500">
              {member.profiles?.email}
              {joinedDate && (
                <span className="text-wood-300 sm:ml-2">
                  · Bergabung {joinedDate}
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
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
            <span className="text-xs text-wood-500">
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
        <div className="break-words border-t border-wood-100 px-4 py-2 text-xs text-wood-500">
          {activeCount > 0
            ? `${activeCount} izin aktif`
            : "Belum ada izin aktif"}
        </div>
      )}

      {/* Permission Panel (expanded) */}
      {showPerms && (
        <div className="ledger-page border-t border-wood-100 bg-cream-100/50 px-4 py-3">
          <p className="mb-2 text-xs font-medium text-wood-600">Hak Akses</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {ALL_PERMISSION_KEYS.map((key) => {
              const { label } = PERMISSION_LABELS[key];
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
                  className={`ledger-interactive flex items-start gap-3 rounded-md border p-3 text-left ${
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
                    <span className="block break-words text-sm font-medium text-wood-700">
                      {label}
                    </span>
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

/* ─── Info icon (imported above but not in lucide-react exports) ─── */

function Info({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  );
}
