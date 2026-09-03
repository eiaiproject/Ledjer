import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth-context";
import { useOrganization } from "@/hooks/useOrganization";
import { updateOrganization } from "@/lib/api/organizations";
import { queryKeys } from "@/lib/query-keys";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import { translateError } from "@/lib/errors";

export function SettingsPage() {
  const { data: orgData } = useOrganization();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [name, setName] = useState(orgData?.organization?.name ?? "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (saving) return;
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Nama usaha tidak boleh kosong.");
      return;
    }
    setSaving(true);
    try {
      await updateOrganization(trimmed);
      toast.success("Profil usaha diperbarui.");
      queryClient.invalidateQueries({ queryKey: queryKeys.allOrganization() });
    } catch (err) {
      toast.error(translateError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader title="Pengaturan" description="Kelola profil usaha dan akun Anda." />

      <Card elevated>
        <CardHeader>
          <h2 className="text-base font-semibold text-text-primary">Profil Usaha</h2>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              handleSave();
            }}
          >
            <Input
              label="Nama Usaha"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nama usaha Anda"
            />
            <div className="flex justify-end">
              <Button type="submit" loading={saving}>
                Simpan
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card elevated>
        <CardHeader>
          <h2 className="text-base font-semibold text-text-primary">Akun</h2>
        </CardHeader>
        <CardContent>
          <dl className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-sm text-text-secondary">Nama</dt>
              <dd className="break-words text-sm font-medium text-text-primary">{user?.full_name ?? "-"}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-sm text-text-secondary">Email</dt>
              <dd className="break-words text-sm font-medium text-text-primary">{user?.email ?? "-"}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}