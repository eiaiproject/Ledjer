import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useOrgPermissions } from "@/hooks/useOrganization";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Modal, ModalContent, ModalFooter } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { translateError } from "@/lib/errors";
import { formatShortDate } from "@/lib/utils";
import { queryKeys } from "@/lib/query-keys";
import { listAccounts, type Account } from "@/lib/api/accounts";
import {
  listAssets,
  createAsset,
  disposeAsset,
  runDepreciation,
  getPendingDepreciation,
  postDepreciation,
  getBookValueReport,
  assetCategoryLabel,
  depreciationMethodLabel,
  formatMinor,
  type FixedAsset,
  type AssetCategory,
  type DepreciationMethod,
  type BookValueReport,
} from "@/lib/api/fixed-assets";
import {
  Plus,
  X,
  ChevronDown,
  ChevronUp,
  Chart,
  TrendDown,
  AlertTriangle,
  Calendar,
  Search,
} from "reicon-react";

const CURRENT_MONTH = new Date().toISOString().slice(0, 7);
const CURRENT_DATE = new Date().toISOString().slice(0, 10);

const STATUS_BADGE: Record<string, { variant: "info" | "success" | "warning" | "error" | "secondary"; label: string }> = {
  active: { variant: "info", label: "Aktif" },
  disposed: { variant: "secondary", label: "Dihapus" },
  sold: { variant: "success", label: "Terjual" },
  impaired: { variant: "error", label: "Penurunan Nilai" },
};

export function FixedAssetsPage() {
  const queryClient = useQueryClient();
  const { isOwner, canManageTeam } = useOrgPermissions();
  const canManage = isOwner || canManageTeam;

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDepreciationModal, setShowDepreciationModal] = useState(false);
  const [showDisposeModal, setShowDisposeModal] = useState<string | null>(null);
  const [showBookValueModal, setShowBookValueModal] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deprPeriod, setDeprPeriod] = useState(CURRENT_MONTH);

  // ── Form state ──────────────────────────────────────────────

  const [formData, setFormData] = useState({
    assetCode: "",
    assetName: "",
    assetCategory: "other" as AssetCategory,
    description: "",
    acquisitionDate: CURRENT_DATE,
    acquisitionCostMinor: "",
    residualValueMinor: "0",
    usefulLifeMonths: "60",
    depreciationMethod: "straight_line" as DepreciationMethod,
    decliningBalanceRate: "",
    accountAssetId: "",
    accountDepreciationId: "",
    accountExpenseId: "",
  });

  const [disposeForm, setDisposeForm] = useState({
    disposalDate: CURRENT_DATE,
    disposalPriceMinor: "0",
    disposalReason: "",
    disposalType: "disposed" as "disposed" | "sold",
  });

  // ── Queries ──────────────────────────────────────────────────

  const { data: accounts } = useQuery({
    queryKey: queryKeys.accounts.fullList(""),
    queryFn: () => listAccounts({}),
  });

  const {
    data: assets,
    isLoading,
    error,
  } = useQuery({
    queryKey: queryKeys.fixedAssets.all(),
    queryFn: () => listAssets({}),
  });

  const { data: bookValueReport } = useQuery({
    queryKey: queryKeys.fixedAssets.bookValue(),
    queryFn: () => getBookValueReport(),
    enabled: showBookValueModal,
  });

  const { data: pendingDepr } = useQuery({
    queryKey: ["pending-depreciation", deprPeriod] as const,
    queryFn: () => getPendingDepreciation(deprPeriod),
    enabled: showDepreciationModal,
  });

  // ── Mutations ────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: () =>
      createAsset({
        assetCode: formData.assetCode,
        assetName: formData.assetName,
        assetCategory: formData.assetCategory,
        description: formData.description || undefined,
        acquisitionDate: formData.acquisitionDate,
        acquisitionCostMinor: parseInt(formData.acquisitionCostMinor, 10) || 0,
        residualValueMinor: parseInt(formData.residualValueMinor, 10) || 0,
        usefulLifeMonths: parseInt(formData.usefulLifeMonths, 10) || 60,
        depreciationMethod: formData.depreciationMethod,
        decliningBalanceRate: formData.decliningBalanceRate
          ? parseFloat(formData.decliningBalanceRate)
          : null,
        accountAssetId: formData.accountAssetId,
        accountDepreciationId: formData.accountDepreciationId,
        accountExpenseId: formData.accountExpenseId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.fixedAssets.all() });
      toast.success("Aset tetap berhasil dibuat");
      setShowCreateModal(false);
      resetForm();
    },
    onError: (err: Error) => {
      toast.error(translateError(err.message));
    },
  });

  const runDeprMutation = useMutation({
    mutationFn: () => runDepreciation(deprPeriod),
    onSuccess: (result) => {
      toast.success(`Depresiasi dibuat: ${result.entriesCreated} entri`);
      queryClient.invalidateQueries({ queryKey: queryKeys.fixedAssets.all() });
      setShowDepreciationModal(false);
    },
    onError: (err: Error) => {
      toast.error(translateError(err.message));
    },
  });

  const postDeprMutation = useMutation({
    mutationFn: () => postDepreciation(deprPeriod, CURRENT_DATE),
    onSuccess: (result) => {
      toast.success(`Depresiasi diposting: ${result.posted} entri`);
      queryClient.invalidateQueries({ queryKey: queryKeys.fixedAssets.all() });
      setShowDepreciationModal(false);
    },
    onError: (err: Error) => {
      toast.error(translateError(err.message));
    },
  });

  const disposeMutation = useMutation({
    mutationFn: () => {
      if (!showDisposeModal) throw new Error("No asset selected");
      return disposeAsset(showDisposeModal, {
        disposalDate: disposeForm.disposalDate,
        disposalPriceMinor: parseInt(disposeForm.disposalPriceMinor, 10) || 0,
        disposalReason: disposeForm.disposalReason,
        disposalType: disposeForm.disposalType,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.fixedAssets.all() });
      toast.success("Aset berhasil dihapus/dijual");
      setShowDisposeModal(null);
    },
    onError: (err: Error) => {
      toast.error(translateError(err.message));
    },
  });

  // ── Handlers ─────────────────────────────────────────────────

  function resetForm() {
    setFormData({
      assetCode: "",
      assetName: "",
      assetCategory: "other",
      description: "",
      acquisitionDate: CURRENT_DATE,
      acquisitionCostMinor: "",
      residualValueMinor: "0",
      usefulLifeMonths: "60",
      depreciationMethod: "straight_line",
      decliningBalanceRate: "",
      accountAssetId: "",
      accountDepreciationId: "",
      accountExpenseId: "",
    });
  }

  function handleOpenBookValue() {
    setShowBookValueModal(true);
  }

  // Filter asset accounts for the 3 required fields
  const assetAccounts = accounts?.filter((a) =>
    a.accountType === "asset" && a.isActive
  ) ?? [];
  const expenseAccounts = accounts?.filter((a) =>
    ["expense", "other_expense"].includes(a.accountType) && a.isActive
  ) ?? [];

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
        title="Gagal memuat aset tetap"
        message="Terjadi kesalahan. Silakan coba lagi."
      />
    );
  }

  const assetList = assets ?? [];

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Aset Tetap</h1>
          <p className="text-sm text-text-secondary mt-0.5">
            Daftar aset tetap, depresiasi, dan nilai buku
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleOpenBookValue}>
            <Chart className="h-4 w-4" />
            Nilai Buku
          </Button>
          <Button variant="outline" size="sm" onClick={() => {
            setShowDepreciationModal(true);
          }}>
            <TrendDown className="h-4 w-4" />
            Depresiasi
          </Button>
          {canManage && (
            <Button size="sm" onClick={() => setShowCreateModal(true)}>
              <Plus className="h-4 w-4" />
              Aset Baru
            </Button>
          )}
        </div>
      </header>

      {/* Asset list */}
      {assetList.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <EmptyState
              icon={Chart}
              title="Belum ada aset tetap"
              description="Catat aset tetap seperti bangunan, kendaraan, atau peralatan kantor."
              action={canManage ? {
                label: "Tambah Aset",
                onClick: () => setShowCreateModal(true),
              } : undefined}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {assetList.map((asset) => {
            const isExpanded = expandedId === asset.id;
            const statusMeta = STATUS_BADGE[asset.status] ?? STATUS_BADGE.active;

            return (
              <Card key={asset.id}>
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : asset.id)}
                  className="w-full text-left"
                  aria-expanded={isExpanded}
                >
                  <CardContent className="flex items-center justify-between py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-text-primary">
                          {asset.assetName}
                        </p>
                        <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                        <span className="text-xs text-text-tertiary">{asset.assetCode}</span>
                        <span className="text-xs bg-wood-100 text-wood-600 px-1.5 py-0.5 rounded">
                          {assetCategoryLabel(asset.assetCategory)}
                        </span>
                        <span className="text-xs text-text-tertiary">
                          {formatMinor(asset.acquisitionCostMinor)}
                        </span>
                        {asset.bookValueMinor !== undefined && (
                          <span className="text-xs text-text-secondary">
                            Nilai Buku: {formatMinor(asset.bookValueMinor)}
                          </span>
                        )}
                      </div>
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4 text-text-tertiary" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-text-tertiary" />
                    )}
                  </CardContent>
                </button>

                {isExpanded && (
                  <div className="border-t border-wood-100 px-4 py-3 space-y-3">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div>
                        <p className="text-text-tertiary">Tanggal Perolehan</p>
                        <p className="text-text-primary font-medium">{formatShortDate(asset.acquisitionDate)}</p>
                      </div>
                      <div>
                        <p className="text-text-tertiary">Masa Manfaat</p>
                        <p className="text-text-primary font-medium">{asset.usefulLifeMonths} bulan</p>
                      </div>
                      <div>
                        <p className="text-text-tertiary">Metode Depresiasi</p>
                        <p className="text-text-primary font-medium">{depreciationMethodLabel(asset.depreciationMethod)}</p>
                      </div>
                      <div>
                        <p className="text-text-tertiary">Nilai Residu</p>
                        <p className="text-text-primary font-medium">{formatMinor(asset.residualValueMinor)}</p>
                      </div>
                      <div>
                        <p className="text-text-tertiary">Akumulasi Depresiasi</p>
                        <p className="text-text-primary font-medium">{formatMinor(asset.accumulatedMinor ?? 0)}</p>
                      </div>
                      <div>
                        <p className="text-text-tertiary">Nilai Buku</p>
                        <p className="text-text-primary font-bold">{formatMinor(asset.bookValueMinor ?? 0)}</p>
                      </div>
                      {asset.lastDepreciationPeriod && (
                        <div>
                          <p className="text-text-tertiary">Depresiasi Terakhir</p>
                          <p className="text-text-primary font-medium">{asset.lastDepreciationPeriod}</p>
                        </div>
                      )}
                    </div>

                    {asset.status === "active" && canManage && (
                      <div className="flex gap-2 pt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowDisposeModal(asset.id);
                          }}
                        >
                          Hapus/Jual
                        </Button>
                      </div>
                    )}

                    {asset.disposalDate && (
                      <div className="rounded-lg bg-clay-50 p-2 text-xs text-clay-700">
                        Dihapus pada {formatShortDate(asset.disposalDate)}
                        {asset.disposalReason && `: ${asset.disposalReason}`}
                        {asset.disposalPriceMinor != null && asset.disposalPriceMinor > 0 &&
                          ` · Harga: ${formatMinor(asset.disposalPriceMinor)}`}
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Create Asset Modal ───────────────────────────── */}

      <Modal open={showCreateModal} onClose={() => setShowCreateModal(false)} size="lg">
        <ModalContent title="Tambah Aset Tetap">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">Kode Aset *</label>
                <Input
                  value={formData.assetCode}
                  onChange={(e) => setFormData((prev) => ({ ...prev, assetCode: e.target.value }))}
                  placeholder="FA-2026-001"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">Kategori *</label>
                <Select
                  value={formData.assetCategory}
                  onChange={(e) => setFormData((prev) => ({ ...prev, assetCategory: e.target.value as AssetCategory }))}
                >
                  {(Object.entries({
                    building: "Bangunan", machinery: "Mesin", vehicle: "Kendaraan",
                    office_equipment: "Peralatan Kantor", computer: "Komputer",
                    furniture: "Furniture", land: "Tanah", other: "Lainnya",
                  }) as [AssetCategory, string][]).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </Select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">Nama Aset *</label>
              <Input
                value={formData.assetName}
                onChange={(e) => setFormData((prev) => ({ ...prev, assetName: e.target.value }))}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">Deskripsi</label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">Tanggal Perolehan *</label>
                <Input
                  type="date"
                  value={formData.acquisitionDate}
                  onChange={(e) => setFormData((prev) => ({ ...prev, acquisitionDate: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">Biaya Perolehan *</label>
                <Input
                  type="number"
                  min={0}
                  step={100}
                  value={formData.acquisitionCostMinor}
                  onChange={(e) => setFormData((prev) => ({ ...prev, acquisitionCostMinor: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">Nilai Residu</label>
                <Input
                  type="number"
                  min={0}
                  value={formData.residualValueMinor}
                  onChange={(e) => setFormData((prev) => ({ ...prev, residualValueMinor: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">Masa Manfaat (bulan) *</label>
                <Input
                  type="number"
                  min={1}
                  max={600}
                  value={formData.usefulLifeMonths}
                  onChange={(e) => setFormData((prev) => ({ ...prev, usefulLifeMonths: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">Metode *</label>
                <Select
                  value={formData.depreciationMethod}
                  onChange={(e) => setFormData((prev) => ({ ...prev, depreciationMethod: e.target.value as DepreciationMethod }))}
                >
                  <option value="straight_line">Garis Lurus</option>
                  <option value="declining_balance">Saldo Menurun</option>
                  <option value="sum_of_years_digits">Jumlah Angka Tahun</option>
                </Select>
              </div>
            </div>

            {formData.depreciationMethod === "declining_balance" && (
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">Tarif Saldo Menurun</label>
                <Input
                  type="number"
                  min={0}
                  max={1}
                  step={0.01}
                  value={formData.decliningBalanceRate}
                  onChange={(e) => setFormData((prev) => ({ ...prev, decliningBalanceRate: e.target.value }))}
                />
                <p className="text-xs text-text-tertiary mt-0.5">
                  Contoh: 0.25 untuk 25%, kosongkan untuk double-declining (200%)
                </p>
              </div>
            )}

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">Akun Aset *</label>
                <Select
                  value={formData.accountAssetId}
                  onChange={(e) => setFormData((prev) => ({ ...prev, accountAssetId: e.target.value }))}
                >
                  <option value="">Pilih akun...</option>
                  {assetAccounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">Akun Akum. Depresiasi *</label>
                <Select
                  value={formData.accountDepreciationId}
                  onChange={(e) => setFormData((prev) => ({ ...prev, accountDepreciationId: e.target.value }))}
                >
                  <option value="">Pilih akun...</option>
                  {assetAccounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">Akun Beban Depresiasi *</label>
                <Select
                  value={formData.accountExpenseId}
                  onChange={(e) => setFormData((prev) => ({ ...prev, accountExpenseId: e.target.value }))}
                >
                  <option value="">Pilih akun...</option>
                  {expenseAccounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                  ))}
                </Select>
              </div>
            </div>
          </div>
          <ModalFooter>
            <Button variant="outline" onClick={() => setShowCreateModal(false)}>
              Batal
            </Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={!formData.assetCode || !formData.assetName || !formData.accountAssetId || !formData.accountDepreciationId || !formData.accountExpenseId || createMutation.isPending}
            >
              {createMutation.isPending ? "Menyimpan..." : "Simpan Aset"}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* ── Depreciation Modal ──────────────────────────────── */}

      <Modal open={showDepreciationModal} onClose={() => setShowDepreciationModal(false)}>
        <ModalContent title="Depresiasi Aset Tetap">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">Periode Depresiasi</label>
              <Input
                type="month"
                value={deprPeriod}
                onChange={(e) => setDeprPeriod(e.target.value)}
              />
            </div>

            {pendingDepr && pendingDepr.entries.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-text-primary">
                  Depresiasi Tertunda ({pendingDepr.entries.length} aset)
                </p>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {pendingDepr.entries.map((e) => (
                    <div key={e.assetCode} className="flex justify-between text-xs text-text-primary">
                      <span>{e.assetName} ({e.assetCode})</span>
                      <span className="font-medium">{formatMinor(e.expenseMinor)}</span>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between text-sm font-bold text-text-primary border-t border-wood-200 pt-2">
                  <span>Total</span>
                  <span>{formatMinor(pendingDepr.totalExpense)}</span>
                </div>
              </div>
            )}

            {pendingDepr && pendingDepr.entries.length === 0 && (
              <p className="text-sm text-text-tertiary">
                Tidak ada depresiasi tertunda untuk periode ini. Jalankan depresiasi terlebih dahulu.
              </p>
            )}

            <div className="flex gap-2">
              <Button
                onClick={() => runDeprMutation.mutate()}
                disabled={runDeprMutation.isPending}
                variant="outline"
              >
                {runDeprMutation.isPending ? "Menjalankan..." : "Jalankan Depresiasi"}
              </Button>
              <Button
                onClick={() => postDeprMutation.mutate()}
                disabled={postDeprMutation.isPending || !pendingDepr || pendingDepr.entries.length === 0}
              >
                {postDeprMutation.isPending ? "Memproses..." : "Posting ke Jurnal"}
              </Button>
            </div>

            {runDeprMutation.data && (
              <div className="rounded-lg bg-leaf-50 p-3 text-xs text-leaf-700">
                {runDeprMutation.data.entriesCreated} entri dibuat, {runDeprMutation.data.entriesSkipped} dilewati
              </div>
            )}
          </div>
          <ModalFooter>
            <Button variant="outline" onClick={() => setShowDepreciationModal(false)}>
              Tutup
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* ── Book Value Report Modal ───────────────────────── */}

      <Modal open={showBookValueModal} onClose={() => setShowBookValueModal(false)} size="lg">
        <ModalContent title="Laporan Nilai Buku Aset Tetap">
          {bookValueReport && bookValueReport.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-wood-200 text-text-tertiary">
                    <th className="text-left py-2 font-medium">Aset</th>
                    <th className="text-right py-2 font-medium">Biaya Perolehan</th>
                    <th className="text-right py-2 font-medium">Akum. Depresiasi</th>
                    <th className="text-right py-2 font-medium">Nilai Buku</th>
                    <th className="text-right py-2 font-medium">Depresiasi/Bulan</th>
                    <th className="text-right py-2 font-medium">Sisa (bulan)</th>
                  </tr>
                </thead>
                <tbody>
                  {bookValueReport.map((item) => (
                    <tr key={item.assetId} className="border-b border-wood-100 hover:bg-wood-50/50">
                      <td className="py-2 text-text-primary">
                        <p className="font-medium">{item.assetName}</p>
                        <p className="text-xs text-text-tertiary">{item.assetCode} · {item.assetCategory}</p>
                      </td>
                      <td className="py-2 text-right text-text-primary">{formatMinor(item.acquisitionCost)}</td>
                      <td className="py-2 text-right text-text-secondary">{formatMinor(item.accumulatedDepreciation)}</td>
                      <td className="py-2 text-right font-semibold text-text-primary">{formatMinor(item.bookValue)}</td>
                      <td className="py-2 text-right text-text-secondary">{formatMinor(item.monthlyDepreciation)}</td>
                      <td className="py-2 text-right text-text-secondary">
                        {item.status === "active"
                          ? Math.max(0, item.usefulLifeMonths - item.monthsElapsed)
                          : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-text-tertiary text-center py-4">
              {!bookValueReport ? "Memuat data..." : "Tidak ada aset tetap."}
            </p>
          )}
          <ModalFooter>
            <Button variant="outline" onClick={() => setShowBookValueModal(false)}>
              Tutup
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* ── Dispose Modal ──────────────────────────────────── */}

      <Modal
        open={!!showDisposeModal}
        onClose={() => setShowDisposeModal(null)}
      >
        <ModalContent title="Hapus/Jual Aset">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">Tipe *</label>
                <Select
                  value={disposeForm.disposalType}
                  onChange={(e) => setDisposeForm((prev) => ({
                    ...prev, disposalType: e.target.value as "disposed" | "sold",
                  }))}
                >
                  <option value="disposed">Dihapus (0 rupiah)</option>
                  <option value="sold">Dijual</option>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">Tanggal *</label>
                <Input
                  type="date"
                  value={disposeForm.disposalDate}
                  onChange={(e) => setDisposeForm((prev) => ({ ...prev, disposalDate: e.target.value }))}
                />
              </div>
            </div>
            {disposeForm.disposalType === "sold" && (
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">Harga Jual *</label>
                <Input
                  type="number"
                  min={0}
                  value={disposeForm.disposalPriceMinor}
                  onChange={(e) => setDisposeForm((prev) => ({ ...prev, disposalPriceMinor: e.target.value }))}
                />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">Alasan *</label>
              <Input
                value={disposeForm.disposalReason}
                onChange={(e) => setDisposeForm((prev) => ({ ...prev, disposalReason: e.target.value }))}
                placeholder="Rusak, tidak terpakai, terjual..."
              />
            </div>
          </div>
          <ModalFooter>
            <Button variant="outline" onClick={() => setShowDisposeModal(null)}>
              Batal
            </Button>
            <Button
              onClick={() => disposeMutation.mutate()}
              disabled={!disposeForm.disposalReason || disposeMutation.isPending}
              variant="destructive"
            >
              {disposeMutation.isPending ? "Memproses..." : "Hapus Aset"}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
