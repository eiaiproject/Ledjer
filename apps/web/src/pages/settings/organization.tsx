import { useState, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useOrganization } from "@/hooks/useOrganization";
import { updateOrganization } from "@/lib/api/organizations";
import { queryKeys } from "@/lib/query-keys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { FieldHelp } from "@/components/ui/help-tooltip";
import { toast } from "@/components/ui/toast";
import { PageShell } from "@/components/ui/page-shell";
import { PageGuide } from "@/components/ui/page-guide";
import { translateError } from "@/lib/errors";
import { Store, Building } from "reicon-react";

const BUSINESS_TYPE_LABELS: Record<string, string> = {
  service: "Jasa",
  simple_trading: "Dagang",
};

export function OrganizationSettingsPage() {
  const queryClient = useQueryClient();
  const { data: orgData, isLoading } = useOrganization();
  const org = orgData?.organization;
  const isOwner = orgData?.member?.role === "owner";

  const [orgName, setOrgName] = useState(org?.name || "");

  const updateMutation = useMutation({
    mutationFn: (name: string) => updateOrganization(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.allOrganization() });
      queryClient.invalidateQueries({ queryKey: queryKeys.organization(orgData?.member?.user_id) });
      toast.success("Nama bisnis berhasil diperbarui.");
    },
    onError: (err) => {
      toast.error(translateError(err));
    },
  });

  const handleSave = useCallback(() => {
    const trimmed = orgName.trim();
    if (!trimmed || trimmed.length < 2) {
      toast.error("Nama bisnis minimal 2 karakter.");
      return;
    }
    if (trimmed === org?.name) {
      toast.info("Tidak ada perubahan.");
      return;
    }
    updateMutation.mutate(trimmed);
  }, [orgName, org, updateMutation]);

  if (isLoading) {
    return (
      <PageShell header={{ title: "Profil Usaha", description: "Informasi dan pengaturan bisnis Anda." }}>
        <Card>
          <CardContent>
            <div className="flex items-center justify-center py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-wood-500 border-t-transparent" />
            </div>
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  return (
    <PageShell
      header={{
        title: "Profil Usaha",
        description: "Informasi dan pengaturan bisnis Anda.",
      }}
    >
      {/* Panduan halaman */}
      <PageGuide guideKey="settings/organization" />

      {/* Business Name */}
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-wood-700">Informasi Bisnis</h2>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSave();
            }}
            noValidate
            className="space-y-4"
          >
            <Input
              label="Nama Bisnis"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="Nama usaha atau bisnis Anda"
              disabled={!isOwner || updateMutation.isPending}
              helperText={!isOwner ? "Hanya pemilik yang dapat mengubah nama bisnis." : undefined}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <span className="block text-sm font-medium text-wood-700">Jenis Bisnis</span>
                <p className="mt-1 flex items-center gap-2 rounded-md border border-wood-100 bg-cream-50 px-3 py-2 text-sm text-wood-600">
                  <Building className="h-4 w-4 text-wood-400" />
                  {org?.business_type ? BUSINESS_TYPE_LABELS[org.business_type] || org.business_type : "—"}
                </p>
              </div>
              <div>
                <span className="block text-sm font-medium text-wood-700">Mata Uang</span>
                <p className="mt-1 flex items-center gap-2 rounded-md border border-wood-100 bg-cream-50 px-3 py-2 text-sm text-wood-600">
                  <Store className="h-4 w-4 text-wood-400" />
                  {org?.base_currency || "IDR"}
                </p>
              </div>
            </div>

            {isOwner && (
              <div className="flex justify-end pt-2">
                <Button
                  type="submit"
                  loading={updateMutation.isPending}
                  disabled={updateMutation.isPending}
                >
                  Simpan perubahan
                </Button>
              </div>
            )}
          </form>
        </CardContent>
      </Card>

      {/* Business Details (read-only) */}
      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-wood-700">Detail Akuntansi</h2>
        </CardHeader>
        <CardContent>
          <FieldHelp topic="account_locked" label="Detail akuntansi terkunci untuk menjaga konsistensi laporan" />
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <span className="block text-sm font-medium text-wood-700">Tanggal Mulai Pembukuan</span>
              <p className="mt-1 rounded-md border border-wood-100 bg-cream-50 px-3 py-2 text-sm text-wood-600">
                {org?.books_start_date || "—"}
              </p>
            </div>
            <div>
              <span className="block text-sm font-medium text-wood-700">Status Onboarding</span>
              <p className="mt-1 rounded-md border border-wood-100 bg-cream-50 px-3 py-2 text-sm text-wood-600">
                {org?.onboarding_status === "completed" ? "Selesai" : "Belum selesai"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </PageShell>
  );
}
