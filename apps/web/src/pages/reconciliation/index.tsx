import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { formatIDR } from "@/lib/utils";
import { useOrganization } from "@/hooks/useOrganization";
import { listAccounts } from "@/lib/api/accounts";
import { queryKeys } from "@/lib/query-keys";

/* Tab: Import statement */
function ImportStatementTab({ onImported }: { onImported: (id: string) => void }) {
  const { data: orgData } = useOrganization();
  const orgId = orgData?.organization?.id;
  const [accountId, setAccountId] = useState("");
  const [statementDate, setStatementDate] = useState(new Date().toISOString().slice(0, 10));
  const [rawLines, setRawLines] = useState("");

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

      const result: { id: string } = await apiRequest("/api/reconciliation/import-statement", {
        method: "POST",
        body: JSON.stringify({
          accountId,
          statementDate,
          openingBalance: 0,
          closingBalance: 0,
          lines,
        }),
      });
      onImported(result.id);
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
          {error && <ErrorState message={error} />}
        </CardContent>
      </Card>
    </div>
  );
}

/* Tab: Statement report */
function StatementReportTab({ statementId }: { statementId: string }) {
  const { data: report, isLoading, isError, error } = useQuery({
    queryKey: ["reconciliation", "report", statementId],
    queryFn: () => apiRequest(`/api/reconciliation/${statementId}/report`),
    enabled: !!statementId,
  });

  if (isLoading) return <Skeleton className="h-48 w-full" />;
  if (isError) return <ErrorState message={(error as Error)?.message ?? "Gagal memuat laporan"} />;
  if (!report) return <EmptyState title="Tidak Ada Data" />;

  const r = report as Record<string, unknown>;
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div><span className="text-wood-500">Total Baris Bank:</span> <span className="font-medium">{String(r.bankLinesTotal ?? 0)}</span></div>
          <div><span className="text-wood-500">Tercocokkan:</span> <span className="font-medium text-emerald-600">{String(r.matchedLines ?? 0)}</span></div>
          <div><span className="text-wood-500">Belum Tercocokkan:</span> <span className="font-medium text-amber-600">{String(r.unmatchedLines ?? 0)}</span></div>
          <div><span className="text-wood-500">Saldo Buku:</span> <span className="font-medium">{formatIDR(Number(r.bookBalance ?? 0))}</span></div>
          <div><span className="text-wood-500">Saldo Statement:</span> <span className="font-medium">{formatIDR(Number(r.statementBalance ?? 0))}</span></div>
          <div><span className="text-wood-500">Selisih:</span> <span className="font-medium">{formatIDR(Number(r.difference ?? 0))}</span></div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ReconciliationPage() {
  const [statementId, setStatementId] = useState<string | null>(null);
  const [tab, setTab] = useState<"import" | "report">("import");

  return (
    <div className="space-y-6 p-4">
      <h1 className="text-xl font-semibold text-wood-800">Rekonsiliasi Bank</h1>

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
