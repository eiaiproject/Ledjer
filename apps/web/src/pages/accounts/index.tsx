import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, ChevronDown, ChevronRight, Search } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useOrganization } from "@/hooks/useOrganization";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { PageSpinner } from "@/components/ui/spinner";

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

export function AccountsPage() {
  const { data: orgData } = useOrganization();
  const [search, setSearch] = useState("");
  const [expandedTypes, setExpandedTypes] = useState<string[]>(["asset", "liability", "equity"]);

  const { data: accounts, isLoading, error, refetch } = useQuery({
    queryKey: ["accounts", orgData?.organization?.id],
    queryFn: async () => {
      if (!orgData?.organization?.id) return [];
      const { data, error } = await supabase
        .from("accounts")
        .select("id, code, name, account_type, parent_account_id, is_active, is_cash_account, normal_balance")
        .eq("organization_id", orgData.organization.id)
        .neq("code", 1130) // Hide E-Wallet / QRIS
        .order("code");
      if (error) throw error;
      return data;
    },
    enabled: !!orgData?.organization?.id,
  });

  const toggleType = (type: string) => {
    setExpandedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const filteredAccounts = (accounts || []).filter((a) =>
    !search ||
    a.code.toString().includes(search) ||
    a.name.toLowerCase().includes(search.toLowerCase())
  );

  const accountsByType = ACCOUNT_TYPE_GROUPS.map((group) => ({
    ...group,
    accounts: filteredAccounts.filter((a) => a.account_type === group.type),
  })).filter((group) => group.accounts.length > 0);

  if (error) return <ErrorState error={error} onRetry={refetch} />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-wood-800">Bagan Akun</h1>
        <p className="text-sm text-wood-500 mt-1">Struktur akun pembukuan bisnis Anda</p>
      </div>

      <Input
        placeholder="Cari kode atau nama akun..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        leftIcon={<Search className="h-4 w-4" />}
      />

      {isLoading ? (
        <PageSpinner />
      ) : accountsByType.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="h-8 w-8 text-wood-400" />}
          title="Belum ada akun"
          description="Akun akan dibuat otomatis saat organisasi dibuat"
        />
      ) : (
        <div className="space-y-4">
          {accountsByType.map((group) => {
            const isExpanded = expandedTypes.includes(group.type);
            const typeInfo = ACCOUNT_TYPE_LABELS[group.type];

            return (
              <Card key={group.type}>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => toggleType(group.type)}
                  className="h-auto w-full justify-between rounded-xl px-5 py-4 hover:bg-cream-100/50"
                >
                  <div className="flex items-center gap-3">
                    {isExpanded ? (
                      <ChevronDown className="h-5 w-5 text-wood-400" />
                    ) : (
                      <ChevronRight className="h-5 w-5 text-wood-400" />
                    )}
                    <div className="text-left">
                      <div className="flex items-center gap-2">
                        <h2 className="font-semibold text-wood-800">{group.label}</h2>
                        <Badge variant={typeInfo.color}>{group.accounts.length}</Badge>
                      </div>
                      <p className="text-xs text-wood-400 mt-0.5">{group.description}</p>
                    </div>
                  </div>
                </Button>

                {isExpanded && (
                  <div className="border-t border-wood-100">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-wood-50">
                          <th className="px-5 py-2 text-left font-medium text-wood-500 text-xs">Kode</th>
                          <th className="px-5 py-2 text-left font-medium text-wood-500 text-xs">Nama Akun</th>
                          <th className="px-5 py-2 text-center font-medium text-wood-500 text-xs">Saldo Normal</th>
                          <th className="px-5 py-2 text-center font-medium text-wood-500 text-xs">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.accounts.map((account) => (
                          <tr key={account.id} className="border-b border-wood-50 last:border-0 hover:bg-cream-100/30">
                            <td className="px-5 py-3 font-mono text-wood-600">{account.code}</td>
                            <td className="px-5 py-3">
                              <span className="text-wood-800">{account.name}</span>
                              {account.is_cash_account && (
                                <Badge variant="success" className="ml-2">Kas</Badge>
                              )}
                            </td>
                            <td className="px-5 py-3 text-center text-xs text-wood-500 capitalize">
                              {account.normal_balance === "debit" ? "Debit" : "Kredit"}
                            </td>
                            <td className="px-5 py-3 text-center">
                              <Badge variant={account.is_active ? "success" : "neutral"}>
                                {account.is_active ? "Aktif" : "Nonaktif"}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
