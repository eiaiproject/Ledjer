import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ErrorState } from "@/components/ui/error-state";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { formatIDR } from "@/lib/utils";
import { useOrganization } from "@/hooks/useOrganization";
import { listAccounts } from "@/lib/api/accounts";
import { queryKeys } from "@/lib/query-keys";
import { CheckCircle, AlertTriangle } from "reicon-react";

/* Tab: Import statement */
interface ImportResult {
  id: string;
  importedLines: number;
  duplicatedLines?: { line: number; reason: string }[];
  warnings?: string[];
}

function ImportStatementTab({ onImported }: { onImported: (id: string) => void }) {
  const { data: orgData } = useOrganization();
  const orgId = orgData?.organization?.id;
  const [accountId, setAccountId] = useState("");
  const [statementDate, setStatementDate] = useState(new Date().toISOString().slice(0, 10));
  const [openingBalance, setOpeningBalance] = useState(0);
  const [closingBalance, setClosingBalance] = useState(0);
  const [rawLines, setRawLines] = useState("");
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const { data: accounts } = useQuery({
    queryKey: queryKeys.accounts.activeTransactionOptions(orgId!),
    queryFn: () => listAccounts({ active: true }),
    enabled: !!orgId,
  });

  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleImport = async () => {
    if (!accountId || !rawLines.trim()) return;
    setImporting(true);
    setError(null);
    setImportResult(null);
    try {
      // Parse CSV: date,description,amount
      const lines = rawLines.trim().split("\n").map((line) => {
        const parts = line.split(",").map((s) => s.trim());
        if (parts.length < 3) throw new Error(`Invalid line: ${line}`);
        return {
          date: parts[0],
          description: parts[1],
          amount: parseInt(parts[2].replace(/\./g, ""), 10),
        };
      });

      const result: ImportResult = await apiRequest("/api/reconciliation/import-statement", {
        method: "POST",
        body: JSON.stringify({
          accountId,
          statementDate,
          openingBalance,
          closingBalance,
          lines,
        }),
      });
      setImportResult(result);
    } catch (err) {
      setError((err as Error).message ?? "Import gagal");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-wood-600">Akun Bank</label>
              <Select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                placeholder="Pilih akun..."
                options={(accounts ?? []).map((a) => ({
                  value: a.id, label: `${String(a.code)} — ${a.name}`,
                }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-wood-600">Tanggal Statement</label>
              <Input type="date" value={statementDate} onChange={(e) => setStatementDate(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-wood-600">Saldo Awal</label>
              <Input type="number" value={openingBalance} onChange={(e) => setOpeningBalance(parseInt(e.target.value) || 0)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-wood-600">Saldo Akhir</label>
              <Input type="number" value={closingBalance} onChange={(e) => setClosingBalance(parseInt(e.target.value) || 0)} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-wood-600">
              Data Statement (CSV: tanggal,deskripsi,amount)
            </label>
            <textarea
              className="w-full rounded-md border border-wood-200 bg-white px-3 py-2 text-sm font-mono min-h-[120px]"
              value={rawLines}
              onChange={(e) => setRawLines(e.target.value)}
              placeholder={"2026-02-01,Setoran Tunai,500000\n2026-02-05,Pembayaran Listrik,-150000"}
            />
          </div>
          <Button onClick={handleImport} disabled={!accountId || !rawLines.trim() || importing}>
            {importing ? "Mengimpor..." : "Import Statement"}
          </Button>

          {/* Duplicate warnings */}
          {importResult?.warnings && importResult.warnings.length > 0 && (
            <div className="rounded-md bg-amber-50 border border-amber-200 p-3">
              <div className="flex items-center gap-2 text-sm font-medium text-amber-700 mb-1">
                <AlertTriangle className="h-4 w-4" />
                Peringatan
              </div>
              <ul className="list-disc list-inside text-xs text-amber-600 space-y-0.5">
                {importResult.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}

          {importResult?.duplicatedLines && importResult.duplicatedLines.length > 0 && (
            <div className="rounded-md bg-amber-50 border border-amber-200 p-3">
              <div className="flex items-center gap-2 text-sm font-medium text-amber-700 mb-1">
                <AlertTriangle className="h-4 w-4" />
                Kemungkinan Duplikat Baris
              </div>
              <ul className="list-disc list-inside text-xs text-amber-600 space-y-0.5">
                {importResult.duplicatedLines.map((d, i) => <li key={i}>{d.reason}</li>)}
              </ul>
            </div>
          )}

          {error && <ErrorState message={error} />}

          {importResult && !importResult.warnings?.length && !importResult.duplicatedLines?.length && (
            <div className="flex justify-end">
              <Button variant="primary" onClick={() => onImported(importResult.id)}>
                Lanjut ke Laporan
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* Tab: Statement report */
function StatementReportTab({ statementId }: { statementId: string }) {
  const queryClient = useQueryClient();

  const { data: report, isLoading, isError, error } = useQuery({
    queryKey: ["reconciliation", "report", statementId],
    queryFn: () => apiRequest(`/api/reconciliation/${statementId}/report`),
    enabled: !!statementId,
  });

  const reopenMutation = useMutation({
    mutationFn: () => apiRequest(`/api/reconciliation/${statementId}/reopen`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reconciliation", "report", statementId] });
    },
  });

  if (isLoading) return <Skeleton className="h-48 w-full" />;
  if (isError) return <ErrorState message={(error as Error)?.message ?? "Gagal memuat laporan"} />;
  if (!report) return <EmptyState title="Tidak Ada Data" />;

  const r = report as Record<string, unknown>;
  const balanced = r.balanced as boolean;
  const status = (r.statement as Record<string, unknown>)?.status as string;

  return (
    <div className="space-y-4">
      {/* Balance proof */}
      <Card>
        <CardContent className="space-y-3 p-4">
          <h2 className="text-sm font-semibold text-wood-700">Ringkasan Rekonsiliasi</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            <div className="rounded-lg border border-wood-200 p-3">
              <span className="block text-wood-500 text-xs mb-0.5">Saldo Buku</span>
              <span className="font-semibold text-wood-800 text-base">
                {r.bookBalance != null ? formatIDR(Number(r.bookBalance)) : "—"}
              </span>
            </div>
            <div className="rounded-lg border border-wood-200 p-3">
              <span className="block text-wood-500 text-xs mb-0.5">Saldo Statement</span>
              <span className="font-semibold text-wood-800 text-base">
                {formatIDR(Number(r.statementBalance))}
              </span>
            </div>
            <div className={`rounded-lg border p-3 ${balanced ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
              <span className="block text-wood-500 text-xs mb-0.5">Selisih</span>
              <span className={`font-semibold text-base ${balanced ? "text-emerald-600" : "text-amber-600"}`}>
                {r.difference != null ? formatIDR(Number(r.difference)) : "—"}
              </span>
              {balanced && (
                <div className="flex items-center gap-1 text-xs text-emerald-600 mt-1">
                  <CheckCircle className="h-3 w-3" />
                  Seimbang
                </div>
              )}
              {!balanced && r.difference != null && (
                <div className="flex items-center gap-1 text-xs text-amber-600 mt-1">
                  <AlertTriangle className="h-3 w-3" />
                  Belum Seimbang
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Match summary */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="block text-wood-500 text-xs">Total Baris Bank</span>
              <span className="font-semibold text-wood-800">{String(r.bankLinesTotal ?? 0)}</span>
            </div>
            <div>
              <span className="block text-wood-500 text-xs">Tercocokkan</span>
              <span className="font-semibold text-emerald-600">{String(r.matchedLines ?? 0)}</span>
            </div>
            <div>
              <span className="block text-wood-500 text-xs">Belum Tercocokkan</span>
              <span className="font-semibold text-amber-600">{String(r.unmatchedLines ?? 0)}</span>
            </div>
            <div>
              <span className="block text-wood-500 text-xs">Status</span>
              <span className={`font-semibold ${status === "reconciled" ? "text-emerald-600" : "text-amber-600"}`}>
                {status === "reconciled" ? "Terekomiliasi" : "Terbuka"}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Reopen button (only for reconciled statements) */}
      {status === "reconciled" && (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold text-wood-700 mb-2">Buka Ulang Rekonsiliasi</h3>
            <p className="text-xs text-wood-500 mb-3">
              Akan menghapus semua data cocok dan mengembalikan status menjadi "Terbuka" untuk dicocokkan ulang.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => reopenMutation.mutate()}
              disabled={reopenMutation.isPending}
              className="border-amber-300 text-amber-700 hover:bg-amber-50"
            >
              <svg className="h-3.5 w-3.5 mr-1.5 inline" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
              {reopenMutation.isPending ? "Memproses..." : "Buka Ulang"}
            </Button>
            {reopenMutation.isSuccess && (
              <p className="text-xs text-emerald-600 mt-2">Statement berhasil dibuka ulang.</p>
            )}
            {reopenMutation.isError && (
              <ErrorState message={(reopenMutation.error as Error)?.message ?? "Gagal membuka ulang"} />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function ReconciliationPage() {
  const [statementId, setStatementId] = useState<string | null>(null);
  const [tab, setTab] = useState<"import" | "report">("import");

  return (
    <div className="space-y-6 p-4">
      <h1 className="text-xl font-semibold text-wood-800">
        Rekonsiliasi Bank
        <HelpTooltip topic="reconciliation" position="right" />
      </h1>

      <div className="flex gap-2 border-b border-wood-200">
        <button
          type="button"
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === "import" ? "border-wood-800 text-wood-800" : "border-transparent text-wood-400 hover:text-wood-600"}`}
          onClick={() => setTab("import")}
        >
          Import Statement
        </button>
        <button
          type="button"
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === "report" ? "border-wood-800 text-wood-800" : "border-transparent text-wood-400 hover:text-wood-600"}`}
          onClick={() => setTab("report")}
        >
          Laporan
        </button>
      </div>

      {tab === "import" && <ImportStatementTab onImported={(id) => { setStatementId(id); setTab("report"); }} />}
      {tab === "report" && (statementId ? <StatementReportTab statementId={statementId} /> : <EmptyState title="Import Statement Dulu" description="Import statement bank untuk melihat laporan." />)}
    </div>
  );
}
