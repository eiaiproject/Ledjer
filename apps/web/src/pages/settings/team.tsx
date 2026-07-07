import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useOrganization, useOrgPermissions } from "@/hooks/useOrganization";
import {
  createTeamInvitation,
  listTeamInvitations,
  listTeamMembers,
  removeTeamMember,
  revokeTeamInvitation,
  updateTeamMemberRole,
  type TeamInvitation,
  type TeamInvitationRole,
  type TeamMember,
  type TeamRole,
} from "@/lib/api/team";
import { queryKeys } from "@/lib/query-keys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageSpinner } from "@/components/ui/spinner";
import { ErrorState } from "@/components/ui/error-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { translateError } from "@/lib/errors";
import { toast } from "@/components/ui/toast-api";
import { formatShortDate } from "@/lib/utils";
import {
  UserPlus,
  Shield,
  Trash2,
  ChevronDown,
  ChevronUp,
  Crown,
  Users,
  Check,
  X,
  Copy,
  Link2,
  MailCheck,
  Ban,
  Info,
} from "lucide-react";

type StaffPermissionKey =
  | "can_create_transaction"
  | "can_view_reports"
  | "can_manage_accounts"
  | "can_void_transaction"
  | "can_manage_products"
  | "can_view_audit_log";

type PermissionCarrier = { role: string } & Record<StaffPermissionKey, boolean>;

const PERMISSION_LABELS: Record<StaffPermissionKey, { label: string }> = {
  can_create_transaction: { label: "Buat transaksi" },
  can_view_reports: { label: "Lihat laporan" },
  can_manage_accounts: { label: "Kelola akun" },
  can_void_transaction: { label: "Batalkan transaksi" },
  can_manage_products: { label: "Kelola produk" },
  can_view_audit_log: { label: "Lihat audit log" },
};

const ALL_PERMISSION_KEYS = Object.keys(PERMISSION_LABELS) as StaffPermissionKey[];
const MANAGEABLE_ROLES: TeamInvitationRole[] = ["admin", "member", "viewer"];

const ROLE_LABELS: Record<TeamRole, string> = {
  owner: "Pemilik",
  admin: "Admin",
  member: "Staf",
  viewer: "Viewer",
};

function getInitials(name: string | undefined, email: string | undefined): string {
  const source = name?.trim() || email?.trim() || "?";
  const parts = source.split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function formatJoinedDate(value: number | null): string | null {
  if (!value) return null;
  return new Date(value).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatEpochDate(value: number): string {
  return formatShortDate(new Date(value));
}

function memberHasPermission(member: PermissionCarrier, key: StaffPermissionKey): boolean {
  if (member.role === "owner") return true;
  return Boolean(member[key]);
}

function countActivePermissions(member: PermissionCarrier): number {
  return ALL_PERMISSION_KEYS.filter((key) => memberHasPermission(member, key)).length;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function buildInvitationLink(token: string): string {
  const url = new URL("/invitations/accept", window.location.origin);
  url.searchParams.set("token", token);
  return url.toString();
}

async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

function roleBadgeVariant(role: TeamRole): "premium" | "info" | "success" | "neutral" {
  if (role === "owner") return "premium";
  if (role === "admin") return "info";
  if (role === "member") return "success";
  return "neutral";
}

function PermissionPreview() {
  return (
    <div className="rounded-lg border border-wood-200 bg-cream-50 p-4">
      <h4 className="mb-3 text-sm font-medium text-wood-700">Hak akses efektif berdasarkan role:</h4>
      <div className="grid gap-3 sm:grid-cols-3">
        {MANAGEABLE_ROLES.map((role) => (
          <div key={role} className="rounded-md border border-wood-100 bg-white p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-wood-700">{ROLE_LABELS[role]}</span>
              <Badge variant={roleBadgeVariant(role)} size="sm">{ROLE_LABELS[role]}</Badge>
            </div>
            <div className="space-y-1.5">
              {ALL_PERMISSION_KEYS.map((key) => {
                const enabled = rolePermission(role, key);
                return (
                  <div key={key} className="flex items-center gap-2 text-xs">
                    {enabled ? (
                      <Check className="h-3.5 w-3.5 text-leaf-600" />
                    ) : (
                      <X className="h-3.5 w-3.5 text-wood-300" />
                    )}
                    <span className={enabled ? "text-wood-700" : "text-wood-400"}>
                      {PERMISSION_LABELS[key].label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function rolePermission(role: TeamRole, key: StaffPermissionKey): boolean {
  if (role === "owner" || role === "admin") return true;
  if (role === "member") {
    return key === "can_create_transaction" || key === "can_view_reports";
  }
  return key === "can_view_reports";
}

function PendingInvitationCard({
  invitation,
  onRefreshLink,
  onRevoke,
  actionPending,
}: {
  invitation: TeamInvitation;
  onRefreshLink: () => void;
  onRevoke: () => void;
  actionPending: boolean;
}) {
  const expiresAt = formatEpochDate(invitation.expires_at);

  return (
    <div className="min-w-0 rounded-lg border border-sky-200 bg-sky-50 p-4">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-700">
            <MailCheck className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="break-words text-sm font-semibold text-wood-800">
                {invitation.email}
              </p>
              <Badge variant="info" size="sm">Menunggu</Badge>
              <Badge variant={roleBadgeVariant(invitation.role)} size="sm">
                {ROLE_LABELS[invitation.role]}
              </Badge>
            </div>
            <p className="mt-1 break-words text-xs text-wood-500">
              Berlaku sampai {expiresAt}. Untuk menyalin link lagi, buat ulang link undangan ini.
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 self-start sm:self-auto">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onRefreshLink}
            loading={actionPending}
            disabled={actionPending}
          >
            <Link2 className="h-4 w-4" />
            Buat ulang link
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRevoke}
            loading={actionPending}
            disabled={actionPending}
            className="text-error hover:bg-error/10 hover:text-error"
          >
            <Ban className="h-4 w-4" />
            Batalkan
          </Button>
        </div>
      </div>
    </div>
  );
}

function OwnerCard({ member }: { member: TeamMember }) {
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-lg border border-honey-200 bg-honey-50 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-honey-200 text-sm font-bold text-honey-800">
          {getInitials(member.full_name, member.email)}
        </div>
        <div className="min-w-0">
          <p className="break-words font-medium text-wood-800">
            {member.full_name || "Pemilik"}
          </p>
          <p className="break-words text-xs text-wood-500">{member.email}</p>
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

export function TeamSettingsPage() {
  const queryClient = useQueryClient();
  const { data: orgData } = useOrganization();
  const { canReadTeam, canManageTeam } = useOrgPermissions();
  const ownMember = orgData?.member ?? null;

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<TeamInvitationRole>("member");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [latestInviteLink, setLatestInviteLink] = useState<string | null>(null);
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);

  const {
    data: members = [],
    isLoading,
    error: membersError,
    refetch: refetchMembers,
  } = useQuery({
    queryKey: queryKeys.orgMembers.list(orgData?.organization?.id),
    queryFn: listTeamMembers,
    enabled: !!orgData?.organization?.id && canReadTeam,
  });

  const {
    data: invitations = [],
    isLoading: invitationsLoading,
    error: invitationsError,
    refetch: refetchInvitations,
  } = useQuery({
    queryKey: queryKeys.invitations.list(orgData?.organization?.id),
    queryFn: listTeamInvitations,
    enabled: !!orgData?.organization?.id && canManageTeam,
  });

  const inviteMutation = useMutation({
    mutationFn: createTeamInvitation,
    onSuccess: (result) => {
      setInviteEmail("");
      setInviteError(null);
      setLatestInviteLink(result.accept_url || buildInvitationLink(result.token));
      toast.success(
        result.resent
          ? "Link undangan diperbarui. Salin link untuk dikirim ke staf."
          : "Link undangan dibuat. Salin link untuk dikirim ke staf."
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.orgMembers.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.invitations.all() });
    },
    onError: (err) => {
      setInviteError(translateError(err));
    },
  });

  const revokeInvitationMutation = useMutation({
    mutationFn: revokeTeamInvitation,
    onSuccess: () => {
      setLatestInviteLink(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.invitations.all() });
      toast.success("Undangan dibatalkan");
    },
    onError: (err) => toast.error(translateError(err)),
  });

  const roleMutation = useMutation({
    mutationFn: ({ memberId, role }: { memberId: string; role: TeamInvitationRole }) =>
      updateTeamMemberRole(memberId, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.orgMembers.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.allOrganization() });
      toast.success("Role anggota berhasil diupdate");
    },
    onError: (err) => toast.error(translateError(err)),
  });

  const removeMutation = useMutation({
    mutationFn: removeTeamMember,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.orgMembers.all() });
      toast.success("Anggota tim berhasil dihapus");
      setRemoveDialogOpen(false);
      setSelectedMember(null);
    },
    onError: (err) => toast.error(translateError(err)),
  });

  const ownerMembers = members.filter((member) => member.role === "owner");
  const staffMembers = members.filter((member) => member.role !== "owner");
  const canInvite = canManageTeam && !invitationsLoading;

  const handleInvite = () => {
    if (inviteMutation.isPending) return;
    const trimmed = inviteEmail.trim();
    if (!isValidEmail(trimmed)) {
      setInviteError("Format email tidak valid.");
      return;
    }
    inviteMutation.mutate({ email: trimmed, role: inviteRole });
  };

  const handleCopyInviteLink = async (link: string) => {
    try {
      await copyText(link);
      toast.success("Link undangan disalin");
    } catch {
      toast.error("Link belum bisa disalin. Salin manual dari field link.");
    }
  };

  const handleRefreshInvitation = (invitation: TeamInvitation) => {
    inviteMutation.mutate({ email: invitation.email, role: invitation.role });
  };

  const handleRemoveClick = (member: TeamMember) => {
    setSelectedMember(member);
    setRemoveDialogOpen(true);
  };

  if (!canReadTeam) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <Card>
          <CardHeader>
            <h1 className="text-xl font-bold text-text-primary">Tim & Izin</h1>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-wood-100 bg-cream-50 p-4 text-center">
              <p className="text-sm text-wood-500">
                Anda tidak memiliki akses ke pengaturan tim.
              </p>
            </div>
            {ownMember && (
              <div className="mt-4 rounded-lg border border-wood-100 bg-cream-50 p-4">
                <h4 className="mb-3 text-sm font-medium text-wood-700">Hak akses Anda:</h4>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {ALL_PERMISSION_KEYS.map((key) => {
                    const hasPermission = memberHasPermission(ownMember, key);
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
          </CardContent>
        </Card>
      </div>
    );
  }

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
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Tim & Izin</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Kelola anggota tim dan role akses mereka.
          </p>
        </div>

        <section aria-labelledby="owners-heading">
          <Card>
            <CardHeader>
              <h2 id="owners-heading" className="text-sm font-semibold text-wood-700">
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

        <section aria-labelledby="staff-heading">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2 id="staff-heading" className="text-sm font-semibold text-wood-700">
                  Anggota Tim
                </h2>
                <Badge variant="neutral" size="sm">
                  {staffMembers.length} anggota
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {!canManageTeam && (
                <div className="rounded-lg border border-wood-100 bg-cream-50 p-4 text-center">
                  <p className="text-sm text-wood-500">
                    Hanya pemilik dan admin yang dapat mengelola tim.
                  </p>
                </div>
              )}

              {canManageTeam && (
                <>
                  <PermissionPreview />

                  {invitationsError && (
                    <div className="mt-4">
                      <ErrorState
                        error={invitationsError}
                        onRetry={refetchInvitations}
                        className="rounded-lg border border-error/20 bg-error/5 py-6"
                      />
                    </div>
                  )}

                  {latestInviteLink && (
                    <div className="mt-4 rounded-lg border border-leaf-200 bg-leaf-50 p-4">
                      <div className="flex items-start gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-leaf-100 text-leaf-700">
                          <Link2 className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-leaf-800">
                            Link undangan siap dikirim
                          </p>
                          <p className="mt-1 text-xs text-leaf-800/80">
                            Token tidak disimpan mentah di database. Salin link ini sekarang atau buat ulang nanti.
                          </p>
                          <div className="mt-3 flex min-w-0 flex-col gap-2 sm:flex-row">
                            <input
                              readOnly
                              value={latestInviteLink}
                              className="min-h-[44px] min-w-0 flex-1 rounded-md border border-leaf-200 bg-white px-3 py-2 text-xs text-wood-700 sm:min-h-0"
                              aria-label="Link undangan terbaru"
                              onFocus={(event) => event.currentTarget.select()}
                            />
                            <Button
                              type="button"
                              variant="success"
                              size="sm"
                              onClick={() => handleCopyInviteLink(latestInviteLink)}
                            >
                              <Copy className="h-4 w-4" />
                              Salin link
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {canInvite ? (
                    <div className="mt-4 rounded-lg border border-dashed border-leaf-300 bg-leaf-50/50 p-4">
                      <div className="mb-2 flex items-center gap-2">
                        <UserPlus className="h-4 w-4 text-leaf-600" />
                        <p className="text-sm font-medium text-leaf-800">
                          Buat link undangan anggota
                        </p>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_160px_auto] sm:items-start">
                        <Input
                          label="Email anggota"
                          type="email"
                          value={inviteEmail}
                          onChange={(event) => {
                            setInviteEmail(event.target.value);
                            if (inviteError) setInviteError(null);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") handleInvite();
                          }}
                          placeholder="email@contoh.com"
                          error={inviteError ?? undefined}
                          helperText="Anggota harus masuk atau daftar dengan email ini untuk menerima undangan."
                          autoComplete="email"
                          disabled={inviteMutation.isPending}
                          containerClassName="min-w-0"
                        />
                        <label className="block text-sm font-medium text-wood-700">
                          Role
                          <select
                            value={inviteRole}
                            onChange={(event) => setInviteRole(event.target.value as TeamInvitationRole)}
                            disabled={inviteMutation.isPending}
                            className="mt-1 min-h-[44px] w-full rounded-md border border-wood-200 bg-cream-50 px-3 py-2 text-sm text-wood-700 focus:border-wood-500 focus:outline-none focus:ring-2 focus:ring-wood-200 disabled:opacity-50 sm:min-h-0"
                          >
                            {MANAGEABLE_ROLES.map((role) => (
                              <option key={role} value={role}>{ROLE_LABELS[role]}</option>
                            ))}
                          </select>
                        </label>
                        <Button
                          type="button"
                          onClick={handleInvite}
                          loading={inviteMutation.isPending}
                          disabled={
                            !inviteEmail.trim() ||
                            !isValidEmail(inviteEmail) ||
                            inviteMutation.isPending
                          }
                          className="sm:mt-7"
                        >
                          <Link2 className="h-4 w-4" />
                          Buat link
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 flex items-start gap-2 rounded-lg border border-wood-200 bg-cream-100 px-4 py-3 text-sm text-wood-600">
                      <Info className="mt-0.5 h-4 w-4 shrink-0 text-wood-500" />
                      <span className="min-w-0 break-words">
                        Memuat status undangan...
                      </span>
                    </div>
                  )}

                  {invitations.length > 0 && (
                    <div className="mt-4 space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="text-sm font-semibold text-wood-700">
                          Undangan aktif
                        </h3>
                        <Badge variant="info" size="sm">
                          {invitations.length} pending
                        </Badge>
                      </div>
                      {invitations.map((invitation) => (
                        <PendingInvitationCard
                          key={invitation.id}
                          invitation={invitation}
                          onRefreshLink={() => handleRefreshInvitation(invitation)}
                          onRevoke={() => revokeInvitationMutation.mutate(invitation.id)}
                          actionPending={
                            inviteMutation.isPending || revokeInvitationMutation.isPending
                          }
                        />
                      ))}
                    </div>
                  )}
                </>
              )}

              {isLoading ? (
                <div className="mt-4">
                  <PageSpinner />
                </div>
              ) : staffMembers.length === 0 ? (
                <div className="mt-4 rounded-lg border border-wood-100 bg-cream-50 p-6 text-center">
                  <Users className="mx-auto h-10 w-10 text-wood-300" />
                  <h3 className="mt-3 text-sm font-medium text-wood-700">
                    {invitations.length > 0 ? "Menunggu anggota menerima undangan" : "Belum ada anggota"}
                  </h3>
                  <p className="mx-auto mt-1 max-w-sm text-xs text-wood-500">
                    {invitations.length > 0
                      ? "Setelah undangan diterima, anggota akan muncul di daftar ini."
                      : "Undang anggota untuk membantu pencatatan dan pengawasan pembukuan."}
                  </p>
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {staffMembers.map((member) => (
                    <MemberCard
                      key={member.id}
                      member={member}
                      canManageTeam={canManageTeam}
                      onRoleChange={(role) =>
                        roleMutation.mutate({ memberId: member.id, role })
                      }
                      onRemove={() => handleRemoveClick(member)}
                      rolePending={roleMutation.isPending}
                      removePending={removeMutation.isPending}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      </div>

      <ConfirmDialog
        open={removeDialogOpen}
        onClose={() => {
          setRemoveDialogOpen(false);
          setSelectedMember(null);
        }}
        onConfirm={() => selectedMember && removeMutation.mutate(selectedMember.id)}
        title="Hapus Anggota?"
        message={`"${selectedMember?.full_name || selectedMember?.email || "Anggota ini"}" akan dihapus dari organisasi. Semua aksesnya akan dicabut.`}
        confirmLabel="Ya, Hapus"
        loading={removeMutation.isPending}
      />
    </div>
  );
}

function MemberCard({
  member,
  canManageTeam,
  onRoleChange,
  onRemove,
  rolePending,
  removePending,
}: {
  member: TeamMember;
  canManageTeam: boolean;
  onRoleChange: (role: TeamInvitationRole) => void;
  onRemove: () => void;
  rolePending: boolean;
  removePending: boolean;
}) {
  const [showPerms, setShowPerms] = useState(false);
  const activeCount = countActivePermissions(member);
  const joinedDate = formatJoinedDate(member.joined_at);

  return (
    <div className="min-w-0 rounded-lg border border-wood-200 bg-cream-50 transition-[border-color,background-color] duration-150 ease-out">
      <div className="flex min-w-0 flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-leaf-100 text-sm font-semibold text-leaf-700">
            {getInitials(member.full_name, member.email)}
          </div>
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <p className="break-words font-medium text-wood-800">
                {member.full_name || "Anggota"}
              </p>
              <Badge variant={roleBadgeVariant(member.role)} size="sm">
                {ROLE_LABELS[member.role]}
              </Badge>
              {member.status && member.status !== "active" && (
                <Badge variant="warning" size="sm">{member.status}</Badge>
              )}
            </div>
            <p className="break-words text-xs text-wood-500">
              {member.email}
              {joinedDate && (
                <span className="text-wood-300 sm:ml-2">
                  Bergabung {joinedDate}
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 self-end sm:self-auto">
          {canManageTeam && (
            <label className="sr-only" htmlFor={`role-${member.id}`}>
              Role {member.full_name || member.email}
            </label>
          )}
          {canManageTeam && (
            <select
              id={`role-${member.id}`}
              value={member.role}
              onChange={(event) => onRoleChange(event.target.value as TeamInvitationRole)}
              disabled={rolePending || removePending}
              className="min-h-[44px] rounded-md border border-wood-200 bg-cream-50 px-3 py-1.5 text-sm text-wood-700 focus:border-wood-500 focus:outline-none focus:ring-2 focus:ring-wood-200 disabled:opacity-50 sm:min-h-0"
            >
              {MANAGEABLE_ROLES.map((role) => (
                <option key={role} value={role}>{ROLE_LABELS[role]}</option>
              ))}
            </select>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowPerms(!showPerms)}
            aria-expanded={showPerms}
          >
            <Shield className="h-4 w-4" />
            <span className="hidden sm:inline">Izin</span>
            <span className="text-xs text-wood-500">{activeCount}</span>
            {showPerms ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
          </Button>
          {canManageTeam && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onRemove}
              disabled={removePending}
              aria-label={`Hapus ${member.full_name || "anggota"}`}
              className="text-error hover:bg-error/10 hover:text-error"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {!showPerms && (
        <div className="break-words border-t border-wood-100 px-4 py-2 text-xs text-wood-500">
          {activeCount > 0 ? `${activeCount} izin aktif` : "Belum ada izin aktif"}
        </div>
      )}

      {showPerms && (
        <div className="ledger-page border-t border-wood-100 bg-cream-100/50 px-4 py-3">
          <p className="mb-2 text-xs font-medium text-wood-600">Hak Akses</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {ALL_PERMISSION_KEYS.map((key) => {
              const checked = memberHasPermission(member, key);
              return (
                <div
                  key={key}
                  className={`flex items-start gap-3 rounded-md border p-3 text-left ${
                    checked
                      ? "border-leaf-300 bg-leaf-50"
                      : "border-wood-200 bg-cream-50"
                  }`}
                >
                  <span
                    className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                      checked
                        ? "border-leaf-500 bg-leaf-500"
                        : "border-wood-300 bg-cream-50"
                    }`}
                    aria-hidden="true"
                  >
                    {checked && <Check className="h-3 w-3 text-white" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block break-words text-sm font-medium text-wood-700">
                      {PERMISSION_LABELS[key].label}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
