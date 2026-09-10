import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronDown, Plus } from "reicon-react";
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
import { cn } from "@/lib/utils";

type AccountClass = Account["account_class"];

const CLASS_ORDER: AccountClass[] = ["asset", "liability", "equity", "income", "expense"];

const CLASS_LABELS: Record<AccountClass, string> = {
  asset: "Aset",
  liability: "Kewajiban",
  equity: "Ekuitas",
  income: "Pendapatan",
  expense: "Beban",
};

interface AccountGroup {
  class: AccountClass;
  label: string;
  accounts: Account[];
}

export function ChartOfAccountsPage() {
  const { data: orgData } = useOrganization();
  const orgId = orgData?.organization?.id;
  const queryClient = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [accountClass, setAccountClass] = useState<CreatableAccountClass>("expense");
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<ReadonlySet<AccountClass>>(new Set());

  const query = useQuery({
    queryKey: queryKeys.accounts.fullList(orgId ?? ""),
    queryFn: async () => {
      if (!orgId) throw new Error("No organization");
      return listAccounts({ includeInactive: true });
    },
    enabled: !!orgId,
  });

  const groups: AccountGroup[] = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const byClass = new Map<AccountClass, Account[]>();
    for (const account of query.data ?? []) {
      if (
        needle !== "" &&
        !account.name.toLowerCase().includes(needle) &&
        !account.code.toLowerCase().includes(needle)
      ) {
        continue;
      }
      const list = byClass.get(account.account_class) ?? [];
      list.push(account);
      byClass.set(account.account_class, list);
    }
    return CLASS_ORDER.filter((c) => (byClass.get(c) ?? []).length > 0).map((c) => ({
      class: c,
      label: CLASS_LABELS[c],
      accounts: (byClass.get(c) ?? []).sort((a, b) => a.code.localeCompare(b.code)),
    }));
  }, [query.data, search]);

  const toggleGroup = (c: AccountClass) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  };

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

  let groupsContent: ReactNode = null;
  if (query.isError) {
    groupsContent = (
      <ErrorState
        title="Gagal memuat bagan akun"
        message="Terjadi kesalahan saat mengambil daftar akun."
        onRetry={() => query.refetch()}
      />
    );
  } else if (groups.length === 0) {
    groupsContent = (
      <EmptyState
        title="Belum ada akun"
        description="Akun bawaan dibuat otomatis saat organisasi dibuat."
      />
    );
  } else {
    groupsContent = (
      <AccountGroupList groups={groups} collapsed={collapsed} onToggle={toggleGroup} />
    );
  }

  return (
    <div className="space-y-4">
      <Link
        to="/accounts"
        aria-label="Kembali ke Kas & Bank"
        className="inline-flex min-h-[44px] items-center gap-1 text-sm font-medium text-wood-700 hover:text-wood-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Kas & Bank
      </Link>
      <PageHeader
        title="Bagan Akun"
        description="Seluruh akun pembukuan per klasifikasi. Akun sistem bawaan tidak dapat diubah."
      />
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <Input
          label="Cari akun"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Nama atau kode akun"
        />
        <Button onClick={() => setCreateOpen(true)} fullWidth className="sm:w-auto">
          <Plus className="h-4 w-4" />
          Tambah Akun
        </Button>
      </div>

      {groupsContent}

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

function AccountGroupList({
  groups,
  collapsed,
  onToggle,
}: {
  readonly groups: AccountGroup[];
  readonly collapsed: ReadonlySet<AccountClass>;
  readonly onToggle: (c: AccountClass) => void;
}) {
  return (
    <>
      {groups.map((group) => {
        const folded = collapsed.has(group.class);
        return (
          <Card elevated key={group.class}>
            <button
              type="button"
              onClick={() => onToggle(group.class)}
              aria-expanded={!folded}
              aria-label={`${group.label}, ${group.accounts.length} akun`}
              className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left"
            >
              <span className="text-base font-semibold text-text-primary">
                {group.label}
                <span className="ml-2 text-sm font-normal text-text-tertiary">
                  {group.accounts.length}
                </span>
              </span>
              <ChevronDown
                className={cn("h-4 w-4 shrink-0 text-wood-500 transition-transform", folded && "-rotate-90")}
              />
            </button>
            {!folded && (
              <CardContent className="border-t border-wood-100 p-0">
                <ul className="divide-y divide-wood-100">
                  {group.accounts.map((account) => (
                    <li
                      key={account.id}
                      className="flex items-center justify-between gap-4 px-5 py-2.5"
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
            )}
          </Card>
        );
      })}
    </>
  );
}
