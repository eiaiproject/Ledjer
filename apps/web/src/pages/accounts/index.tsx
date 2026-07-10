import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  ChevronDown,
  ChevronRight,
  Edit2,
  Search,
  Wallet,
  Landmark,
  CreditCard,
  AlertCircle,
  QrCode,
  Plus,
  Download,
} from "lucide-react";
import { useOrganization, useOrgPermissions } from "@/hooks/useOrganization";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { PageSpinner } from "@/components/ui/spinner";
import { Modal, ModalContent, ModalFooter } from "@/components/ui/modal";
import { toast } from "@/components/ui/toast";
import { translateError } from "@/lib/errors";
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

/** Determine cash/bank kind from account code + name */
function getCashBankKind(account: { code: number; name: string; is_cash_account: boolean }): CashBankKind {
  // Code-based detection (most reliable)
  if (account.code >= 1110 && account.code < 1120) return "cash";
  if (account.code >= 1120 && account.code < 1130) return "bank";
  if (account.code >= 1130 && account.code < 1140) return "ewallet";

  // Name-based fallback
  const name = account.name.toLowerCase();
  if (/qris|qr/i.test(name)) return "qris";
  if (/bank|bca|bri|bni|mandiri|cimb|permata|danamon|mega|btn|bsi|ocbc|uob|maybank|panin|digibank|jago|blu|neobank|marl/i.test(name)) return "bank";
  if (/ovo|dana|gopay|shopeepay|linkaja|isaku|cash|kas|dompet/i.test(name)) return "cash";
  if (/e-?wallet|dompet digital/i.test(name)) return "ewallet";

  // Fallback to is_cash_account flag
  return account.is_cash_account ? "cash" : "bank";
}

/** Cash/Bank kind metadata for add account modal */
const CASH_BANK_KINDS: { kind: CashBankKind; label: string; icon: typeof Wallet; placeholder: string }[] = [
  { kind: "cash", label: "Kas", icon: Wallet, placeholder: "Kas Toko" },
  { kind: "bank", label: "Bank", icon: Landmark, placeholder: "BCA / Mandiri / BRI" },
  { kind: "qris", label: "QRIS", icon: QrCode, placeholder: "QRIS BRI" },
  { kind: "ewallet", label: "E-wallet", icon: CreditCard, placeholder: "GoPay / ShopeePay" },
];

/** Generate next account code for a given kind */
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
      // QRIS and e-wallet go in 1130-1139 range
      minCode = 1130;
      maxCode = 1139;
      break;
    default:
      minCode = 1190;
      maxCode = 1199;
  }

  // Find existing codes in this range
  const usedCodes = existingAccounts
    .map((a) => a.code)
    .filter((c) => c >= minCode && c <= maxCode)
    .sort((a, b) => a - b);

  // Find first available code
  let nextCode = minCode;
  for (const code of usedCodes) {
    if (code > nextCode) break;
    nextCode = code + 1;
  }

  return nextCode <= maxCode ? nextCode : -1; // -1 signals range exhausted
}

const CASH_BANK_META: Record<CashBankKind, { label: string; icon: typeof Wallet; bgClass: string; iconClass: string }> = {
  cash: { label: "Kas", icon: Wallet, bgClass: "bg-leaf-100", iconClass: "text-leaf-600" },
  bank: { label: "Bank", icon: Landmark, bgClass: "bg-leaf-100", iconClass: "text-leaf-600" },
  qris: { label: "QRIS", icon: QrCode, bgClass: "bg-leaf-100", iconClass: "text-leaf-600" },
  ewallet: { label: "E-wallet", icon: CreditCard, bgClass: "bg-leaf-100", iconClass: "text-leaf-600" },
};

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

  // Focus input on mount (modal resets via key prop)
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
          {/* Kind selector */}
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
                      "flex flex-col items-center gap-1.5 rounded-lg border p-3 text-sm transition-colors",
                      selectedKind === k.kind
                        ? "border-leaf-500 bg-leaf-50 text-leaf-700"
                        : "border-wood-200 bg-surface text-text-secondary hover:bg-cream-50"
                    )}
                    disabled={createMutation.isPending}
                  >
                    <Icon className="h-5 w-5" />
                    <span>{k.label}</span>
                  </button>
                );
              })}
            </div>
            </fieldset>
          </div>

          {/* Name input */}
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
                "h-10 min-h-[44px] w-full rounded-md border bg-surface px-3 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-2 focus:outline-offset-2 focus:outline-wood-500 sm:min-h-0",
                error ? "border-error" : "border-wood-200"
              )}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "account-name-error" : undefined}
            />
            {error && (
              <p id="account-name-error" className="mt-1.5 flex items-center gap-1 text-xs text-error" role="alert">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                {error}
              </p>
            )}
          </div>

          {/* Auto-generated code preview */}
          <div>
            <label htmlFor="account-code" className="mb-1.5 block text-sm font-medium text-text-secondary">Kode akun</label>
            <input
              id="account-code"
              type="text"
              value={isRangeExhausted ? "Penuh — tidak ada kode tersedia" : `${nextCode} - ${selectedMeta?.label || selectedKind}`}
              readOnly
              className={cn(
                "h-10 min-h-[44px] w-full rounded-md border bg-cream-100 px-3 text-sm sm:min-h-0",
                isRangeExhausted ? "border-error text-error" : "border-wood-200 text-text-tertiary"
              )}
            />
          </div>

          {/* Info note */}
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
  // Initialize with account name (key prop resets state when account changes)
  const [name, setName] = useState(account?.name || "");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input on mount
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
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
          return old.map((a) =>
            a.id === data.id ? { ...a, name: data.name } : a
          );
        }
      );
      toast.success("Nama akun berhasil diperbarui");
      // Also invalidate to ensure sync with server
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
              maxLength={60}
              disabled={updateMutation.isPending}
              className={cn(
                "h-10 min-h-[44px] w-full rounded-md border bg-surface px-3 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-2 focus:outline-offset-2 focus:outline-wood-500 sm:min-h-0",
                error ? "border-error" : "border-wood-200"
              )}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "account-name-error" : undefined}
            />
            {error && (
              <p id="account-name-error" className="mt-1.5 flex items-center gap-1 text-xs text-error" role="alert">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                {error}
              </p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="edit-account-code" className="mb-1.5 block text-sm font-medium text-text-secondary">Kode akun</label>
              <input
                id="edit-account-code"
                type="text"
                value={account.code}
                readOnly
                className="h-10 min-h-[44px] w-full rounded-md border border-wood-200 bg-cream-100 px-3 text-sm text-text-tertiary sm:min-h-0"
              />
            </div>
            <div>
              <label htmlFor="edit-account-type" className="mb-1.5 block text-sm font-medium text-text-secondary">Jenis akun</label>
              <input
                id="edit-account-type"
                type="text"
                value={typeInfo?.label || account.account_type}
                readOnly
                className="h-10 min-h-[44px] w-full rounded-md border border-wood-200 bg-cream-100 px-3 text-sm text-text-tertiary sm:min-h-0"
              />
            </div>
          </div>

          <div className="rounded-lg bg-cream-100 px-4 py-3 text-xs text-text-tertiary">
            Mengubah nama akun tidak mengubah kode akun atau riwayat transaksi.
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
    <Card className="transition-[border-color,box-shadow] hover:border-wood-300 hover:shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", meta.bgClass, meta.iconClass)}>
              <Icon className="h-5 w-5" />
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
              className="h-9 w-9 shrink-0 text-wood-500 hover:text-wood-700"
            >
              <Edit2 className="h-4 w-4" />
            </Button>
          )}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Badge variant={account.is_active ? "success" : "neutral"}>
            {account.is_active ? "Aktif" : "Nonaktif"}
          </Badge>
          {account.is_system && (
            <span className="rounded-full border border-wood-200 bg-cream-50 px-2 py-0.5 text-xs text-text-tertiary">
              Akun bawaan
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Accounts Table (for All Accounts tab)                              */
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

  const [expandedTypes, setExpandedTypes] = useState<string[]>(["asset", "liability", "equity"]);

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
            <button
              type="button"
              onClick={() => toggleType(group.type)}
              className="flex w-full items-center gap-3 px-5 py-4 text-left hover:bg-cream-50"
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 shrink-0 text-wood-500" />
              ) : (
                <ChevronRight className="h-4 w-4 shrink-0 text-wood-500" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold text-text-primary">{group.label}</h2>
                  <span className="rounded-full border border-wood-200 bg-cream-50 px-2 py-0.5 text-xs text-text-tertiary">
                    {group.accounts.length}
                  </span>
                </div>
                <p className="mt-0.5 text-sm text-text-tertiary">{group.description}</p>
              </div>
            </button>

            {isExpanded && (
              <div className="border-t border-wood-100">
                {group.accounts.map((account) => (
                  <div
                    key={account.id}
                    className="grid grid-cols-1 gap-1 border-t border-wood-100 px-5 py-3 first:border-t-0 sm:grid-cols-[88px_minmax(0,1fr)_auto_auto] sm:items-center sm:gap-4"
                  >
                    <div className="font-mono text-sm text-text-tertiary">{account.code}</div>

                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-medium text-text-primary">{account.name}</span>
                        {account.is_cash_account && (
                          <span className="rounded-full border border-leaf-200 bg-leaf-50 px-2 py-0.5 text-xs text-leaf-700">
                            Kas/Bank
                          </span>
                        )}
                        {account.is_system && (
                          <span className="rounded-full border border-wood-200 bg-cream-50 px-2 py-0.5 text-xs text-text-tertiary">
                            Akun bawaan
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="text-sm text-text-tertiary">
                      {!account.is_active ? (
                        <span className="rounded-full border border-clay-200 bg-clay-50 px-2 py-0.5 text-xs text-clay-700">
                          Nonaktif
                        </span>
                      ) : null}
                    </div>

                    <div className="sm:justify-self-end">
                      {canEdit ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => onEdit(account)}
                          aria-label={`Edit nama akun ${account.name}`}
                        >
                          <Edit2 className="mr-1.5 h-4 w-4" />
                          Edit
                        </Button>
                      ) : (
                        <span className="text-xs text-text-tertiary">Terkunci</span>
                      )}
                    </div>
                  </div>
                ))}
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
  const [editAccount, setEditAccount] = useState<Account | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);

  const { data: accounts, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.accounts.fullList(orgData?.organization?.id ?? ""),
    queryFn: async () => {
      if (!orgData?.organization?.id) return [];
      return listAccounts();
    },
    enabled: !!orgData?.organization?.id,
  });

  const filteredAccounts = (accounts || []).filter((a) =>
    !search ||
    a.code.toString().includes(search) ||
    a.name.toLowerCase().includes(search.toLowerCase())
  );

  const cashBankAccounts = filteredAccounts.filter((a) => a.is_cash_account || [1110, 1120, 1130, 1121, 1122, 1123].includes(a.code));

  const handleEdit = (account: Account) => {
    setEditAccount(account);
    setEditModalOpen(true);
  };

  const handleEditSuccess = () => {
    // Query will auto-refetch due to invalidation in modal
  };

  const handleExport = async () => {
    if (!orgData?.organization?.id) return;
    try {
      await exportAccountsCsv();
      toast.success("Export CSV akun dimulai");
    } catch (err) {
      toast.error(translateError(err));
    }
  };

  if (error) return <ErrorState error={error} onRetry={refetch} />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Akun</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Kelola kas, bank, dan akun pembukuan bisnis Anda.
          </p>
        </div>
        {canManageAccounts && activeTab === "cashbank" && (
          <Button
            type="button"
            onClick={() => setAddModalOpen(true)}
            className="w-full sm:w-auto"
          >
            <Plus className="mr-2 h-4 w-4" />
            Tambah Kas/Bank
          </Button>
        )}
        {canCreateExports && activeTab === "all" && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => void handleExport()}
            className="w-full sm:w-auto"
            disabled={!accounts?.length}
          >
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        )}
      </div>

      {/* Search */}
      <Input
        aria-label="Cari akun"
        placeholder={activeTab === "cashbank" ? "Cari akun kas atau bank..." : "Cari kode atau nama akun..."}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        leftIcon={<Search className="h-4 w-4" />}
      />

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg border border-wood-200 bg-cream-100 p-1">
        <button
          type="button"
          onClick={() => setActiveTab("cashbank")}
          className={cn(
            "flex-1 rounded-md px-4 py-2.5 min-h-[44px] text-sm font-medium transition-colors",
            activeTab === "cashbank"
              ? "bg-surface-elevated text-text-primary shadow-sm"
              : "text-text-secondary hover:text-text-primary"
          )}
          aria-pressed={activeTab === "cashbank"}
        >
          Kas & Bank
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("all")}
          className={cn(
            "flex-1 rounded-md px-4 py-2.5 min-h-[44px] text-sm font-medium transition-colors",
            activeTab === "all"
              ? "bg-surface-elevated text-text-primary shadow-sm"
              : "text-text-secondary hover:text-text-primary"
          )}
          aria-pressed={activeTab === "all"}
        >
          Semua Akun
        </button>
      </div>

      {/* Content */}
      {isLoading ? (
        <PageSpinner />
      ) : (
        <>
          {/* Kas & Bank Tab */}
          {activeTab === "cashbank" && (
            <>
              {cashBankAccounts.length === 0 ? (
                <EmptyState
                  icon={<Wallet className="h-8 w-8 text-wood-400" />}
                  title={search ? "Akun tidak ditemukan" : "Belum ada akun kas/bank"}
                  description={search ? "Coba kata kunci lain." : "Selesaikan onboarding untuk membuat akun kas dan bank."}
                />
              ) : (
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
              )}
            </>
          )}

          {/* Semua Akun Tab */}
          {activeTab === "all" && (
            <>
              {filteredAccounts.length === 0 ? (
                <EmptyState
                  icon={<BookOpen className="h-8 w-8 text-wood-400" />}
                  title={search ? "Akun tidak ditemukan" : "Belum ada akun"}
                  description={search ? "Coba kata kunci lain." : "Selesaikan onboarding untuk membuat bagan akun awal."}
                />
              ) : (
                <AccountsTable
                  accounts={filteredAccounts}
                  onEdit={handleEdit}
                  canEdit={canManageAccounts}
                />
              )}
            </>
          )}
        </>
      )}

      {/* Add Cash/Bank Modal */}
      <AddCashBankModal
        key={addModalOpen ? "add-open" : "add-closed"}
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onSuccess={handleEditSuccess}
        accounts={accounts || []}
      />

      {/* Edit Modal */}
      <EditAccountModal
        key={editAccount?.id || "edit-closed"}
        open={editModalOpen}
        account={editAccount}
        onClose={() => { setEditModalOpen(false); setEditAccount(null); }}
        onSuccess={handleEditSuccess}
      />
    </div>
  );
}
