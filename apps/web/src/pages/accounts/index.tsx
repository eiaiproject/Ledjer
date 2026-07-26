import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  Edit2,
  Search,
  Wallet,
  Bank,
  CreditCard,
  AlertCircle,
  Qr,
  Plus,
  Download,
  Check,
  X,
  Shield,
} from "reicon-react";
import { useOrganization, useOrgPermissions } from "@/hooks/useOrganization";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Modal, ModalContent, ModalFooter } from "@/components/ui/modal";
import { toast } from "@/components/ui/toast";
import { exportAccountsCsv } from "@/lib/csv-export";
import {
  createCashBankAccount,
  listAccounts,
  updateAccountName,
  type Account,
  type CashBankKind,
} from "@/lib/api/accounts";

/* ------------------------------------------------------------------ */
/*  Types & Constants                                                  */
/* ------------------------------------------------------------------ */

const ACCOUNT_TYPE_LABELS: Record<string, { label: string; color: "success" | "info" | "warning" | "error" | "neutral" }> = {
  asset: { label: "Aset", color: "success" },
  liability: { label: "Kewajiban", color: "error" },
  equity: { label: "Ekuitas", color: "info" },
  revenue: { label: "Pendapatan", color: "success" },
  cogs: { label: "HPP", color: "warning" },
  expense: { label: "Beban", color: "error" },
  other_income: { label: "Pendapatan Lain", color: "success" },
  other_expense: { label: "Beban Lain", color: "error" },
};

const ACCOUNT_TYPE_GROUPS = [
  { type: "asset", label: "Aset", description: "Harta yang dimiliki bisnis" },
  { type: "liability", label: "Kewajiban", description: "Utang yang harus dibayar" },
  { type: "equity", label: "Ekuitas", description: "Modal pemilik" },
  { type: "revenue", label: "Pendapatan", description: "Pemasukan dari penjualan" },
  { type: "cogs", label: "Harga Pokok Penjualan", description: "Biaya produk yang terjual" },
  { type: "expense", label: "Beban Operasional", description: "Biaya operasional bisnis" },
  { type: "other_income", label: "Pendapatan Lain", description: "Pendapatan di luar penjualan" },
  { type: "other_expense", label: "Beban Lain", description: "Beban di luar operasional" },
];

type Tab = "cashbank" | "all";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function AccountStatusBadge({ account }: { readonly account: Account }) {
  if (account.is_system) {
    return (
      <Badge variant="neutral" size="sm">
        <Shield className="h-3 w-3" aria-hidden="true" />
        Akun bawaan
      </Badge>
    );
  }
  if (account.is_active) {
    return (
      <Badge variant="success" size="sm">
        <Check className="h-3 w-3" aria-hidden="true" />
        Aktif
      </Badge>
    );
  }
  return (
    <Badge variant="error" size="sm">
      <X className="h-3 w-3" aria-hidden="true" />
      Nonaktif
    </Badge>
  );
}

function getCashBankKind(account: { code: number; name: string; is_cash_account: boolean }): CashBankKind {
  if (account.code >= 1110 && account.code < 1120) return "cash";
  if (account.code >= 1120 && account.code < 1130) return "bank";
  if (account.code >= 1140 && account.code < 1150) return "ewallet";

  const name = account.name.toLowerCase();
  if (/qris|qr/i.test(name)) return "qris";
  if (/bank|bca|bri|bni|mandiri|cimb|permata|danamon|mega|btn|bsi|ocbc|uob|maybank|panin|digibank|jago|blu|neobank|marl/i.test(name)) return "bank";
  if (/ovo|dana|gopay|shopeepay|linkaja|isaku|cash|kas|dompet/i.test(name)) return "cash";
  if (/e-?wallet|dompet digital/i.test(name)) return "ewallet";

  return account.is_cash_account ? "cash" : "bank";
}

const CASH_BANK_KINDS: { kind: CashBankKind; label: string; icon: typeof Wallet; placeholder: string }[] = [
  { kind: "cash", label: "Kas", icon: Wallet, placeholder: "Kas Toko" },
  { kind: "bank", label: "Bank", icon: Bank, placeholder: "BCA / Mandiri / BRI" },
  { kind: "qris", label: "QRIS", icon: Qr, placeholder: "QRIS BRI" },
  { kind: "ewallet", label: "E-wallet", icon: CreditCard, placeholder: "GoPay / ShopeePay" },
];

function getNextAccountCode(existingAccounts: Account[], kind: CashBankKind): number {
  let minCode: number;
  let maxCode: number;

  switch (kind) {
    case "cash":
      minCode = 1111;
      maxCode = 1119;
      break;
    case "bank":
      minCode = 1121;
      maxCode = 1129;
      break;
    case "qris":
    case "ewallet":
      minCode = 1140;
      maxCode = 1149;
      break;
    default:
      minCode = 1190;
      maxCode = 1199;
  }

  const usedCodes = existingAccounts
    .map((a) => a.code)
    .filter((c) => c >= minCode && c <= maxCode)
    .sort((a, b) => a - b);

  let nextCode = minCode;
  for (const code of usedCodes) {
    if (code > nextCode) break;
    nextCode = code + 1;
  }

  return nextCode <= maxCode ? nextCode : -1;
}

const CASH_BANK_META: Record<CashBankKind, { label: string; icon: typeof Wallet; bgClass: string; iconClass: string }> = {
  cash: { label: "Kas", icon: Wallet, bgClass: "bg-leaf-100", iconClass: "text-leaf-600" },
  bank: { label: "Bank", icon: Bank, bgClass: "bg-leaf-100", iconClass: "text-leaf-600" },
  qris: { label: "QRIS", icon: Qr, bgClass: "bg-leaf-100", iconClass: "text-leaf-600" },
  ewallet: { label: "E-wallet", icon: CreditCard, bgClass: "bg-leaf-100", iconClass: "text-leaf-600" },
};

function accountMatchesSearch(a: Account, search: string): boolean {
  if (!search) return true;
  const q = search.toLowerCase();
  const rg = a.report_group;
  return (
    a.code.toString().includes(q) ||
    a.name.toLowerCase().includes(q) ||
    (rg?.toLowerCase().includes(q) ?? false)
  );
}

/* ------------------------------------------------------------------ */
/*  Add Cash/Bank Modal                                                */
/* ------------------------------------------------------------------ */

interface AddCashBankModalProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onSuccess: () => void;
  readonly accounts: Account[];
}

function AddCashBankModal({ open, onClose, onSuccess, accounts }: AddCashBankModalProps) {
  const queryClient = useQueryClient();
  const { data: orgData } = useOrganization();
  const [selectedKind, setSelectedKind] = useState<CashBankKind>("bank");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  const selectedMeta = CASH_BANK_KINDS.find((k) => k.kind === selectedKind);
  const nextCode = getNextAccountCode(accounts, selectedKind);
  const isRangeExhausted = nextCode === -1;

  const createMutation = useMutation({
    mutationFn: async (data: { kind: CashBankKind; name: string }) => {
      if (!orgData?.organization?.id) throw new Error("Organisasi tidak ditemukan");
      const trimmed = data.name.trim();
      if (!trimmed) throw new Error("Nama akun wajib diisi");
      if (trimmed.length > 60) throw new Error("Nama akun maksimal 60 karakter");
      return createCashBankAccount(data.kind, trimmed);
    },
    onSuccess: () => {
      toast.success("Akun berhasil ditambahkan");
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts.all(orgData?.organization?.id ?? "") });
      onSuccess();
      onClose();
    },
    onError: (err: Error) => {
      setError(err.message);
      toast.error(err.message || "Gagal menambahkan akun");
    },
  });

  const handleSubmit = () => {
    setError("");
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Nama akun wajib diisi");
      return;
    }
    if (trimmed.length > 60) {
      setError("Nama akun maksimal 60 karakter");
      return;
    }
    createMutation.mutate({ kind: selectedKind, name: trimmed });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !createMutation.isPending) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <Modal open={open} onClose={createMutation.isPending ? () => {} : onClose} title="Tambah Kas/Bank" size="md">
      <ModalContent>
        <div className="space-y-4">
          <div>
            <fieldset>
              <legend className="mb-2 block text-sm font-medium text-text-secondary">Jenis akun</legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {CASH_BANK_KINDS.map((k) => {
                  const Icon = k.icon;
                  return (
                    <button
                      key={k.kind}
                      type="button"
                      onClick={() => setSelectedKind(k.kind)}
                      className={cn(
                        "flex flex-col items-center gap-1.5 rounded-lg border p-3 text-sm transition-colors min-h-[44px]",
                        selectedKind === k.kind
                          ? "border-leaf-500 bg-leaf-50 text-leaf-700"
                          : "border-wood-200 bg-surface text-text-secondary hover:bg-cream-50"
                      )}
                      disabled={createMutation.isPending}
                    >
                      <Icon className="h-5 w-5" aria-hidden="true" />
                      <span>{k.label}</span>
                    </button>
                  );
                })}
              </div>
            </fieldset>
          </div>

          <div>
            <label htmlFor="account-name" className="mb-1.5 block text-sm font-medium text-text-secondary">
              Nama akun
            </label>
            <input
              ref={inputRef}
              id="account-name"
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); setError(""); }}
              onKeyDown={handleKeyDown}
              placeholder={selectedMeta?.placeholder}
              maxLength={60}
              disabled={createMutation.isPending}
              className={cn(
                "h-11 min-h-[44px] w-full rounded-md border bg-surface px-3 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-2 focus:outline-offset-2 focus:outline-wood-500 sm:h-10 sm:min-h-0",
                error ? "border-error" : "border-wood-200"
              )}
              aria-invalid={!!error || undefined}
              aria-describedby={error ? "account-name-error" : undefined}
            />
            {error && (
              <p id="account-name-error" className="mt-1.5 flex items-center gap-1 text-xs text-error" role="alert">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {error}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="account-code" className="mb-1.5 block text-sm font-medium text-text-secondary">Kode akun</label>
            <input
              id="account-code"
              type="text"
              value={isRangeExhausted ? "Penuh — tidak ada kode tersedia" : `${nextCode} - ${selectedMeta?.label || selectedKind}`}
              readOnly
              className={cn(
                "h-11 min-h-[44px] w-full rounded-md border bg-cream-100 px-3 text-sm sm:h-10 sm:min-h-0",
                isRangeExhausted ? "border-error text-error" : "border-wood-200 text-text-tertiary"
              )}
            />
          </div>

          <div className="rounded-lg bg-cream-100 px-4 py-3 text-xs text-text-tertiary">
            Akun baru akan muncul di tab Kas & Bank dan dropdown transaksi.
          </div>
        </div>
      </ModalContent>
      <ModalFooter>
        <Button variant="ghost" onClick={onClose} disabled={createMutation.isPending}>
          Batal
        </Button>
        <Button onClick={handleSubmit} loading={createMutation.isPending} disabled={createMutation.isPending}>
          Simpan
        </Button>
      </ModalFooter>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/*  Edit Modal                                                         */
/* ------------------------------------------------------------------ */

interface EditAccountModalProps {
  readonly open: boolean;
  readonly account: Account | null;
  readonly onClose: () => void;
  readonly onSuccess: () => void;
}

function EditAccountModal({ open, account, onClose, onSuccess }: EditAccountModalProps) {
  const queryClient = useQueryClient();
  const { data: orgData } = useOrganization();
  const [name, setName] = useState(account?.name || "");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // State is initialized from props and reset by key remounting.
  // Focus is handled via a separate effect that only runs on mount.
  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(timer);
    }
  }, [open]);

  const updateMutation = useMutation({
    mutationFn: async (newName: string) => {
      if (!account?.id) throw new Error("Akun tidak ditemukan");
      const trimmed = newName.trim();
      if (!trimmed) throw new Error("Nama akun wajib diisi");
      if (trimmed.length > 60) throw new Error("Nama akun maksimal 60 karakter");
      return updateAccountName(account.id, trimmed);
    },
    onSuccess: (data) => {
      queryClient.setQueryData(
        queryKeys.accounts.fullList(orgData?.organization?.id ?? ""),
        (old: Account[] | undefined) => {
          if (!old) return old;
          return old.map((a) => (a.id === data.id ? { ...a, name: data.name } : a));
        }
      );
      toast.success("Nama akun berhasil diperbarui");
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts.all(orgData?.organization?.id ?? "") });
      onSuccess();
      onClose();
    },
    onError: (err: Error) => {
      setError(err.message);
      toast.error(err.message || "Gagal memperbarui nama akun");
    },
  });

  const handleSubmit = () => {
    setError("");
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Nama akun wajib diisi");
      return;
    }
    if (trimmed.length > 60) {
      setError("Nama akun maksimal 60 karakter");
      return;
    }
    updateMutation.mutate(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !updateMutation.isPending) {
      e.preventDefault();
      handleSubmit();
    }
  };

  if (!account) return null;

  const typeInfo = ACCOUNT_TYPE_LABELS[account.account_type];

  return (
    <Modal open={open} onClose={updateMutation.isPending ? () => {} : onClose} title="Edit Nama Akun" size="md">
      <ModalContent>
        <div className="space-y-4">
          <div>
            <label htmlFor="edit-name" className="mb-1.5 block text-sm font-medium text-text-secondary">
              Nama akun
            </label>
            <input
              ref={inputRef}
              id="edit-name"
              type="text"
              value={name}
              onChange={(e) => { setName(e.target.value); setError(""); }}
              onKeyDown={handleKeyDown}
              maxLength={60}
              disabled={updateMutation.isPending}
              className={cn(
                "h-11 min-h-[44px] w-full rounded-md border bg-surface px-3 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-2 focus:outline-offset-2 focus:outline-wood-500 sm:h-10 sm:min-h-0",
                error ? "border-error" : "border-wood-200"
              )}
              aria-invalid={!!error || undefined}
              aria-describedby={error ? "edit-name-error" : undefined}
            />
            {error && (
              <p id="edit-name-error" className="mt-1.5 flex items-center gap-1 text-xs text-error" role="alert">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {error}
              </p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="edit-code" className="mb-1.5 block text-sm font-medium text-text-secondary">Kode akun</label>
              <input
                id="edit-code"
                type="text"
                value={account.code}
                readOnly
                className="h-11 min-h-[44px] w-full rounded-md border border-wood-200 bg-cream-100 px-3 text-sm text-text-tertiary sm:h-10 sm:min-h-0"
              />
            </div>
            <div>
              <label htmlFor="edit-type" className="mb-1.5 block text-sm font-medium text-text-secondary">Jenis akun</label>
              <input
                id="edit-type"
                type="text"
                value={typeInfo?.label || account.account_type}
                readOnly
                className="h-11 min-h-[44px] w-full rounded-md border border-wood-200 bg-cream-100 px-3 text-sm text-text-tertiary sm:h-10 sm:min-h-0"
              />
            </div>
          </div>

          <div className="rounded-lg bg-cream-100 px-4 py-3 text-xs text-text-tertiary">
            {account.is_system
              ? "Anda dapat mengubah nama tampilan. Kode dan kategori akun bawaan tidak dapat diubah."
              : "Mengubah nama akun tidak mengubah kode akun atau riwayat transaksi."}
          </div>
        </div>
      </ModalContent>
      <ModalFooter>
        <Button variant="ghost" onClick={onClose} disabled={updateMutation.isPending}>
          Batal
        </Button>
        <Button onClick={handleSubmit} loading={updateMutation.isPending} disabled={updateMutation.isPending}>
          Simpan
        </Button>
      </ModalFooter>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/*  Cash & Bank Card                                                   */
/* ------------------------------------------------------------------ */

interface CashBankCardProps {
  readonly account: Account;
  readonly onEdit: (account: Account) => void;
  readonly canEdit: boolean;
}

function CashBankCard({ account, onEdit, canEdit }: CashBankCardProps) {
  const kind = getCashBankKind(account);
  const meta = CASH_BANK_META[kind];
  const Icon = meta.icon;

  return (
    <div className="rounded-xl border border-wood-200 bg-surface-elevated p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", meta.bgClass, meta.iconClass)}>
            <Icon className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h3 className="break-words text-sm font-semibold text-text-primary">{account.name}</h3>
            <p className="mt-0.5 text-xs text-text-tertiary">
              {meta.label} · Kode {account.code}
            </p>
          </div>
        </div>
        {canEdit && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onEdit(account)}
            aria-label={`Edit nama akun ${account.name}`}
            className="h-11 w-11 shrink-0 text-wood-500 hover:text-wood-700 sm:h-10 sm:w-10"
          >
            <Edit2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <AccountStatusBadge account={account} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Accounts Table (for Semua Akun tab)                                */
/* ------------------------------------------------------------------ */

interface AccountsTableProps {
  readonly accounts: Account[];
  readonly onEdit: (account: Account) => void;
  readonly canEdit: boolean;
}

function AccountsTable({ accounts, onEdit, canEdit }: AccountsTableProps) {
  const grouped = ACCOUNT_TYPE_GROUPS.map((group) => ({
    ...group,
    accounts: accounts.filter((a) => a.account_type === group.type),
  })).filter((group) => group.accounts.length > 0);

  const [expandedTypes, setExpandedTypes] = useState<string[]>(() => grouped.map((g) => g.type));

  const toggleType = (type: string) => {
    setExpandedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  return (
    <div className="space-y-4">
      {grouped.map((group) => {
        const isExpanded = expandedTypes.includes(group.type);

        return (
          <section
            key={group.type}
            className="overflow-hidden rounded-xl border border-wood-200 bg-surface-elevated"
          >
            <button               type="button"
              onClick={() => toggleType(group.type)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-cream-50 sm:px-5 sm:py-4 min-h-[44px]"
              aria-expanded={isExpanded}
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 shrink-0 text-wood-500" aria-hidden="true" />
              ) : (
                <ChevronRight className="h-4 w-4 shrink-0 text-wood-500" aria-hidden="true" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-semibold text-text-primary sm:text-lg">{group.label}</h2>
                  <span className="rounded-full border border-wood-200 bg-cream-50 px-2 py-0.5 text-xs text-text-tertiary">
                    {group.accounts.length}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-text-tertiary sm:text-sm">{group.description}</p>
              </div>
            </button>

            {isExpanded && (
              <div className="border-t border-wood-100">
                {/* Desktop table */}
                <div className="hidden sm:block">
                  {group.accounts.map((account) => (
                    <div
                      key={account.id}
                      className="grid grid-cols-[80px_minmax(0,1fr)_100px_120px] items-center gap-4 border-t border-wood-100 px-5 py-3 first:border-t-0"
                    >
                      <div className="font-mono text-sm text-text-tertiary">{account.code}</div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate font-medium text-text-primary">{account.name}</span>
                          {account.is_cash_account && (
                            <Badge variant="success" size="sm">Kas/Bank</Badge>
                          )}
                        </div>
                      </div>
                      <AccountStatusBadge account={account} />

                      <div className="flex justify-end">
                        {canEdit ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => onEdit(account)}
                            aria-label={`Edit nama akun ${account.name}`}
                          >
                            <Edit2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
                            Edit
                          </Button>
                        ) : (
                          <span className="text-xs text-text-tertiary">Terkunci</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Mobile cards */}
                <div className="sm:hidden divide-y divide-wood-100">
                  {group.accounts.map((account) => (
                    <div key={account.id} className="px-4 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs text-text-tertiary">{account.code}</span>
                            <AccountStatusBadge account={account} />
                          </div>
                          <p className="mt-1 truncate text-sm font-medium text-text-primary">{account.name}</p>
                        </div>
                        {canEdit && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => onEdit(account)}
                            aria-label={`Edit nama akun ${account.name}`}
                            className="h-11 w-11 shrink-0 sm:h-10 sm:w-10"
                          >
                            <Edit2 className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

export function AccountsPage() {
  const { data: orgData } = useOrganization();
  const { canManageAccounts, canCreateExports } = useOrgPermissions();
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("cashbank");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [editAccount, setEditAccount] = useState<Account | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchLabelId = useId();
  const tablistLabelId = useId();

  const { data: accounts, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.accounts.fullList(orgData?.organization?.id ?? ""),
    queryFn: async () => {
      if (!orgData?.organization?.id) return [];
      return listAccounts();
    },
    enabled: !!orgData?.organization?.id,
  });

  // Counts — derived from the full unfiltered dataset
  const allAccounts = useMemo(() => accounts || [], [accounts]);
  const cashBankCount = useMemo(
    () => allAccounts.filter((a) => a.is_cash_account || [1110, 1120, 1130, 1121, 1122, 1123].includes(a.code)).length,
    [allAccounts],
  );
  const totalCount = allAccounts.length;

  // Filtered list for display
  const filteredAccounts = useMemo(() => {
    return allAccounts.filter((a) => {
      if (!accountMatchesSearch(a, search)) return false;
      if (activeTab === "all" && typeFilter !== "all" && a.account_type !== typeFilter) return false;
      return true;
    });
  }, [allAccounts, search, activeTab, typeFilter]);

  const cashBankAccounts = useMemo(
    () => filteredAccounts.filter((a) => a.is_cash_account || [1110, 1120, 1130, 1121, 1122, 1123].includes(a.code)),
    [filteredAccounts],
  );

  const hasSearch = search.trim().length > 0;
  const cashBankEmpty = !isLoading && cashBankAccounts.length === 0;
  const allEmpty = !isLoading && filteredAccounts.length === 0;
  const isCashBankEmpty = !isLoading && allAccounts.length > 0 && cashBankCount === 0;

  const handleClearSearch = useCallback(() => {
    setSearch("");
    searchInputRef.current?.focus();
  }, []);

  const handleExport = useCallback(async () => {
    if (!canCreateExports || isExporting) return;
    setIsExporting(true);
    try {
      await exportAccountsCsv();
      toast.success("Ekspor akun ke CSV dimulai");
    } catch {
      toast.error("Akun belum berhasil diekspor. Coba lagi.");
    } finally {
      setIsExporting(false);
    }
  }, [canCreateExports, isExporting]);

  const handleEdit = useCallback((account: Account) => {
    setEditAccount(account);
    setEditModalOpen(true);
  }, []);

  const handleTabChange = useCallback((tab: Tab) => {
    setActiveTab(tab);
    setTypeFilter("all");
  }, []);

  // ── Error state ──
  if (error) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Akun</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Kelola kas, bank, dan akun pembukuan bisnis Anda.
          </p>
        </div>
        <ErrorState
          error={error}
          message="Periksa koneksi Anda, lalu coba lagi."
          onRetry={() => { refetch(); }}
        />
      </div>
    );
  }

  // ── Loading state ──
  if (isLoading) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Akun</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Kelola kas, bank, dan akun pembukuan bisnis Anda.
          </p>
        </div>
        {/* Toolbar skeleton */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-2">
            <Skeleton className="h-10 w-28 rounded-md" />
            <Skeleton className="h-10 w-28 rounded-md" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-10 w-28 rounded-md" />
            <Skeleton className="h-10 w-32 rounded-md" />
          </div>
        </div>
        <Skeleton className="h-11 w-full rounded-lg" />
        {/* Tab skeleton */}
        <div className="flex gap-1 rounded-lg border border-wood-200 bg-cream-100 p-1">
          <Skeleton className="h-10 flex-1 rounded-md" />
          <Skeleton className="h-10 flex-1 rounded-md" />
        </div>
        {/* Card skeletons */}
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => `sk-${i}`).map((key) => (
            <Skeleton key={key} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const tabIds = { cashbank: "tab-cashbank", all: "tab-all" } as const;
  const panelIds = { cashbank: "panel-cashbank", all: "panel-all" } as const;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Akun</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Kelola kas, bank, dan akun pembukuan bisnis Anda.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canCreateExports && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => { handleExport(); }}
              disabled={!allAccounts.length || isExporting}
              className="hidden sm:inline-flex"
              aria-busy={isExporting || undefined}
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              {isExporting ? "Mengekspor..." : "Ekspor CSV"}
            </Button>
          )}
          {canCreateExports && (
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => { handleExport(); }}
              disabled={!allAccounts.length || isExporting}
              className="sm:hidden min-h-[44px] min-w-[44px]"
              aria-label={isExporting ? "Mengekspor akun ke CSV" : "Ekspor akun ke CSV"}
              aria-busy={isExporting || undefined}
            >
              <Download className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
          {canManageAccounts && activeTab === "cashbank" && (
            <Button
              type="button"
              onClick={() => setAddModalOpen(true)}
              className="min-h-[44px]"
            >
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
              Tambah Kas/Bank
            </Button>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <label htmlFor="account-search" className="sr-only" id={searchLabelId}>
          Cari akun
        </label>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-wood-400" aria-hidden="true" />
        <input
          ref={searchInputRef}
          id="account-search"
          type="text"
          placeholder="Cari nama atau kode akun..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-labelledby={searchLabelId}
          aria-describedby={hasSearch ? "search-results-count" : undefined}
          className="h-11 min-h-[44px] w-full rounded-lg border border-wood-200 bg-surface pl-10 pr-14 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-2 focus:outline-offset-2 focus:outline-wood-500 sm:h-10 sm:min-h-0"
        />
        {hasSearch && (
          <button             type="button"
            onClick={handleClearSearch}
            className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-1 text-wood-400 hover:bg-cream-200 hover:text-wood-600 min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Hapus pencarian"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Tabs — proper tablist semantics */}
      <div
        role="tablist"
        aria-labelledby={tablistLabelId}
        className="flex gap-1 rounded-lg border border-wood-200 bg-cream-100 p-1"
      >
        <span id={tablistLabelId} className="sr-only">Tampilan akun</span>
        <button
          id={tabIds.cashbank}
          type="button"
          role="tab"
          aria-selected={activeTab === "cashbank"}
          aria-controls={panelIds.cashbank}
          onClick={() => handleTabChange("cashbank")}
          className={cn(
            "flex-1 rounded-md px-4 py-2.5 min-h-[44px] text-sm font-medium transition-colors",
            activeTab === "cashbank"
              ? "bg-surface-elevated text-text-primary shadow-sm"
              : "text-text-secondary hover:text-text-primary"
          )}
        >
          Kas &amp; Bank{totalCount > 0 ? ` (${cashBankCount})` : ""}
        </button>
        <button
          id={tabIds.all}
          type="button"
          role="tab"
          aria-selected={activeTab === "all"}
          aria-controls={panelIds.all}
          onClick={() => handleTabChange("all")}
          className={cn(
            "flex-1 rounded-md px-4 py-2.5 min-h-[44px] text-sm font-medium transition-colors",
            activeTab === "all"
              ? "bg-surface-elevated text-text-primary shadow-sm"
              : "text-text-secondary hover:text-text-primary"
          )}
        >
          Semua akun{totalCount > 0 ? ` (${totalCount})` : ""}
        </button>
      </div>

      {/* Type filter — only for "Semua akun" tab */}
      {activeTab === "all" && (
        <fieldset className="flex flex-wrap gap-2 border-0 p-0 m-0">
          <Button
            type="button"
            variant={typeFilter === "all" ? "primary" : "outline"}
            size="sm"
            onClick={() => setTypeFilter("all")}
            className="min-h-[36px]"
          >
            Semua
          </Button>
          {ACCOUNT_TYPE_GROUPS.filter((g) => allAccounts.some((a) => a.account_type === g.type)).map((group) => (
            <Button
              key={group.type}
              type="button"
              variant={typeFilter === group.type ? "primary" : "outline"}
              size="sm"
              onClick={() => setTypeFilter(group.type)}
              className="min-h-[36px]"
            >
              {group.label}
            </Button>
          ))}
        </fieldset>
      )}

      {/* Search result feedback */}
      {hasSearch && !isLoading && (
        <p id="search-results-count" className="text-sm text-text-secondary" aria-live="polite">
          {(() => {
            const count = activeTab === "cashbank" ? cashBankAccounts.length : filteredAccounts.length;
            return count === 0 ? "Tidak ada akun ditemukan" : `${count} akun ditemukan`;
          })()}
        </p>
      )}

      {/* Kas & Bank panel */}
      <div
        id={panelIds.cashbank}
        role="tabpanel"
        aria-labelledby={tabIds.cashbank}
        hidden={activeTab !== "cashbank"}
      >
        {activeTab === "cashbank" && (() => {
          if (cashBankEmpty && hasSearch) {
            return (
              <EmptyState icon={<Search className="h-7 w-7 text-wood-400" aria-hidden="true" />}
                title="Akun tidak ditemukan"
                description={`Tidak ada akun yang cocok dengan "${search}".`}
                action={<Button type="button" variant="outline" size="sm" onClick={handleClearSearch}>Hapus pencarian</Button>} />
            );
          }
          if (cashBankEmpty && isCashBankEmpty) {
            const addAction = canManageAccounts ? <Button type="button" onClick={() => setAddModalOpen(true)}><Plus className="mr-2 h-4 w-4" aria-hidden="true" />Tambah Kas/Bank</Button> : undefined;
            return (
              <EmptyState icon={<Wallet className="h-7 w-7 text-wood-400" aria-hidden="true" />}
                title="Belum ada akun kas atau bank"
                description="Tambahkan tempat penyimpanan uang bisnis Anda."
                action={addAction} />
            );
          }
          return (
            <div className="grid gap-4 sm:grid-cols-2">
              {cashBankAccounts.map((account) => (
                <CashBankCard
                  key={account.id}
                  account={account}
                  onEdit={handleEdit}
                  canEdit={canManageAccounts}
                />
              ))}
            </div>
          );
        })()}
      </div>

      {/* Semua akun panel */}
      <div
        id={panelIds.all}
        role="tabpanel"
        aria-labelledby={tabIds.all}
        hidden={activeTab !== "all"}
      >
        {activeTab === "all" && (() => {
          if (allEmpty && hasSearch) {
            return (
              <EmptyState icon={<Search className="h-7 w-7 text-wood-400" aria-hidden="true" />}
                title="Akun tidak ditemukan"
                description={`Tidak ada akun yang cocok dengan "${search}".`}
                action={<Button type="button" variant="outline" size="sm" onClick={handleClearSearch}>Hapus pencarian</Button>} />
            );
          }
          if (allEmpty && typeFilter !== "all") {
            return (
              <EmptyState icon={<BookOpen className="h-7 w-7 text-wood-400" aria-hidden="true" />}
                title="Tidak ada akun dalam kategori ini"
                description="Pilih kategori lain atau lihat semua akun."
                action={<Button type="button" variant="outline" size="sm" onClick={() => setTypeFilter("all")}>Lihat semua akun</Button>} />
            );
          }
          return (
            <AccountsTable accounts={filteredAccounts} onEdit={handleEdit} canEdit={canManageAccounts} />
          );
        })()}
      </div>

      {/* Add Cash/Bank Modal */}
      <AddCashBankModal
        key={addModalOpen ? "add-open" : "add-closed"}
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onSuccess={() => {}}
        accounts={allAccounts}
      />

      {/* Edit Modal */}
      <EditAccountModal
        key={editAccount?.id || "edit-closed"}
        open={editModalOpen}
        account={editAccount}
        onClose={() => { setEditModalOpen(false); setEditAccount(null); }}
        onSuccess={() => {}}
      />
    </div>
  );
}


