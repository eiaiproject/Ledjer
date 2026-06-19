import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
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
import { UserPlus, Shield, Trash2, ChevronDown, ChevronUp } from "lucide-react";

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

const PERMISSION_LABELS: Record<string, { label: string; desc: string }> = {
  can_create_transaction: { label: "Buat Transaksi", desc: "Dapat mencatat transaksi baru" },
  can_view_reports: { label: "Lihat Laporan", desc: "Dapat melihat buku besar, neraca saldo, laba rugi" },
  can_manage_accounts: { label: "Kelola Akun", desc: "Dapat menambah/mengedit akun" },
  can_void_transaction: { label: "Batalkan Transaksi", desc: "Dapat membatalkan transaksi yang sudah posted" },
  can_manage_products: { label: "Kelola Produk", desc: "Dapat menambah/mengedit produk dan persediaan" },
  can_view_audit_log: { label: "Lihat Audit Log", desc: "Dapat melihat log aktivitas" },
};

export function TeamSettingsPage() {
  const queryClient = useQueryClient();
  const { data: orgData } = useOrganization();
  const isOwner = useIsOwner();
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<StaffMember | null>(null);

  const { data: members, isLoading } = useQuery({
    queryKey: ["org-members", orgData?.organization?.id],
    queryFn: async () => {
      if (!orgData?.organization?.id) return [];
      const { data, error } = await supabase
        .from("organization_members")
        .select("id, user_id, role, status, can_create_transaction, can_view_reports, can_manage_accounts, can_void_transaction, can_manage_products, can_view_audit_log, joined_at")
        .eq("organization_id", orgData.organization.id)
        .neq("status", "removed")
        .order("role");
      if (error) throw error;

      const membersData = (data || []) as StaffMember[];
      const profiles = await fetchProfilesByUserIds(membersData.map((member) => member.user_id));

      return membersData.map((member) => ({
        ...member,
        profiles: profiles[member.user_id],
      }));
    },
    enabled: !!orgData?.organization?.id,
  });

  const inviteMutation = useMutation({
    mutationFn: async (email: string) => {
      const organizationId = orgData?.organization?.id;
      if (!organizationId) throw new Error("Organisasi tidak ditemukan");
      const { data, error } = await supabase.rpc("invite_staff", {
        p_organization_id: organizationId,
        p_email: email,
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
    mutationFn: async ({ memberId, permission, value }: { memberId: string; permission: string; value: boolean }) => {
      const organizationId = orgData?.organization?.id;
      if (!organizationId) throw new Error("Organisasi tidak ditemukan");
      const { error } = await supabase.rpc("update_staff_permissions", {
        p_organization_id: organizationId,
        p_member_id: memberId,
        p_can_create_transaction: permission === "can_create_transaction" ? value : null,
        p_can_view_reports: permission === "can_view_reports" ? value : null,
        p_can_manage_accounts: permission === "can_manage_accounts" ? value : null,
        p_can_void_transaction: permission === "can_void_transaction" ? value : null,
        p_can_manage_products: permission === "can_manage_products" ? value : null,
        p_can_view_audit_log: permission === "can_view_audit_log" ? value : null,
      });
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

  const staffMembers = members?.filter((m) => m.role === "staff") || [];
  const ownerMembers = members?.filter((m) => m.role === "owner") || [];

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-wood-800">Tim & Izin</h1>
        <p className="text-sm text-wood-500 mt-1">Kelola anggota tim dan hak akses mereka</p>
      </div>

      {/* Owner Section */}
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-wood-700">Pemilik</h2>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <PageSpinner />
          ) : (
            <div className="space-y-3">
              {ownerMembers.map((member) => (
                <div key={member.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-wood-500 flex items-center justify-center text-cream-50 text-sm font-medium">
                      {member.profiles?.full_name?.charAt(0) || "O"}
                    </div>
                    <div>
                      <p className="font-medium text-wood-800">{member.profiles?.full_name || "Pemilik"}</p>
                      <p className="text-xs text-wood-400">{member.profiles?.email}</p>
                    </div>
                  </div>
                  <Badge variant="info">Owner</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Staff Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-wood-700">Staf</h2>
            {isOwner && orgData?.organization?.current_plan === "business" && (
              <span className="text-xs text-wood-400">{staffMembers.length}/1 staf</span>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {!isOwner ? (
            <div className="text-center py-6 text-sm text-wood-400">
              Hanya pemilik yang dapat mengelola staf
            </div>
          ) : orgData?.organization?.current_plan !== "business" ? (
            <div className="rounded-lg border border-clay-400/30 bg-clay-400/10 p-4">
              <p className="text-sm text-clay-600">
                Invite staf memerlukan paket <strong>Business</strong>.
              </p>
              <a href="/settings/billing" className="mt-2 inline-block text-sm font-medium text-clay-700 underline">
                Upgrade paket →
              </a>
            </div>
          ) : (
            <>
              {/* Invite Form */}
              {staffMembers.length === 0 && (
                <div className="mb-4 rounded-lg border border-wood-200 bg-cream-50 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <UserPlus className="h-4 w-4 text-wood-500" />
                    <p className="text-sm font-medium text-wood-700">Undang staf baru</p>
                  </div>
                  <p className="mb-3 text-xs text-wood-400">Staf harus sudah mendaftar di Ledjer terlebih dahulu</p>
                  {inviteError && (
                    <div className="mb-3 rounded-md bg-error/10 p-2 text-xs text-error">{inviteError}</div>
                  )}
                  <div className="flex gap-2">
                    <Input
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="email@contoh.com"
                    />
                    <Button onClick={() => inviteMutation.mutate(inviteEmail)} loading={inviteMutation.isPending} disabled={!inviteEmail}>
                      Undang
                    </Button>
                  </div>
                </div>
              )}

              {/* Staff List */}
              {staffMembers.length === 0 ? (
                <EmptyState
                  title="Belum ada staf"
                  description="Undang staf untuk membantu mengelola bisnis"
                />
              ) : (
                <div className="space-y-3">
                  {staffMembers.map((member) => (
                    <StaffCard
                      key={member.id}
                      member={member}
                      onPermissionChange={(permission, value) =>
                        permissionMutation.mutate({ memberId: member.id, permission, value })
                      }
                      onRemove={() => {
                        setSelectedMember(member);
                        setRemoveDialogOpen(true);
                      }}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={removeDialogOpen}
        onClose={() => { setRemoveDialogOpen(false); setSelectedMember(null); }}
        onConfirm={() => selectedMember && removeMutation.mutate(selectedMember.id)}
        title="Hapus Staf?"
        message={`"${selectedMember?.profiles?.full_name}" akan dihapus dari organisasi. Semua aksesnya akan dicabut.`}
        confirmLabel="Ya, Hapus"
        loading={removeMutation.isPending}
      />
    </div>
  );
}

function StaffCard({ member, onPermissionChange, onRemove }: {
  member: StaffMember;
  onPermissionChange: (permission: string, value: boolean) => void;
  onRemove: () => void;
}) {
  const [showPerms, setShowPerms] = useState(false);

  return (
    <div className="rounded-lg border border-wood-200 bg-cream-50">
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-leaf-500 flex items-center justify-center text-white text-sm font-medium">
            {member.profiles?.full_name?.charAt(0) || "S"}
          </div>
          <div>
            <p className="font-medium text-wood-800">{member.profiles?.full_name || "Staf"}</p>
            <p className="text-xs text-wood-400">{member.profiles?.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setShowPerms(!showPerms)}>
            <Shield className="h-4 w-4" />
            Izin
            {showPerms ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </Button>
          <Button variant="ghost" size="sm" onClick={onRemove} className="text-error hover:text-error hover:bg-error/10">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {showPerms && (
        <div className="border-t border-wood-100 px-4 py-3 bg-cream-100/50">
          <div className="grid gap-3 sm:grid-cols-2">
            {Object.entries(PERMISSION_LABELS).map(([key, { label, desc }]) => (
              <label key={key} className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={member[key as keyof StaffMember] as boolean}
                  onChange={(e) => onPermissionChange(key, e.target.checked)}
                  className="mt-0.5 rounded border-wood-300 text-leaf-500 focus:ring-leaf-500"
                />
                <div>
                  <p className="text-sm font-medium text-wood-700">{label}</p>
                  <p className="text-xs text-wood-400">{desc}</p>
                </div>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
