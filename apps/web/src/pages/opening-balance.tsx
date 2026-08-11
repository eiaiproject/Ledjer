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
import { CheckCircle, Check, X } from "reicon-react";
import { PageShell } from "@/components/ui/page-shell";
import { PageGuide } from "@/components/ui/page-guide";
import { FieldHelp } from "@/components/ui/help-tooltip";

interface BalanceLine {
  accountId: string;
  amount: number;
}

interface OpeningBalanceSnapshot {
  journalEntryId: string;
  entryNumber: string;
  postedAt: number;
  date: string;
  totalDebit: number;
  totalCredit: number;
  accounts: {
    accountId: string;
    accountCode: string;
    accountName: string;
    accountType: string;
    debit: number;
    credit: number;
  }[];
}

interface PostResult {
  journalEntryId: string;
  totalDebit: number;
  totalCredit: number;
  snapshot: OpeningBalanceSnapshot;
}

type WizardStep = "accounts" | "preview" | "success";

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

  // Wizard state
  const [step, setStep] = useState<WizardStep>("accounts");
  const [lines, setLines] = useState<BalanceLine[]>([]);
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  const [postResult, setPostResult] = useState<PostResult | null>(null);
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
    onSuccess: () => setStep("preview"),
    onError: (err) => setError((err as Error).message),
  });

  const postMutation = useMutation({
    mutationFn: async () => {
      const result = await apiRequest("/api/opening-balance/post", {
        method: "POST",
        body: JSON.stringify({ lines: lines.filter((l) => l.accountId && l.amount !== 0) }),
      });
      return result as PostResult;
    },
    onSuccess: (data) => {
      setPostResult(data);
      setStep("success");
      queryClient.invalidateQueries({ queryKey: ["opening-balance"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(orgId!) });
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

  const STEPS = ["accounts", "preview", "success"] as const;
  const stepIndex = STEPS.indexOf(step);

  return (
    <PageShell
      header={{
        title: "Saldo Awal",
        description: "Masukkan saldo awal akun per tanggal mulai pembukuan.",
      }}
    >

      {/* Panduan halaman */}
      <PageGuide guideKey="opening-balance" />

      {/* Wizard Steps indicator */}
      <div className="flex items-center justify-center gap-2.5" aria-label={`Langkah ${stepIndex + 1} dari 3`}>
        {STEPS.map((s, idx) => (
          <div key={s} className="flex items-center gap-2.5">
            <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium transition-colors duration-200 ${
              idx <= stepIndex
                ? "bg-leaf-500 text-white"
                : "bg-wood-100 text-wood-500"
            }`} aria-current={step === s ? "step" : undefined}>
              {idx < stepIndex ? (
                <CheckCircle className="h-3.5 w-3.5" />
              ) : (
                idx + 1
              )}
            </div>
            {idx < STEPS.length - 1 && (
              <div className={`h-0.5 w-10 transition-colors duration-200 ${idx < stepIndex ? "bg-leaf-500" : "bg-wood-200"}`} />
            )}
          </div>
        ))}
      </div>

      {/* Step 1: Account Selection */}
      {step === "accounts" && (
        <>
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-wood-700">Pilih Akun & Masukkan Saldo</h2>
                <Button variant="ghost" size="sm" onClick={addLine}>+ Tambah Akun</Button>
              </div>
              <FieldHelp topic="opening_balance_guide" label="Aset = debit (positif), utang & modal = kredit (negatif)" />

              {lines.length === 0 && (
                <p className="text-xs text-wood-500 py-4 text-center">Belum ada akun. Klik "Tambah Akun" untuk mulai.</p>
              )}

              {lines.map((line, i) => (
                <div key={line.accountId} className="grid grid-cols-12 gap-2 items-end border-b border-wood-100 pb-2">
                  <div className="col-span-7">
                    <label htmlFor={`obal-line-${i}-account`} className="block text-xs text-wood-500 mb-0.5">Akun</label>
                    <select
                      id={`obal-line-${i}-account`}
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
                    <label htmlFor={`obal-line-${i}-amount`} className="block text-xs text-wood-500 mb-0.5">
                      Saldo (positif=debit, negatif=kredit)
                    </label>
                    <Input
                      id={`obal-line-${i}-amount`}
                      isCurrency
                      value={line.amount}
                      onChange={(e) => updateLine(i, "amount", Number.parseInt(e.target.value, 10) || 0)}
                    />
                  </div>
                  <div className="col-span-1">
                    {lines.length > 1 && (
                      <button type="button" onClick={() => removeLine(i)} className="text-error text-sm mt-5" aria-label="Hapus">×</button>
                    )}
                  </div>
                </div>
              ))}

              {lines.length > 0 && (
                <div className="text-right text-sm space-y-1 pt-2 border-t border-wood-200">
                  <div className={balanced ? "text-leaf-600" : "text-error"}>
                    {balanced ? (
                      <span className="inline-flex items-center gap-1">
                        <Check className="h-4 w-4" /> Seimbang
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1">
                        <X className="h-4 w-4" /> Tidak Seimbang
                      </span>
                    )} —
                    Debit: {formatIDR(totalDebit)}, Kredit: {formatIDR(totalCredit)}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {error && <ErrorState message={error} />}

          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => navigate("/dashboard")}>Batal</Button>
            <Button
              onClick={() => previewMutation.mutate()}
              disabled={lines.length === 0 || !balanced || previewMutation.isPending}
            >
              {previewMutation.isPending ? "Memeriksa..." : "Lihat Preview"}
            </Button>
          </div>
        </>
      )}

      {/* Step 2: Preview */}
      {step === "preview" && preview && (
        <>
          <Card>
            <CardContent className="space-y-3 p-4">
              <h2 className="text-sm font-semibold text-wood-700">Preview Jurnal</h2>
              <p className="text-xs text-wood-500">Periksa debit dan kredit setiap akun sebelum diposting.</p>

              {(preview.lines as { accountName: string; accountCode: string; debit: number; credit: number }[])?.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-wood-200">
                        <th className="text-left py-2 pr-4 font-medium text-wood-600">Akun</th>
                        <th className="text-right py-2 pr-4 font-medium text-wood-600">Debit</th>
                        <th className="text-right py-2 font-medium text-wood-600">Kredit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(preview.lines as { accountName: string; accountCode: string; debit: number; credit: number }[]).map((line: { accountName: string; accountCode: string; debit: number; credit: number }) => (
                        <tr key={line.accountCode} className="border-b border-wood-100">
                          <td className="py-2 pr-4 text-wood-800">
                            <span className="text-wood-500 text-xs">{line.accountCode}</span>{' '}
                            {line.accountName}
                          </td>
                          <td className="py-2 pr-4 text-right text-wood-800">{line.debit > 0 ? formatIDR(line.debit) : "-"}</td>
                          <td className="py-2 text-right text-wood-800">{line.credit > 0 ? formatIDR(line.credit) : "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-wood-400 font-semibold">
                        <td className="py-2 pr-4 text-wood-800">Total</td>
                        <td className="py-2 pr-4 text-right text-wood-800">{formatIDR(preview.totalDebit as number)}</td>
                        <td className="py-2 text-right text-wood-800">{formatIDR(preview.totalCredit as number)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {preview.valid ? (
                <div className="flex items-center gap-2 text-sm text-leaf-700 bg-success-bg rounded-md px-3 py-2">
                  <CheckCircle className="h-4 w-4" />
                  <span>Jurnal seimbang — siap diposting</span>
                </div>
              ) : (
                <div className="text-sm text-error bg-error-bg rounded-md px-3 py-2">
                  {(preview.errors as string[])?.join("; ")}
                </div>
              )}
            </CardContent>
          </Card>

          {error && <ErrorState message={error} />}

          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setStep("accounts")}>Kembali</Button>
            <Button
              onClick={() => postMutation.mutate()}
              disabled={!preview.valid || postMutation.isPending}
            >
              {postMutation.isPending ? "Menyimpan..." : "Posting Saldo Awal"}
            </Button>
          </div>
        </>
      )}

      {/* Step 3: Success */}
      {step === "success" && postResult && (
        <Card>
          <CardContent className="p-6 text-center space-y-4">
            <div className="flex justify-center">
              <div className="h-12 w-12 rounded-full bg-leaf-100 flex items-center justify-center">
                <CheckCircle className="h-6 w-6 text-leaf-600" />
              </div>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-wood-800">Saldo Awal Berhasil Diposting!</h2>
              <p className="text-sm text-wood-500">
                Jurnal {postResult.snapshot.entryNumber} — {postResult.snapshot.accounts.length} akun
              </p>
            </div>

            {/* Snapshot summary */}
            <div className="rounded-lg border border-wood-200 bg-cream-50 p-4 text-left">
              <h3 className="text-sm font-semibold text-wood-700 mb-3">Ringkasan Saldo Awal</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-wood-200">
                      <th className="text-left py-1.5 pr-3 font-medium text-wood-600">Akun</th>
                      <th className="text-right py-1.5 pr-3 font-medium text-wood-600">Debit</th>
                      <th className="text-right py-1.5 font-medium text-wood-600">Kredit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {postResult.snapshot.accounts.map((acct) => (
                      <tr key={acct.accountCode} className="border-b border-wood-100">
                        <td className="py-1.5 pr-3 text-wood-800">
                          <span className="text-wood-500 text-xs">{acct.accountCode}</span>{' '}
                          {acct.accountName}
                        </td>
                        <td className="py-1.5 pr-3 text-right text-wood-800">{acct.debit > 0 ? formatIDR(acct.debit) : "-"}</td>
                        <td className="py-1.5 text-right text-wood-800">{acct.credit > 0 ? formatIDR(acct.credit) : "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-wood-400 font-semibold">
                      <td className="py-1.5 pr-3 text-wood-800">Total</td>
                      <td className="py-1.5 pr-3 text-right text-wood-800">{formatIDR(postResult.snapshot.totalDebit)}</td>
                      <td className="py-1.5 text-right text-wood-800">{formatIDR(postResult.snapshot.totalCredit)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            <div className="flex justify-center gap-3 pt-2">
              <Button onClick={() => navigate("/dashboard")}>Ke Dashboard</Button>
              <Button variant="ghost" onClick={() => navigate("/reports/balance-sheet")}>
                Lihat Neraca
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}
