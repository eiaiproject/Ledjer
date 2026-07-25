import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { formatIDR } from "@/lib/utils";
import { useOrganization } from "@/hooks/useOrganization";
import { listAccounts } from "@/lib/api/accounts";
import { queryKeys } from "@/lib/query-keys";

interface BalanceLine {
  accountId: string;
  amount: number;
}

export default function OpeningBalancePage() {
  const navigate = useNavigate();
  const { data: orgData, isLoading: orgLoading } = useOrganization();
  const orgId = orgData?.organization?.id;
  const queryClient = useQueryClient();

  const { data: status, isLoading: statusLoading } = useQuery({
    queryKey: ["opening-balance", "status", orgId],
    queryFn: () => apiRequest("/api/opening-balance/status"),
    enabled: !!orgId,
  });

  const { data: accounts } = useQuery({
    queryKey: queryKeys.accounts.fullList(orgId!),
    queryFn: () => listAccounts({ active: true }),
    enabled: !!orgId,
  });

  const [lines, setLines] = useState<BalanceLine[]>([]);
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const addLine = () => setLines([...lines, { accountId: "", amount: 0 }]);
  const updateLine = (i: number, field: keyof BalanceLine, value: string | number) => {
    const copy = lines.map((l, j) => (j === i ? { ...l, [field]: value } : l));
    setLines(copy);
  };
  const removeLine = (i: number) => {
    if (lines.length <= 1) return;
    setLines(lines.filter((_, j) => j !== i));
  };

  const previewMutation = useMutation({
    mutationFn: async () => {
      const result = await apiRequest("/api/opening-balance/preview", {
        method: "POST",
        body: JSON.stringify({ lines: lines.filter((l) => l.accountId && l.amount !== 0) }),
      });
      setPreview(result as Record<string, unknown>);
    },
    onError: (err) => setError((err as Error).message),
  });

  const postMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("/api/opening-balance/post", {
        method: "POST",
        body: JSON.stringify({ lines: lines.filter((l) => l.accountId && l.amount !== 0) }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["opening-balance"] });
      navigate("/dashboard");
    },
    onError: (err) => setError((err as Error).message),
  });

  if (orgLoading || statusLoading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const s = status as { hasOpeningBalance?: boolean } | undefined;
  if (s?.hasOpeningBalance) {
    return (
      <div className="p-4">
        <Card>
          <CardContent className="p-6 text-center space-y-3">
            <h1 className="text-lg font-semibold text-wood-800">Saldo Awal Sudah Diposting</h1>
            <p className="text-sm text-wood-500">Saldo awal sudah dicatat. Tidak bisa diposting ulang.</p>
            <Button variant="ghost" onClick={() => navigate("/dashboard")}>Kembali</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const totalDebit = lines.filter((l) => l.amount > 0).reduce((s, l) => s + l.amount, 0);
  const totalCredit = lines.filter((l) => l.amount < 0).reduce((s, l) => s + Math.abs(l.amount), 0);
  const balanced = totalDebit === totalCredit;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <div>
        <h1 className="text-xl font-semibold text-wood-800">Saldo Awal</h1>
        <p className="text-sm text-wood-500">Masukkan saldo awal akun per tanggal mulai pembukuan.</p>
      </div>

      {/* Lines */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-wood-700">Akun</h2>
            <Button variant="ghost" size="sm" onClick={addLine}>+ Tambah Akun</Button>
          </div>

          {lines.length === 0 && (
            <p className="text-xs text-wood-400 py-4 text-center">Belum ada akun. Klik "Tambah Akun" untuk mulai.</p>
          )}

          {lines.map((line, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-end border-b border-wood-100 pb-2">
              <div className="col-span-7">
                <label className="block text-xs text-wood-500 mb-0.5">Akun</label>
                <select
                  className="w-full rounded-md border border-wood-200 bg-white px-3 py-2 text-sm"
                  value={line.accountId}
                  onChange={(e) => updateLine(i, "accountId", e.target.value)}
                >
                  <option value="">Pilih akun...</option>
                  {(accounts ?? []).map((a: { id: string; code: number; name: string }) => (
                    <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-4">
                <label className="block text-xs text-wood-500 mb-0.5">
                  Saldo (positif = debit, negatif = kredit)
                </label>
                <Input
                  type="number"
                  value={line.amount}
                  onChange={(e) => updateLine(i, "amount", parseInt(e.target.value, 10) || 0)}
                />
              </div>
              <div className="col-span-1">
                {lines.length > 1 && (
                  <button type="button" onClick={() => removeLine(i)} className="text-red-500 text-sm mt-5" aria-label="Hapus">×</button>
                )}
              </div>
            </div>
          ))}

          {lines.length > 0 && (
            <div className="text-right text-sm space-y-1 pt-2 border-t border-wood-200">
              <div className={balanced ? "text-emerald-600" : "text-red-600"}>
                {balanced ? "✓ Seimbang" : "✗ Tidak Seimbang"} —
                Debit: {formatIDR(totalDebit * 100)}, Kredit: {formatIDR(totalCredit * 100)}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {error && <ErrorState message={error} />}

      {preview && (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold text-wood-700 mb-2">Preview</h3>
            <pre className="text-xs text-wood-600 whitespace-pre-wrap">{JSON.stringify(preview, null, 2)}</pre>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end gap-3">
        <Button variant="ghost" onClick={() => navigate("/dashboard")}>Batal</Button>
        <Button
          onClick={() => previewMutation.mutate()}
          disabled={lines.length === 0 || !balanced || previewMutation.isPending}
        >
          {previewMutation.isPending ? "..." : "Preview"}
        </Button>
        <Button
          onClick={() => postMutation.mutate()}
          disabled={!balanced || postMutation.isPending}
        >
          {postMutation.isPending ? "Menyimpan..." : "Posting Saldo Awal"}
        </Button>
      </div>
    </div>
  );
}
