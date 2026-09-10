import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "reicon-react";
import { useOrganization } from "@/hooks/useOrganization";
import {
  createAccount,
  listAccounts,
  type Account,
  type CreatableAccountClass,
} from "@/lib/api/accounts";
import { queryKeys } from "@/lib/query-keys";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Modal, ModalContent, ModalFooter } from "@/components/ui/modal";
import { toast } from "@/components/ui/toast";
import { translateError } from "@/lib/errors";

type AccountClass = Account["account_class"];

const CLASS_ORDER: AccountClass[] = ["asset", "liability", "equity", "income", "expense"];

const CLASS_LABELS: Record<AccountClass, string> = {
  asset: "Aset",
  liability: "Kewajiban",
  equity: "Ekuitas",
  income: "Pendapatan",
  expense: "Beban",
};

export function ChartOfAccountsPage() {
  const { data: orgData } = useOrganization();
  const orgId = orgData?.organization?.id;
  const queryClient = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [accountClass, setAccountClass] = useState<CreatableAccountClass>("expense");
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

  const groups = useMemo(() => {
    const byClass = new Map<AccountClass, Account[]>();
    for (const account of query.data ?? []) {
      const list = byClass.get(account.account_class) ?? [];
      list.push(account);
      byClass.set(account.account_class, list);
    }
    return CLASS_ORDER.filter((c) => (byClass.get(c) ?? []).length > 0).map((c) => ({
      class: c,
      label: CLASS_LABELS[c],
      accounts: (byClass.get(c) ?? []).sort((a, b) => a.code.localeCompare(b.code)),
    }));
  }, [query.data]);

  const handleCreate = async () => {
    if (creating) return;
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Nama akun harus diisi.");
      return;
    }
    setCreating(true);
    try {
      const created = await createAccount(accountClass, trimmed);
      toast.success(`Akun ${created.code} berhasil dibuat.`);
      setName("");
      setCreateOpen(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts.all(orgId ?? "") });
    } catch (err) {
      toast.error(translateError(err));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Bagan Akun"
        description="Seluruh akun pembukuan per klasifikasi. Akun sistem bawaan tidak dapat diubah."
      />
      <Button onClick={() => setCreateOpen(true)} fullWidth className="sm:w-auto">
        <Plus className="h-4 w-4" />
        Tambah Akun
      </Button>

      {query.isError ? (
        <ErrorState
          title="Gagal memuat bagan akun"
          message="Terjadi kesalahan saat mengambil daftar akun."
          onRetry={() => query.refetch()}
        />
      ) : groups.length === 0 ? (
        <EmptyState
          title="Belum ada akun"
          description="Akun bawaan dibuat otomatis saat organisasi dibuat."
        />
      ) : (
        groups.map((group) => (
          <Card elevated key={group.class} title={group.label}>
            <CardContent className="p-0">
              <ul className="divide-y divide-wood-100">
                {group.accounts.map((account) => (
                  <li
                    key={account.id}
                    className="flex items-center justify-between gap-4 px-5 py-3"
                  >
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 break-words text-sm font-medium text-text-primary">
                        <span className="num-mono shrink-0 text-xs text-text-tertiary">
                          {account.code}
                        </span>
                        {account.name}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {account.is_system === 1 && (
                        <Badge variant="neutral" size="sm">
                          Sistem
                        </Badge>
                      )}
                      {account.is_active !== 1 && (
                        <Badge variant="neutral" size="sm">
                          Nonaktif
                        </Badge>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Tambah Akun" size="sm">
        <ModalContent className="space-y-4">
          <Select
            label="Klasifikasi"
            value={accountClass}
            onChange={(e) => setAccountClass(e.target.value as CreatableAccountClass)}
            options={[
              { value: "expense", label: "Beban" },
              { value: "income", label: "Pendapatan" },
            ]}
          />
          <Input
            id="create-nama-akun"
            label="Nama Akun"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Contoh: Beban Iklan"
          />
        </ModalContent>
        <ModalFooter>
          <Button variant="ghost" onClick={() => setCreateOpen(false)}>
            Batal
          </Button>
          <Button onClick={handleCreate} loading={creating}>
            <Plus className="h-4 w-4" />
            Simpan Akun
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
