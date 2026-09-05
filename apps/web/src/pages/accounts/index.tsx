import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "reicon-react";
import { useOrganization } from "@/hooks/useOrganization";
import { createCashBankAccount, listAccounts, patchAccount, type CashBankSubtype } from "@/lib/api/accounts";
import { queryKeys } from "@/lib/query-keys";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { toast } from "@/components/ui/toast";
import { formatIDR } from "@/lib/utils";
import { translateError } from "@/lib/errors";

export function AccountsPage() {
  const { data: orgData } = useOrganization();
  const orgId = orgData?.organization?.id;
  const queryClient = useQueryClient();

  const [subtype, setSubtype] = useState<CashBankSubtype>("cash");
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  const query = useQuery({
    queryKey: queryKeys.accounts.fullList(orgId ?? ""),
    queryFn: async () => {
      if (!orgId) throw new Error("No organization");
      return listAccounts({ includeInactive: true });
    },
    enabled: !!orgId,
  });

  const cashAccounts = (query.data ?? []).filter((a) => a.account_subtype === "cash");
  const bankAccounts = (query.data ?? []).filter((a) => a.account_subtype === "bank");

  const handleCreate = async () => {
    if (creating) return;
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Nama akun harus diisi.");
      return;
    }
    setCreating(true);
    try {
      await createCashBankAccount(subtype, trimmed);
      toast.success("Akun berhasil dibuat.");
      setName("");
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts.all(orgId ?? "") });
    } catch (err) {
      toast.error(translateError(err));
    } finally {
      setCreating(false);
    }
  };

  const handleToggleActive = async (accountId: string, isActive: boolean) => {
    try {
      await patchAccount(accountId, { isActive: !isActive });
      toast.success(isActive ? "Akun dinonaktifkan." : "Akun diaktifkan.");
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts.all(orgId ?? "") });
    } catch (err) {
      toast.error(translateError(err));
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Kas & Bank"
        description="Kelola akun kas dan rekening bank usaha Anda."
      />

      <Card elevated>
        <CardContent className="p-4">
          <form
            className="grid items-end gap-3 sm:grid-cols-3"
            onSubmit={(e) => {
              e.preventDefault();
              handleCreate();
            }}
          >
            <Select
              label="Jenis"
              value={subtype}
              onChange={(e) => setSubtype(e.target.value as CashBankSubtype)}
              options={[
                { value: "cash", label: "Kas" },
                { value: "bank", label: "Bank" },
              ]}
            />
            <Input
              label="Nama Akun"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Contoh: Kas Kecil, BCA 123456"
              containerClassName="sm:col-span-2"
            />
            <div className="sm:col-span-3 sm:flex sm:justify-end">
              <Button type="submit" loading={creating} fullWidth className="sm:w-auto">
                <Plus className="h-4 w-4" />
                Tambah Akun
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {query.isError ? (
        <ErrorState title="Gagal memuat akun" message="Terjadi kesalahan saat mengambil daftar akun." onRetry={() => query.refetch()} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <AccountGroup
            title="Kas"
            accounts={cashAccounts}
            onToggleActive={handleToggleActive}
          />
          <AccountGroup
            title="Bank"
            accounts={bankAccounts}
            onToggleActive={handleToggleActive}
          />
        </div>
      )}
    </div>
  );
}

function AccountGroup({
  title,
  accounts,
  onToggleActive,
}: {
  readonly title: string;
  readonly accounts: { id: string; code: string; name: string; balance_idr?: number; is_active: number }[];
  readonly onToggleActive: (accountId: string, isActive: boolean) => void;
}) {
  return (
    <Card elevated title={title}>
      <CardContent className="p-0">
        {accounts.length === 0 ? (
          <EmptyState title={`Belum ada akun ${title.toLowerCase()}`} description="Tambahkan akun untuk mulai mencatat." />
        ) : (
          <ul className="divide-y divide-wood-100">
            {accounts.map((account) => (
              <li key={account.id} className="flex items-center justify-between gap-4 px-5 py-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 break-words text-sm font-medium text-text-primary">
                    {account.name}
                    {account.is_active !== 1 && (
                      <Badge variant="neutral" size="sm">
                        Nonaktif
                      </Badge>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-text-tertiary">{account.code}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <p className="num-mono text-sm font-semibold text-text-primary">
                    {formatIDR(account.balance_idr ?? 0)}
                  </p>
                  {account.is_active === 1 ? (
                    <Button variant="ghost" size="sm" onClick={() => onToggleActive(account.id, true)}>
                      Nonaktifkan
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => onToggleActive(account.id, false)}>
                      Aktifkan
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}