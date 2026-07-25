import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useOrgPermissions } from "@/hooks/useOrganization";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Modal, ModalContent, ModalFooter } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { translateError } from "@/lib/errors";
import { formatShortDate } from "@/lib/utils";
import { queryKeys } from "@/lib/query-keys";
import {
  listBudgets,
  createBudget,
  getActualVsBudget,
  getBudgetVarianceAlerts,
  generateForecast,
  type Budget,
} from "@/lib/api/budgets";
import { listAccounts } from "@/lib/api/accounts";
import {
  Wallet,
  Plus,
  X,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Chart,
} from "reicon-react";

const CURRENT_YEAR = new Date().getFullYear();
const DEFAULT_PERIOD_FROM = `${CURRENT_YEAR}-01-01`;
const DEFAULT_PERIOD_TO = `${CURRENT_YEAR}-12-31`;

function formatMinor(value: number): string {
  return `Rp ${(value / 100).toLocaleString("id-ID")}`;
}

function formatVariancePercent(value: number | null): string {
  if (value === null) return "-";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export function BudgetsPage() {
  const queryClient = useQueryClient();
  const { isOwner, canManageTeam } = useOrgPermissions();
  const canManage = isOwner || canManageTeam;

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showForecastModal, setShowForecastModal] = useState(false);
  const [selectedBudget, setSelectedBudget] = useState<Budget | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [alertThreshold, _setAlertThreshold] = useState(20);

  // ── Form state ──────────────────────────────────────────────

  const [formData, setFormData] = useState<{
    accountId: string;
    periodFrom: string;
    periodTo: string;
    amountMinor: string;
    notes: string;
    lines: { month: string; amountMinor: string }[];
  }>({
    accountId: "",
    periodFrom: DEFAULT_PERIOD_FROM,
    periodTo: DEFAULT_PERIOD_TO,
    amountMinor: "0",
    notes: "",
    lines: [],
  });

  // ── Queries ──────────────────────────────────────────────────

  const { data: accounts } = useQuery({
    queryKey: queryKeys.accounts.fullList(""),
    queryFn: () => listAccounts({}),
  });

  const {
    data: budgets,
    isLoading,
    error,
  } = useQuery({
    queryKey: queryKeys.budgets.all(),
    queryFn: () => listBudgets({}),
  });

  const { data: reportData, refetch: refetchReport } = useQuery({
    queryKey: queryKeys.budgets.report(DEFAULT_PERIOD_FROM, DEFAULT_PERIOD_TO),
    queryFn: () => getActualVsBudget(DEFAULT_PERIOD_FROM, DEFAULT_PERIOD_TO),
    enabled: false,
  });

  const { data: alertData } = useQuery({
    queryKey: queryKeys.budgets.varianceAlerts(alertThreshold),
    queryFn: () => getBudgetVarianceAlerts(alertThreshold),
    refetchInterval: 120_000,
  });

  // ── Mutations ────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: () =>
      createBudget({
        accountId: formData.accountId,
        periodFrom: formData.periodFrom,
        periodTo: formData.periodTo,
        amountMinor: parseInt(formData.amountMinor, 10) || 0,
        notes: formData.notes || undefined,
        lines: formData.lines.map((l) => ({
          month: l.month,
          amountMinor: parseInt(l.amountMinor, 10) || 0,
        })),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.budgets.all() });
      toast.success("Anggaran berhasil dibuat");
      setShowCreateModal(false);
      resetForm();
    },
    onError: (err: Error) => {
      toast.error(translateError(err.message));
    },
  });

  // ── Handlers ─────────────────────────────────────────────────

  function resetForm() {
    setFormData({
      accountId: "",
      periodFrom: DEFAULT_PERIOD_FROM,
      periodTo: DEFAULT_PERIOD_TO,
      amountMinor: "0",
      notes: "",
      lines: [],
    });
  }

  function addLine() {
    setFormData((prev) => ({
      ...prev,
      lines: [...prev.lines, { month: "", amountMinor: "0" }],
    }));
  }

  function updateLine(index: number, field: "month" | "amountMinor", value: string) {
    setFormData((prev) => {
      const lines = [...prev.lines];
      lines[index] = { ...lines[index], [field]: value };
      return { ...prev, lines };
    });
  }

  function removeLine(index: number) {
    setFormData((prev) => ({
      ...prev,
      lines: prev.lines.filter((_, i) => i !== index),
    }));
  }

  async function handleOpenReport() {
    await refetchReport();
    setShowReportModal(true);
  }

  function openForecast(accountId: string) {
    setSelectedBudget((prev) => {
      if (prev && prev.accountId === accountId) return prev;
      return { accountId } as Budget;
    });
    setShowForecastModal(true);
  }

  // ── Helpers ──────────────────────────────────────────────────


  // ── Render ───────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <div className="h-8 w-48 bg-cream-200 rounded animate-pulse" />
        <div className="h-64 bg-cream-200 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (error) {
    return (
      <ErrorState
        title="Gagal memuat anggaran"
        message="Terjadi kesalahan saat memuat data anggaran. Silakan coba lagi."
      />
    );
  }

  const budgetList = budgets ?? [];

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Anggaran</h1>
          <p className="text-sm text-text-secondary mt-0.5">
            Kelola anggaran per akun dan bandingkan dengan realisasi
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleOpenReport}>
            <Chart className="h-4 w-4" />
            Realisasi vs Anggaran
          </Button>
          {canManage && (
            <Button size="sm" onClick={() => setShowCreateModal(true)}>
              <Plus className="h-4 w-4" />
              Anggaran Baru
            </Button>
          )}
        </div>
      </header>

      {/* Variance Alerts */}
      {alertData && alertData.length > 0 && (
        <Card className="border-clay-300 bg-clay-50">
          <CardContent className="py-3">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-clay-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-clay-800">
                  {alertData.length} akun melebihi ambang anggaran ({alertThreshold}%)
                </p>
                <ul className="text-xs text-clay-600 space-y-0.5">
                  {alertData.slice(0, 5).map((a) => (
                    <li key={a.accountId}>
                      {a.accountName}: {formatVariancePercent(a.variancePercent)} ({formatMinor(a.variance)})
                    </li>
                  ))}
                  {alertData.length > 5 && (
                    <li className="text-clay-500">...dan {alertData.length - 5} lainnya</li>
                  )}
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Budget list */}
      {budgetList.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <EmptyState
              icon={Wallet}
              title="Belum ada anggaran"
              description="Buat anggaran untuk akun-akun Anda dan pantau realisasi vs anggaran."
              action={canManage ? {
                label: "Buat Anggaran",
                onClick: () => setShowCreateModal(true),
              } : undefined}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {budgetList.map((budget) => {
            const isExpanded = expandedId === budget.id;
            return (
              <Card key={budget.id}>
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : budget.id)}
                  className="w-full text-left"
                  aria-expanded={isExpanded}
                >
                  <CardContent className="flex items-center justify-between py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-text-primary">
                          {budget.accountName || "Akun"}
                        </p>
                        <Badge variant={budget.isActive ? "info" : "secondary"}>
                          {budget.isActive ? "Aktif" : "Nonaktif"}
                        </Badge>
                      </div>
                      <p className="text-xs text-text-tertiary mt-0.5">
                        {formatShortDate(budget.periodFrom)} – {formatShortDate(budget.periodTo)}
                        {" · "}
                        {formatMinor(budget.amountMinor)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openForecast(budget.accountId);
                        }}
                        className="text-xs text-blue-600 hover:text-blue-800 px-2 py-1"
                      >
                        Forecast
                      </button>
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-text-tertiary" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-text-tertiary" />
                      )}
                    </div>
                  </CardContent>
                </button>
                {isExpanded && budget.lines && budget.lines.length > 0 && (
                  <div className="border-t border-wood-100 px-4 py-3">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-text-tertiary">
                          <th className="text-left pb-1">Bulan</th>
                          <th className="text-right pb-1">Anggaran</th>
                        </tr>
                      </thead>
                      <tbody>
                        {budget.lines.map((line) => (
                          <tr key={line.id} className="text-text-primary">
                            <td className="py-0.5">{line.month}</td>
                            <td className="text-right py-0.5">{formatMinor(line.amountMinor)}</td>
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

      {/* ── Create Budget Modal ───────────────────────────── */}

      <Modal open={showCreateModal} onClose={() => setShowCreateModal(false)}>
        <ModalContent title="Buat Anggaran Baru">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">Akun</label>
              <select
                value={formData.accountId}
                onChange={(e) => setFormData((prev) => ({ ...prev, accountId: e.target.value }))}
                required
                className="w-full rounded-md border border-wood-200 bg-cream-50 px-3 py-2 text-sm text-wood-700 focus:border-wood-500 focus:outline-none focus:ring-2 focus:ring-wood-200"
              >
                <option value="">Pilih akun...</option>
                {accounts?.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} — {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">Periode Dari</label>
                <Input
                  type="date"
                  value={formData.periodFrom}
                  onChange={(e) => setFormData((prev) => ({ ...prev, periodFrom: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">Periode Sampai</label>
                <Input
                  type="date"
                  value={formData.periodTo}
                  onChange={(e) => setFormData((prev) => ({ ...prev, periodTo: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">Jumlah Anggaran</label>
              <Input
                type="number"
                min={0}
                step={100}
                value={formData.amountMinor}
                onChange={(e) => setFormData((prev) => ({ ...prev, amountMinor: e.target.value }))}
              />
            </div>

            {/* Monthly lines */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm font-medium text-text-primary">Rincian Bulanan (opsional)</label>
                <button
                  type="button"
                  onClick={addLine}
                  className="text-xs text-blue-600 hover:text-blue-800"
                >
                  + Tambah Bulan
                </button>
              </div>
              {formData.lines.map((line, i) => (
                <div key={i} className="flex items-center gap-2 mt-2">
                  <Input
                    type="month"
                    value={line.month}
                    onChange={(e) => updateLine(i, "month", e.target.value)}
                    className="flex-1"
                  />
                  <Input
                    type="number"
                    min={0}
                    placeholder="Jumlah"
                    value={line.amountMinor}
                    onChange={(e) => updateLine(i, "amountMinor", e.target.value)}
                    className="flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => removeLine(i)}
                    className="p-2 text-clay-500 hover:text-clay-700"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">Catatan</label>
              <Input
                value={formData.notes}
                onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
                placeholder="Catatan opsional..."
              />
            </div>
          </div>
          <ModalFooter>
            <Button variant="outline" onClick={() => setShowCreateModal(false)}>
              Batal
            </Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={!formData.accountId || createMutation.isPending}
            >
              {createMutation.isPending ? "Menyimpan..." : "Simpan Anggaran"}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* ── Actual vs Budget Report Modal ──────────────────── */}

      <Modal open={showReportModal} onClose={() => setShowReportModal(false)} size="lg">
        <ModalContent title="Realisasi vs Anggaran">
          {reportData ? (
            <div className="space-y-4">
              {/* Summary cards */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg bg-leaf-50 p-3">
                  <p className="text-xs text-leaf-600">Total Anggaran</p>
                  <p className="text-lg font-bold text-leaf-800">{formatMinor(reportData.totalBudget)}</p>
                </div>
                <div className="rounded-lg bg-sky-50 p-3">
                  <p className="text-xs text-sky-600">Total Realisasi</p>
                  <p className="text-lg font-bold text-sky-800">{formatMinor(reportData.totalActual)}</p>
                </div>
                <div className={reportData.totalVariance >= 0 ? "rounded-lg bg-clay-50 p-3" : "rounded-lg bg-leaf-50 p-3"}>
                  <p className="text-xs text-text-tertiary">Selisih</p>
                  <p className={`text-lg font-bold ${reportData.totalVariance >= 0 ? "text-clay-700" : "text-leaf-700"}`}>
                    {reportData.totalVariance >= 0 ? "+" : ""}
                    {formatMinor(reportData.totalVariance)} ({formatVariancePercent(reportData.totalVariancePercent)})
                  </p>
                </div>
              </div>

              {/* Table */}
              {reportData.accounts.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-wood-200 text-text-tertiary">
                        <th className="text-left py-2 font-medium">Akun</th>
                        <th className="text-right py-2 font-medium">Anggaran</th>
                        <th className="text-right py-2 font-medium">Realisasi</th>
                        <th className="text-right py-2 font-medium">Selisih</th>
                        <th className="text-right py-2 font-medium">%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reportData.accounts.map((acc) => (
                        <tr key={acc.accountId} className="border-b border-wood-100 hover:bg-wood-50/50">
                          <td className="py-2 text-text-primary">
                            <span className="font-mono text-xs text-text-tertiary">{acc.accountCode}</span>
                            {" "}{acc.accountName}
                          </td>
                          <td className="py-2 text-right text-text-primary">{formatMinor(acc.budgetAmount)}</td>
                          <td className="py-2 text-right text-text-primary">{formatMinor(acc.actualAmount)}</td>
                          <td className={`py-2 text-right ${acc.variance >= 0 ? "text-clay-600" : "text-leaf-600"}`}>
                            {acc.variance >= 0 ? "+" : ""}
                            {formatMinor(acc.variance)}
                          </td>
                          <td className={`py-2 text-right ${(acc.variancePercent ?? 0) > 0 ? "text-clay-600" : "text-leaf-600"}`}>
                            {formatVariancePercent(acc.variancePercent)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-text-tertiary text-center py-4">Tidak ada data anggaran untuk periode ini.</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-text-tertiary text-center py-4">Memuat data...</p>
          )}
          <ModalFooter>
            <Button variant="outline" onClick={() => setShowReportModal(false)}>
              Tutup
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* ── Forecast Modal ─────────────────────────────────── */}

      <ForecastModal
        open={showForecastModal}
        onClose={() => setShowForecastModal(false)}
        accountId={selectedBudget?.accountId ?? ""}
      />
    </div>
  );
}

/* ───── Forecast Modal Component ───── */

function ForecastModal({
  open,
  onClose,
  accountId,
}: {
  open: boolean;
  onClose: () => void;
  accountId: string;
}) {
  const [monthsAhead, setMonthsAhead] = useState(3);
  const { data: accounts } = useQuery({
    queryKey: queryKeys.accounts.fullList(""),
    queryFn: () => listAccounts({}),
    enabled: open,
  });

  const { data: forecast, isLoading } = useQuery({
    queryKey: ["forecast", accountId, monthsAhead] as const,
    queryFn: () => generateForecast(accountId, monthsAhead),
    enabled: open && !!accountId,
  });

  const accountName = accounts?.find((a) => a.id === accountId)?.name ?? "Akun";

  return (
    <Modal open={open} onClose={onClose}>
      <ModalContent title={`Forecast: ${accountName}`}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">
              Periode Forecast (bulan)
            </label>
            <div className="flex items-center gap-2">
              {[1, 3, 6, 12].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setMonthsAhead(n)}
                  className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                    monthsAhead === n
                      ? "bg-wood-500 text-white border-wood-500"
                      : "bg-white text-text-primary border-wood-200 hover:border-wood-400"
                  }`}
                >
                  {n} {n === 1 ? "bulan" : "bulan"}
                </button>
              ))}
            </div>
          </div>

          {isLoading ? (
            <div className="h-20 bg-cream-200 rounded-lg animate-pulse" />
          ) : forecast ? (
            <div className="space-y-3">
              <Card>
                <CardContent className="py-4">
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <p className="text-xs text-text-tertiary">Metode</p>
                      <p className="text-sm font-medium text-text-primary capitalize">
                        {forecast.method === "average" ? "Rata-rata 3 bulan" : "Periode terakhir"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-text-tertiary">Estimasi {monthsAhead} bulan</p>
                      <p className="text-sm font-bold text-text-primary">
                        {formatMinor(forecast.forecastAmount)}
                      </p>
                    </div>
                    {forecast.confidenceInterval && (
                      <div>
                        <p className="text-xs text-text-tertiary">Rentang Keyakinan</p>
                        <p className="text-xs text-text-primary">
                          {formatMinor(forecast.confidenceInterval.low)} – {formatMinor(forecast.confidenceInterval.high)}
                        </p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
              <p className="text-xs text-text-tertiary">
                Forecast dihitung berdasarkan rata-rata realisasi 3 bulan terakhir.
                Hasil ini hanya estimasi dan bukan jaminan kinerja masa depan.
              </p>
            </div>
          ) : (
            <p className="text-sm text-text-tertiary text-center py-4">
              Tidak ada data historis untuk menghasilkan forecast.
            </p>
          )}
        </div>
        <ModalFooter>
          <Button variant="outline" onClick={onClose}>
            Tutup
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
