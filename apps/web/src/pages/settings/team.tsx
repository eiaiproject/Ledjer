import { useState, useCallback, useMemo } from "react";
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
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Modal, ModalContent, ModalFooter } from "@/components/ui/modal";
import { translateError } from "@/lib/errors";
import { toast } from "@/components/ui/toast";
import { formatShortDate, cn } from "@/lib/utils";
import {
  UserAdd,
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
  EnvelopeCheck,
  Ban,
  InfoCircle,
} from "reicon-react";
import { PageShell } from "@/components/ui/page-shell";
import { PageGuide } from "@/components/ui/page-guide";

// ── Canonical role and permission model ─────────────────────────────
// Backend source of truth: organization.service.ts ROLE_PERMISSIONS

type StaffPermissionKey =
  | "can_create_transaction"
  | "can_view_reports"
  | "can_manage_accounts"
  | "can_void_transaction"
  | "can_manage_products"
  | "can_view_audit_log";

type PermissionCarrier = { role: string } & Record<StaffPermissionKey, boolean>;



const PERMISSION_LABELS: Record<StaffPermissionKey, string> = {
  can_create_transaction: "Buat transaksi",
  can_view_reports: "Lihat laporan",
  can_manage_accounts: "kelola akun",
  can_void_transaction: "Batalkan transaksi",
  can_manage_products: "Kelola produk",
  can_view_audit_log: "Lihat audit log",
};

const ALL_PERMISSION_KEYS = Object.keys(PERMISSION_LABELS) as StaffPermissionKey[];
const INVITABLE_ROLES: TeamInvitationRole[] = ["member", "viewer", "admin"];

/** Canonical role metadata — matches backend ROLE_PERMISSIONS */
const ROLE_CONFIG: Record<
  TeamRole,
  {
    label: string;
    description: string;
    isInvitable: boolean;
  }
> = {
  owner: {
    label: "Pemilik",
    description: "Akses penuh ke semua fitur. Tidak dapat diubah melalui halaman ini.",
    isInvitable: false,
  },
  admin: {
    label: "Admin",
    description:
      "Mengelola operasional dan pembukuan: mengelola akun, membatalkan transaksi, mengelola produk, melihat audit log, dan mengelola anggota.",
    isInvitable: true,
  },
  member: {
    label: "Staf",
    description: "Mencatat transaksi harian dan melihat laporan yang diizinkan.",
    isInvitable: true,
  },
  viewer: {
    label: "Viewer",
    description: "Melihat informasi tanpa mengubah data.",
    isInvitable: true,
  },
};

const MANAGEABLE_ROLES: TeamInvitationRole[] = INVITABLE_ROLES;

function rolePermission(role: TeamRole, key: StaffPermissionKey): boolean {
  if (role === "owner" || role === "admin") return true;
  if (role === "member") {
    return key === "can_create_transaction" || key === "can_view_reports";
  }
  return key === "can_view_reports";
}

function memberHasPermission(member: PermissionCarrier, key: StaffPermissionKey): boolean {
  if (member.role === "owner") return true;
  return Boolean(member[key]);
}

function countActivePermissions(member: PermissionCarrier): number {
  return ALL_PERMISSION_KEYS.filter((key) => memberHasPermission(member, key)).length;
}

// ── Helpers ─────────────────────────────────────────────────────────

function getInitials(name: string | undefined, email: string | undefined): string {
  const source = name?.trim() || email?.trim() || "?";
  const parts = source.split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts.at(-1)!.charAt(0)).toUpperCase();
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

function isValidEmail(email: string): boolean {
  return /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(email.trim());
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

// ── Component ───────────────────────────────────────────────────────

export function TeamSettingsPage() {
  const queryClient = useQueryClient();
  const { data: orgData } = useOrganization();
  const { canReadTeam, canManageTeam } = useOrgPermissions();
  const ownMember = orgData?.member ?? null;

  // Invitation form state
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<TeamInvitationRole>("member");
  const [inviteEmailError, setInviteEmailError] = useState<string | null>(null);
  const [inviteRoleError, setInviteRoleError] = useState<string | null>(null);
  const [latestInviteLink, setLatestInviteLink] = useState<string | null>(null);

  // Role change dialog state
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [roleDialogMember, setRoleDialogMember] = useState<TeamMember | null>(null);
  const [roleDialogNewRole, setRoleDialogNewRole] = useState<TeamInvitationRole>("member");

  // Remove dialog state
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);

  // ── Queries ─────────────────────────────────────────────────────

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

  // ── Mutations ───────────────────────────────────────────────────

  const inviteMutation = useMutation({
    mutationFn: createTeamInvitation,
    onSuccess: (result) => {
      setInviteEmail("");
      setInviteEmailError(null);
      setInviteRoleError(null);
      setLatestInviteLink(result.accept_url || buildInvitationLink(result.token));
      toast.success(
        result.resent
          ? "Link undangan diperbarui. Salin link untuk dikirim ke calon anggota."
          : "Link undangan dibuat. Salin link untuk dikirim ke calon anggota.",
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.orgMembers.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.invitations.all() });
    },
    onError: (err) => {
      const msg = translateError(err);
      // Detect specific error types from the backend
      if (msg.includes("sudah terdaftar") || msg.includes("already a member")) {
        setInviteEmailError("Email ini sudah terdaftar sebagai anggota.");
      } else if (msg.includes("pemilik") || msg.includes("owner")) {
        setInviteEmailError("Email ini sudah menjadi pemilik bisnis.");
      } else {
        setInviteEmailError(msg);
      }
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
      toast.success("Role anggota berhasil diperbarui.");
      setRoleDialogOpen(false);
      setRoleDialogMember(null);
    },
    onError: (err) => toast.error(translateError(err)),
  });

  const removeMutation = useMutation({
    mutationFn: removeTeamMember,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.orgMembers.all() });
      toast.success("Anggota berhasil dihapus dari tim.");
      setRemoveDialogOpen(false);
      setSelectedMember(null);
    },
    onError: (err) => toast.error(translateError(err)),
  });

  // ── Derived state ───────────────────────────────────────────────

  const ownerMembers = useMemo(() => members.filter((m) => m.role === "owner"), [members]);
  const staffMembers = useMemo(() => members.filter((m) => m.role !== "owner"), [members]);
  const canInvite = canManageTeam && !invitationsLoading;

  // ── Handlers ────────────────────────────────────────────────────

  const handleInvite = useCallback(() => {
    if (inviteMutation.isPending) return;

    const trimmed = inviteEmail.trim();
    let hasError = false;

    if (!trimmed) {
      setInviteEmailError("Masukkan alamat email.");
      hasError = true;
    } else if (!isValidEmail(trimmed)) {
      setInviteEmailError("Masukkan alamat email yang valid.");
      hasError = true;
    }

    if (!inviteRole) {
      setInviteRoleError("Pilih role untuk anggota.");
      hasError = true;
    }

    if (hasError) return;

    setInviteEmailError(null);
    setInviteRoleError(null);
    inviteMutation.mutate({ email: trimmed, role: inviteRole });
  }, [inviteEmail, inviteRole, inviteMutation]);

  const handleCopyInviteLink = useCallback(
    async (link: string) => {
      try {
        await copyText(link);
        toast.success("Link undangan berhasil disalin.");
      } catch {
        toast.error("Link belum berhasil disalin. Salin secara manual.");
      }
    },
    [],
  );

  const handleRefreshInvitation = useCallback(
    (invitation: TeamInvitation) => {
      inviteMutation.mutate({ email: invitation.email, role: invitation.role });
    },
    [inviteMutation],
  );

  const handleRemoveClick = useCallback((member: TeamMember) => {
    setSelectedMember(member);
    setRemoveDialogOpen(true);
  }, []);

  const handleRoleChangeClick = useCallback(
    (member: TeamMember) => {
      // Prevent self-role-change
      if (member.user_id === ownMember?.user_id) return;
      // Prevent changing owner
      if (member.role === "owner") return;
      setRoleDialogMember(member);
      setRoleDialogNewRole(member.role as TeamInvitationRole);
      setRoleDialogOpen(true);
    },
    [ownMember],
  );

  const handleRoleDialogSave = useCallback(() => {
    if (!roleDialogMember || !roleDialogNewRole) return;
    roleMutation.mutate({ memberId: roleDialogMember.id, role: roleDialogNewRole });
  }, [roleDialogMember, roleDialogNewRole, roleMutation]);

  // ── Permission denied ───────────────────────────────────────────

  if (!canReadTeam) {
    return (
      <PageShell
        header={{
          title: "Tim dan izin",
          description: "Kelola anggota tim dan hak akses mereka.",
        }}
      >
        <Card>
          <CardContent>
            <div className="rounded-lg border border-wood-100 bg-cream-50 p-4 text-center">
              <p className="text-sm text-wood-500">
                Anda tidak memiliki akses ke pengaturan tim.
              </p>
            </div>
            {ownMember && (
              <div className="mt-4 rounded-lg border border-wood-100 bg-cream-50 p-4">
                <h2 className="mb-3 text-sm font-medium text-wood-700">Hak akses Anda:</h2>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {ALL_PERMISSION_KEYS.map((key) => {
                    const hasPermission = memberHasPermission(ownMember, key);
                    return (
                      <div key={key} className="flex items-center gap-2 text-sm">
                        {hasPermission ? (
                          <Check className="h-3.5 w-3.5 text-leaf-600" />
                        ) : (
                          <X className="h-3.5 w-3.5 text-wood-500" />
                        )}
                        <span className={hasPermission ? "text-wood-700" : "text-wood-500"}>
                          {PERMISSION_LABELS[key]}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  // ── Error state ─────────────────────────────────────────────────

  if (membersError) {
    return (
      <PageShell
        header={{
          title: "Tim dan izin",
          description: "Kelola anggota tim dan hak akses mereka.",
        }}
      >
        <ErrorState
          error={membersError}
          onRetry={refetchMembers}
        />
      </PageShell>
    );
  }

  // ── Render ──────────────────────────────────────────────────────

  return (
    <PageShell
      header={{
        title: "Tim dan izin",
        description: "Undang anggota dan atur hak akses mereka ke bisnis Anda.",
      }}
    >

      {/* Panduan halaman */}
      <PageGuide guideKey="settings/team" />

      {/* Owner section */}
      <section aria-labelledby="owners-heading">
        <Card>
          <CardHeader>
            <h2 id="owners-heading" className="text-sm font-semibold text-wood-700">
              Pemilik
            </h2>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <TeamSkeleton />
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

      {/* Staff section */}
      <section aria-labelledby="staff-heading">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 id="staff-heading" className="text-sm font-semibold text-wood-700">
                Anggota Tim
              </h2>
              {!isLoading && (
                <Badge variant="neutral" size="sm">
                  {staffMembers.length} anggota
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {/* Read-only notice for non-admins */}
            {!canManageTeam && (
              <div className="rounded-lg border border-wood-100 bg-cream-50 p-4 text-center">
                <p className="text-sm text-wood-500">
                  Hanya pemilik dan admin yang dapat mengelola anggota.
                </p>
              </div>
            )}

            {/* Invitation flow (manage only) */}
            {canManageTeam && (
              <>
                {/* Invitation errors */}
                {invitationsError && (
                  <div className="mb-4">
                    <ErrorState
                      error={invitationsError}
                      onRetry={refetchInvitations}
                      className="rounded-lg border border-error/20 bg-error/5 py-6"
                    />
                  </div>
                )}

                {/* Latest invitation link */}
                {latestInviteLink && (
                  <div className="mb-4 rounded-lg border border-leaf-200 bg-leaf-50 p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-leaf-100 text-leaf-700">
                        <Link2 className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-leaf-800">
                          Link undangan berhasil dibuat
                        </p>
                        <p className="mt-1 text-xs text-leaf-800/80">
                          Link hanya dapat digunakan oleh akun dengan email yang sesuai. Salin link ini sekarang atau buat ulang nanti.
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

                {/* Invitation form */}
                {canInvite ? (
                  <InvitationForm
                    email={inviteEmail}
                    role={inviteRole}
                    emailError={inviteEmailError}
                    roleError={inviteRoleError}
                    isPending={inviteMutation.isPending}
                    onEmailChange={(value) => {
                      setInviteEmail(value);
                      if (inviteEmailError) setInviteEmailError(null);
                    }}
                    onRoleChange={(value) => {
                      setInviteRole(value);
                      if (inviteRoleError) setInviteRoleError(null);
                    }}
                    onSubmit={handleInvite}
                  />
                ) : (
                  <div className="flex items-start gap-2 rounded-lg border border-wood-200 bg-cream-100 px-4 py-3 text-sm text-wood-600">
                    <InfoCircle className="mt-0.5 h-4 w-4 shrink-0 text-wood-500" />
                    <span className="min-w-0 break-words">
                      Memuat status undangan...
                    </span>
                  </div>
                )}

                {/* Pending invitations */}
                {invitations.length > 0 && (
                  <div className="mt-4 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-sm font-semibold text-wood-700">
                        Undangan menunggu
                      </h3>
                      <Badge variant="info" size="sm">
                        {invitations.length} undangan
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

            {/* Staff list */}
            <StaffListContent
              isLoading={isLoading}
              invitationsCount={invitations.length}
              staffMembers={staffMembers}
              canManageTeam={canManageTeam}
              currentUserUserId={ownMember?.user_id}
              rolePending={roleMutation.isPending}
              removePending={removeMutation.isPending}
              onRoleChangeClick={handleRoleChangeClick}
              onRemove={handleRemoveClick}
            />
          </CardContent>
        </Card>
      </section>

      {/* Role comparison (secondary) */}
      {canManageTeam && <RoleComparisonGuide />}

      {/* Role change dialog */}
      <RoleChangeDialog
        open={roleDialogOpen}
        member={roleDialogMember}
        newRole={roleDialogNewRole}
        onRoleChange={setRoleDialogNewRole}
        onSave={handleRoleDialogSave}
        onClose={() => {
          setRoleDialogOpen(false);
          setRoleDialogMember(null);
        }}
        isPending={roleMutation.isPending}
      />

      {/* Remove member dialog */}
      <ConfirmDialog
        open={removeDialogOpen}
        onClose={() => {
          setRemoveDialogOpen(false);
          setSelectedMember(null);
        }}
        onConfirm={() => selectedMember && removeMutation.mutate(selectedMember.id)}
        title="Hapus anggota dari tim?"
        message={`Akses ${selectedMember?.full_name || selectedMember?.email || "anggota ini"} akan dihentikan. Transaksi dan aktivitas sebelumnya tetap tersimpan.`}
        confirmLabel="Hapus dari tim"
        loading={removeMutation.isPending}
      />
    </PageShell>
  );
}

// ── Invitation form ─────────────────────────────────────────────────

function InvitationForm({
  email,
  role,
  emailError,
  roleError,
  isPending,
  onEmailChange,
  onRoleChange,
  onSubmit,
}: Readonly<{
  email: string;
  role: TeamInvitationRole;
  emailError: string | null;
  roleError: string | null;
  isPending: boolean;
  onEmailChange: (value: string) => void;
  onRoleChange: (value: TeamInvitationRole) => void;
  onSubmit: () => void;
}>) {
  const selectedRoleConfig = ROLE_CONFIG[role];
  const isAdminWarning = role === "admin";

  return (
    <div className="rounded-lg border border-dashed border-leaf-300 bg-leaf-50/50 p-4">
      <div className="mb-3 flex items-center gap-2">
        <UserAdd className="h-4 w-4 text-leaf-600" />
        <p className="text-sm font-medium text-leaf-800">Buat link undangan</p>
      </div>
      <p className="mb-3 text-xs text-leaf-700">
        Masukkan email dan pilih role. Link hanya dapat digunakan oleh akun dengan email tersebut.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        noValidate
      >
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_160px_auto] sm:items-start">
          <Input
            label="Email anggota"
            type="email"
            value={email}
            onChange={(event) => onEmailChange(event.target.value)}
            placeholder="email@contoh.com"
            error={emailError ?? undefined}
            helperText="Anggota harus masuk atau daftar dengan email ini untuk menerima undangan."
            autoComplete="email"
            disabled={isPending}
            containerClassName="min-w-0"
            aria-invalid={!!emailError || undefined}
            aria-describedby={emailError ? "invite-email-error" : undefined}
          />

          <div>
            <label htmlFor="invite-role" className="block text-sm font-medium text-wood-700">
              <span className="block">Role</span>
            </label>
            <select
              id="invite-role"
              value={role}
              onChange={(event) => onRoleChange(event.target.value as TeamInvitationRole)}
              disabled={isPending}
              aria-invalid={!!roleError || undefined}
              aria-describedby={roleError ? "invite-role-error" : undefined}
              className={cn(
                "mt-1 min-h-[44px] w-full rounded-md border bg-cream-50 px-3 py-2 text-sm text-wood-700",
                "focus:border-wood-500 focus:outline-none focus:ring-2 focus:ring-wood-200",
                "disabled:opacity-50 sm:min-h-0",
                roleError ? "border-error" : "border-wood-200",
              )}
            >
              {MANAGEABLE_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_CONFIG[r].label}
                </option>
              ))}
            </select>
            {roleError && (
              <p id="invite-role-error" className="mt-1 text-xs text-error" role="alert">
                {roleError}
              </p>
            )}
          </div>

          <Button
            type="submit"
            loading={isPending}
            disabled={isPending}
            className="sm:mt-7"
          >
            <Link2 className="h-4 w-4" />
            Buat link undangan
          </Button>
        </div>

        {/* Admin warning */}
        {isAdminWarning && (
          <div className="mt-3 flex items-start gap-2 rounded-md border border-honey-200 bg-honey-50 px-3 py-2 text-xs text-honey-800">
            <InfoCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>Admin memiliki akses pengelolaan yang luas, termasuk mengelola anggota dan membatalkan transaksi.</span>
          </div>
        )}

        {/* Role description */}
        {selectedRoleConfig && (
          <p className="mt-2 text-xs text-wood-500">
            {selectedRoleConfig.description}
          </p>
        )}
      </form>
    </div>
  );
}

// ── Pending invitation card ─────────────────────────────────────────

function PendingInvitationCard({
  invitation,
  onRefreshLink,
  onRevoke,
  actionPending,
}: Readonly<{
  invitation: TeamInvitation;
  onRefreshLink: () => void;
  onRevoke: () => void;
  actionPending: boolean;
}>) {
  const expiresAt = formatEpochDate(invitation.expires_at);

  return (
    <div className="min-w-0 rounded-lg border border-sky-200 bg-sky-50 p-4">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-700">
            <EnvelopeCheck className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="break-words text-sm font-semibold text-wood-800">
                {invitation.email}
              </p>
              <Badge variant="info" size="sm">Menunggu</Badge>
              <Badge variant={roleBadgeVariant(invitation.role)} size="sm">
                {ROLE_CONFIG[invitation.role].label}
              </Badge>
            </div>
            <p className="mt-1 break-words text-xs text-wood-500">
              Berlaku sampai {expiresAt}. Salin link atau buat ulang untuk mengirim ulang.
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

// ── Owner card ──────────────────────────────────────────────────────

function OwnerCard({ member }: Readonly<{ member: TeamMember }>) {
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

// ── Staff list content ──────────────────────────────────────────────

interface StaffListContentProps {
  readonly isLoading: boolean;
  readonly invitationsCount: number;
  readonly staffMembers: TeamMember[];
  readonly canManageTeam: boolean;
  readonly currentUserUserId: string | undefined;
  readonly rolePending: boolean;
  readonly removePending: boolean;
  readonly onRoleChangeClick: (member: TeamMember) => void;
  readonly onRemove: (member: TeamMember) => void;
}

function StaffListContent({
  isLoading,
  invitationsCount,
  staffMembers,
  canManageTeam,
  currentUserUserId,
  rolePending,
  removePending,
  onRoleChangeClick,
  onRemove,
}: Readonly<StaffListContentProps>) {
  if (isLoading) {
    return <TeamSkeleton />;
  }

  if (staffMembers.length === 0) {
    const title = invitationsCount > 0 ? "Menunggu anggota menerima undangan" : "Belum ada anggota";
    const body =
      invitationsCount > 0
        ? "Setelah undangan diterima, anggota akan muncul di daftar ini."
        : "Undang anggota untuk membantu pencatatan dan pengawasan pembukuan.";

    return (
      <EmptyState
        icon={<Users className="h-8 w-8" />}
        title={title}
        description={body}
        className="mt-4"
      />
    );
  }

  return (
    <div className="mt-4 space-y-3">
      {staffMembers.map((member) => (
        <MemberCard
          key={member.id}
          member={member}
          canManageTeam={canManageTeam}
          isCurrentUser={member.user_id === currentUserUserId}
          onRoleChange={() => onRoleChangeClick(member)}
          onRemove={() => onRemove(member)}
          rolePending={rolePending}
          removePending={removePending}
        />
      ))}
    </div>
  );
}

// ── Member card ─────────────────────────────────────────────────────

function MemberCard({
  member,
  canManageTeam,
  isCurrentUser,
  onRoleChange,
  onRemove,
  rolePending,
  removePending,
}: Readonly<{
  member: TeamMember;
  canManageTeam: boolean;
  isCurrentUser: boolean;
  onRoleChange: () => void;
  onRemove: () => void;
  rolePending: boolean;
  removePending: boolean;
}>) {
  const [showPerms, setShowPerms] = useState(false);
  const activeCount = countActivePermissions(member);
  const joinedDate = formatJoinedDate(member.joined_at);
  const canChangeRole = canManageTeam && member.role !== "owner" && !isCurrentUser;
  const canRemove = canManageTeam && member.role !== "owner" && !isCurrentUser;

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
                {ROLE_CONFIG[member.role].label}
              </Badge>
              {isCurrentUser && (
                <Badge variant="neutral" size="sm">Anda</Badge>
              )}
              {member.status && member.status !== "active" && (
                <Badge variant="warning" size="sm">{member.status}</Badge>
              )}
            </div>
            <p className="break-words text-xs text-wood-500">
              {member.email}
              {joinedDate && (
                <span className="text-wood-500 sm:ml-2">
                  Bergabung {joinedDate}
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 self-end sm:self-auto">
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
          {canChangeRole && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onRoleChange}
              disabled={rolePending || removePending}
              aria-label={`Ubah role ${member.full_name || "anggota"}`}
            >
              <span className="hidden sm:inline">Ubah role</span>
              <span className="sm:hidden">Role</span>
            </Button>
          )}
          {canRemove && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onRemove}
              disabled={removePending}
              aria-label={`Hapus ${member.full_name || "anggota"} dari tim`}
              className="text-error hover:bg-error/10 hover:text-error"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {!showPerms && (
        <div className="break-words border-t border-wood-100 px-4 py-2 text-xs text-wood-500">
          {activeCount > 0 ? `${activeCount} izin aktif` : "Tidak ada izin aktif"}
        </div>
      )}

      {showPerms && (
        <div className="border-t border-wood-100 bg-cream-100/50 px-4 py-3">
          <p className="mb-2 text-xs font-medium text-wood-600">Hak Akses</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {ALL_PERMISSION_KEYS.map((key) => {
              const checked = memberHasPermission(member, key);
              return (
                <div
                  key={key}
                  className={cn(
                    "flex items-start gap-3 rounded-md border p-3 text-left",
                    checked
                      ? "border-leaf-300 bg-leaf-50"
                      : "border-wood-200 bg-cream-50",
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                      checked
                        ? "border-leaf-500 bg-leaf-500"
                        : "border-wood-300 bg-cream-50",
                    )}
                    aria-hidden="true"
                  >
                    {checked && <Check className="h-3 w-3 text-white" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block break-words text-sm font-medium text-wood-700">
                      {PERMISSION_LABELS[key]}
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

// ── Role change dialog ──────────────────────────────────────────────

function RoleChangeDialog({
  open,
  member,
  newRole,
  onRoleChange,
  onSave,
  onClose,
  isPending,
}: Readonly<{
  open: boolean;
  member: TeamMember | null;
  newRole: TeamInvitationRole;
  onRoleChange: (role: TeamInvitationRole) => void;
  onSave: () => void;
  onClose: () => void;
  isPending: boolean;
}>) {
  if (!member) return null;

  const roleConfig = ROLE_CONFIG[newRole];
  const isAdminPromotion = newRole === "admin";

  // Filter assignable roles: can't assign owner, can't assign same role
  const assignableRoles = MANAGEABLE_ROLES.filter((r) => r !== member.role);

  return (
    <Modal open={open} onClose={isPending ? () => {} : onClose} size="sm" ariaLabel="Ubah role anggota">
      <ModalContent>
        <div className="space-y-4">
          <div>
            <p className="text-sm text-wood-600">Ubah role untuk:</p>
            <p className="mt-1 font-medium text-wood-800">
              {member.full_name || member.email}
            </p>
            <p className="text-xs text-wood-500">{member.email}</p>
          </div>

          <div>
            <p className="text-xs text-wood-500">
              Role saat ini: <span className="font-medium text-wood-700">{ROLE_CONFIG[member.role as TeamRole].label}</span>
            </p>
          </div>

          <div>
            <label htmlFor="role-dialog-select" className="block text-sm font-medium text-wood-700">
              Role baru
            </label>
            <select
              id="role-dialog-select"
              value={newRole}
              onChange={(event) => onRoleChange(event.target.value as TeamInvitationRole)}
              disabled={isPending}
              className="mt-1 min-h-[44px] w-full rounded-md border border-wood-200 bg-cream-50 px-3 py-2 text-sm text-wood-700 focus:border-wood-500 focus:outline-none focus:ring-2 focus:ring-wood-200 disabled:opacity-50 sm:min-h-0"
            >
              {assignableRoles.map((r) => (
                <option key={r} value={r}>
                  {ROLE_CONFIG[r].label}
                </option>
              ))}
            </select>
          </div>

          {roleConfig && (
            <div className="rounded-md border border-wood-100 bg-cream-50 p-3">
              <p className="text-xs font-medium text-wood-600">Hak akses {roleConfig.label}:</p>
              <ul className="mt-1 space-y-1">
                {ALL_PERMISSION_KEYS.map((key) => {
                  const enabled = rolePermission(newRole, key);
                  return (
                    <li key={key} className="flex items-center gap-2 text-xs">
                      {enabled ? (
                        <Check className="h-3 w-3 text-leaf-600" />
                      ) : (
                        <X className="h-3 w-3 text-wood-500" />
                      )}
                      <span className={enabled ? "text-wood-700" : "text-wood-500"}>
                        {PERMISSION_LABELS[key]}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {isAdminPromotion && (
            <div className="flex items-start gap-2 rounded-md border border-honey-200 bg-honey-50 px-3 py-2 text-xs text-honey-800">
              <InfoCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>Admin memiliki akses pengelolaan yang luas, termasuk mengelola anggota dan membatalkan transaksi.</span>
            </div>
          )}
        </div>
      </ModalContent>
      <ModalFooter>
        <Button variant="ghost" onClick={onClose} disabled={isPending}>
          Batal
        </Button>
        <Button
          variant="primary"
          onClick={onSave}
          loading={isPending}
          disabled={isPending || newRole === member.role}
        >
          Simpan perubahan
        </Button>
      </ModalFooter>
    </Modal>
  );
}

// ── Role comparison guide (secondary) ───────────────────────────────

function RoleComparisonGuide() {
  const [expanded, setExpanded] = useState(false);

  return (
    <details
      open={expanded}
      onToggle={(event) => setExpanded((event.target as HTMLDetailsElement).open)}
    >
      <Card>
        <CardHeader>
          <summary className="cursor-pointer list-none text-sm font-semibold text-wood-700">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Perbandingan hak akses role
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </div>
          </summary>
        </CardHeader>
        {expanded && (
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-3">
              {MANAGEABLE_ROLES.map((role) => (
                <div key={role} className="rounded-md border border-wood-100 bg-white p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-wood-700">
                      {ROLE_CONFIG[role].label}
                    </span>
                    <Badge variant={roleBadgeVariant(role)} size="sm">
                      {ROLE_CONFIG[role].label}
                    </Badge>
                  </div>
                  <p className="mb-2 text-xs text-wood-500">{ROLE_CONFIG[role].description}</p>
                  <div className="space-y-1.5">
                    {ALL_PERMISSION_KEYS.map((key) => {
                      const enabled = rolePermission(role, key);
                      return (
                        <div key={key} className="flex items-center gap-2 text-xs">
                          {enabled ? (
                            <Check className="h-3.5 w-3.5 text-leaf-600" />
                          ) : (
                            <X className="h-3.5 w-3.5 text-wood-500" />
                          )}
                          <span className={enabled ? "text-wood-700" : "text-wood-500"}>
                            {PERMISSION_LABELS[key]}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        )}
      </Card>
    </details>
  );
}

// ── Skeleton loader ─────────────────────────────────────────────────

function TeamSkeleton() {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 rounded-lg border border-wood-200 bg-cream-50 p-4">
        <div className="h-12 w-12 animate-pulse rounded-full bg-cream-200" />
        <div className="space-y-2">
          <div className="h-4 w-32 animate-pulse rounded bg-cream-200" />
          <div className="h-3 w-48 animate-pulse rounded bg-cream-200" />
        </div>
      </div>
      <div className="flex items-center gap-3 rounded-lg border border-wood-200 bg-cream-50 p-4">
        <div className="h-10 w-10 animate-pulse rounded-full bg-cream-200" />
        <div className="space-y-2">
          <div className="h-4 w-28 animate-pulse rounded bg-cream-200" />
          <div className="h-3 w-40 animate-pulse rounded bg-cream-200" />
        </div>
      </div>
      <div className="flex items-center gap-3 rounded-lg border border-wood-200 bg-cream-50 p-4">
        <div className="h-10 w-10 animate-pulse rounded-full bg-cream-200" />
        <div className="space-y-2">
          <div className="h-4 w-36 animate-pulse rounded bg-cream-200" />
          <div className="h-3 w-44 animate-pulse rounded bg-cream-200" />
        </div>
      </div>
    </div>
  );
}
