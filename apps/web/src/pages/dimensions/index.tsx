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
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { translateError } from "@/lib/errors";
import { queryKeys } from "@/lib/query-keys";
import {
  listDimensions,
  createDimension,
  updateDimension,
  deleteDimension,
  getDimensionReport,
  getDimensionSummary,
  dimensionTypeLabel,
  formatMinor,
  type Dimension,
  type DimensionType,
  
} from "@/lib/api/dimensions";
import {
  Plus,
  
  ChevronDown,
  ChevronUp,
  Chart,
  Building,
  Folder,
  Briefcase,
  Wallet,
  TrendUp,
  Edit,
  Trash,
} from "reicon-react";

const CURRENT_YEAR = new Date().getFullYear();
const DEFAULT_PERIOD_FROM = `${CURRENT_YEAR}-01-01`;
const DEFAULT_PERIOD_TO = new Date().toISOString().slice(0, 10);

const DIMENSION_ICONS: Record<DimensionType, React.ComponentType<{ className?: string }>> = {
  branch: Building,
  department: Folder,
  project: Briefcase,
  cost_center: Wallet,
  profit_center: TrendUp,
};

const DIMENSION_COLORS: Record<DimensionType, string> = {
  branch: "bg-sky-50 border-sky-300 text-sky-700",
  department: "bg-leaf-50 border-leaf-300 text-leaf-700",
  project: "bg-honey-50 border-honey-300 text-honey-700",
  cost_center: "bg-clay-50 border-clay-300 text-clay-700",
  profit_center: "bg-wood-50 border-wood-300 text-wood-700",
};

const DIMENSION_TYPES: DimensionType[] = [
  "branch", "department", "project", "cost_center", "profit_center",
];

export function DimensionsPage() {
  const queryClient = useQueryClient();
  const { isOwner, canManageTeam } = useOrgPermissions();
  const canManage = isOwner || canManageTeam;

  const [activeTab, setActiveTab] = useState<DimensionType>("branch");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState<string | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [reportPeriodFrom, setReportPeriodFrom] = useState(DEFAULT_PERIOD_FROM);
  const [reportPeriodTo, setReportPeriodTo] = useState(DEFAULT_PERIOD_TO);

  // ── Form state ──────────────────────────────────────────────

  const [formData, setFormData] = useState({
    code: "",
    name: "",
    description: "",
  });

  const [editForm, setEditForm] = useState({
    name: "",
    description: "",
  });

  // ── Queries ──────────────────────────────────────────────────

  const {
    data: dimensions,
    isLoading,
    error,
  } = useQuery({
    queryKey: queryKeys.dimensions.all(),
    queryFn: () => listDimensions({}),
  });

  const { data: summary } = useQuery({
    queryKey: queryKeys.dimensions.summary(),
    queryFn: () => getDimensionSummary(),
  });

  const { data: reportData, refetch: refetchReport } = useQuery({
    queryKey: queryKeys.dimensions.report(activeTab, reportPeriodFrom, reportPeriodTo),
    queryFn: () => getDimensionReport(activeTab, reportPeriodFrom, reportPeriodTo),
    enabled: false,
  });

  // ── Mutations ────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: () =>
      createDimension({
        dimensionType: activeTab,
        code: formData.code,
        name: formData.name,
        description: formData.description || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.dimensions.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.dimensions.summary() });
      toast.success(`${dimensionTypeLabel(activeTab)} berhasil dibuat`);
      setShowCreateModal(false);
      setFormData({ code: "", name: "", description: "" });
    },
    onError: (err: Error) => {
      toast.error(translateError(err.message));
    },
  });

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!showEditModal) throw new Error("No dimension selected");
      return updateDimension(showEditModal, {
        name: editForm.name,
        description: editForm.description,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.dimensions.all() });
      toast.success("Dimensi berhasil diperbarui");
      setShowEditModal(null);
    },
    onError: (err: Error) => {
      toast.error(translateError(err.message));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => {
      if (!confirmDelete) throw new Error("No dimension selected");
      return deleteDimension(confirmDelete);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.dimensions.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.dimensions.summary() });
      toast.success("Dimensi berhasil dinonaktifkan");
      setConfirmDelete(null);
    },
    onError: (err: Error) => {
      toast.error(translateError(err.message));
    },
  });

  // ── Handlers ─────────────────────────────────────────────────

  function filteredDimensions(): Dimension[] {
    return (dimensions ?? []).filter((d) => d.dimensionType === activeTab);
  }

  function openEdit(dim: Dimension) {
    setEditForm({ name: dim.name, description: dim.description });
    setShowEditModal(dim.id);
  }

  async function handleOpenReport() {
    await refetchReport();
    setShowReportModal(true);
  }

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
        title="Gagal memuat dimensi"
        message="Terjadi kesalahan. Silakan coba lagi."
      />
    );
  }

  const currentDims = filteredDimensions();
  const typeSummary = summary?.find((s) => s.type === activeTab);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Dimensi</h1>
          <p className="text-sm text-text-secondary mt-0.5">
            Kelola cabang, departemen, proyek, pusat biaya, dan pusat laba
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleOpenReport}>
            <Chart className="h-4 w-4" />
            Laporan Dimensi
          </Button>
          {canManage && (
            <Button size="sm" onClick={() => setShowCreateModal(true)}>
              <Plus className="h-4 w-4" />
              Tambah
            </Button>
          )}
        </div>
      </header>

      {/* Dimension Type Tabs */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
        {DIMENSION_TYPES.map((type) => {
          const Icon = DIMENSION_ICONS[type];
          const isActive = activeTab === type;
          const typeCount = summary?.find((s) => s.type === type)?.activeCount ?? 0;
          return (
            <button
              key={type}
              type="button"
              onClick={() => setActiveTab(type)}
              className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors min-h-[44px] ${
                isActive
                  ? "bg-wood-500 text-white shadow-sm"
                  : "bg-white text-text-secondary border border-wood-200 hover:border-wood-400 hover:bg-wood-50"
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{dimensionTypeLabel(type)}</span>
              {typeCount > 0 && (
                <Badge variant={isActive ? "secondary" : "info"}>{typeCount}</Badge>
              )}
            </button>
          );
        })}
      </div>

      {/* Summary card */}
      {typeSummary && (
        <Card className="border-dashed">
          <CardContent className="py-3">
            <div className="flex items-center gap-3 text-sm">
              <span className="text-text-tertiary">Total {dimensionTypeLabel(activeTab)}:</span>
              <span className="font-semibold text-text-primary">{typeSummary.activeCount} aktif</span>
              <span className="text-text-tertiary">dari {typeSummary.count} total</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dimension list */}
      {currentDims.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <EmptyState
              icon={DIMENSION_ICONS[activeTab]}
              title={`Belum ada ${dimensionTypeLabel(activeTab).toLowerCase()}`}
              description={`Tambahkan ${dimensionTypeLabel(activeTab).toLowerCase()} untuk melacak transaksi per dimensi.`}
              action={canManage ? {
                label: `Tambah ${dimensionTypeLabel(activeTab)}`,
                onClick: () => setShowCreateModal(true),
              } : undefined}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {currentDims.map((dim) => {
            const isExpanded = expandedId === dim.id;
            const Icon = DIMENSION_ICONS[dim.dimensionType];
            const colorClass = DIMENSION_COLORS[dim.dimensionType];

            return (
              <Card key={dim.id}>
                <button                   type="button"
                  onClick={() => setExpandedId(isExpanded ? null : dim.id)}
                  className="w-full text-left"
                  aria-expanded={isExpanded}
                >
                  <CardContent className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className={`shrink-0 rounded-lg p-2 ${colorClass}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-text-primary">
                            {dim.name}
                          </p>
                          <Badge variant={dim.isActive ? "info" : "secondary"}>
                            {dim.isActive ? "Aktif" : "Nonaktif"}
                          </Badge>
                        </div>
                        <p className="text-xs text-text-tertiary mt-0.5">
                          {dim.code}
                          {dim.description && ` · ${dim.description}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {canManage && (
                        <>
                          <button                             type="button"
                            onClick={(e) => { e.stopPropagation(); openEdit(dim); }}
                            className="p-1.5 text-text-tertiary hover:text-text-primary rounded"
                            aria-label={`Edit ${dim.name}`}
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                          <button                             type="button"
                            onClick={(e) => { e.stopPropagation(); setConfirmDelete(dim.id); }}
                            className="p-1.5 text-clay-500 hover:text-clay-700 rounded"
                            aria-label={`Hapus ${dim.name}`}
                          >
                            <Trash className="h-4 w-4" />
                          </button>
                        </>
                      )}
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-text-tertiary" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-text-tertiary" />
                      )}
                    </div>
                  </CardContent>
                </button>
                {isExpanded && dim.parentId && (
                  <div className="border-t border-wood-100 px-4 py-2 text-xs text-text-tertiary">
                    Parent ID: {dim.parentId}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Create Modal ──────────────────────────────────── */}

      <Modal open={showCreateModal} onClose={() => setShowCreateModal(false)}>
        <ModalContent title={`Tambah ${dimensionTypeLabel(activeTab)}`}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                Tipe
              </label>
              <div className="rounded-lg bg-wood-50 px-3 py-2 text-sm text-wood-700">
                {dimensionTypeLabel(activeTab)}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                Kode *</label>
              <Input
                value={formData.code}
                onChange={(e) => setFormData((prev) => ({ ...prev, code: e.target.value }))}
                placeholder={`Contoh: ${activeTab === "branch" ? "BR-001" : activeTab === "department" ? "DEPT-FIN" : activeTab === "project" ? "PRJ-001" : "CC-001"}`}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                Nama *</label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                Deskripsi</label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
              />
            </div>
          </div>
          <ModalFooter>
            <Button variant="outline" onClick={() => setShowCreateModal(false)}>Batal</Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={!formData.code || !formData.name || createMutation.isPending}
            >
              {createMutation.isPending ? "Menyimpan..." : "Simpan"}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* ── Edit Modal ────────────────────────────────────── */}

      <Modal open={!!showEditModal} onClose={() => setShowEditModal(null)}>
        <ModalContent title="Edit Dimensi">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">Nama</label>
              <Input
                value={editForm.name}
                onChange={(e) => setEditForm((prev) => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">Deskripsi</label>
              <Input
                value={editForm.description}
                onChange={(e) => setEditForm((prev) => ({ ...prev, description: e.target.value }))}
              />
            </div>
          </div>
          <ModalFooter>
            <Button variant="outline" onClick={() => setShowEditModal(null)}>Batal</Button>
            <Button
              onClick={() => updateMutation.mutate()}
              disabled={!editForm.name || updateMutation.isPending}
            >
              {updateMutation.isPending ? "Menyimpan..." : "Simpan"}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* ── Delete Confirm Modal ──────────────────────────── */}

      <Modal open={!!confirmDelete} onClose={() => setConfirmDelete(null)}>
        <ModalContent title="Konfirmasi Hapus">
          <p className="text-sm text-text-secondary">
            Apakah Anda yakin ingin menonaktifkan dimensi ini? Transaksi yang sudah diberi tag tidak akan terpengaruh.
          </p>
        </ModalContent>
        <ModalFooter>
          <Button variant="outline" onClick={() => setConfirmDelete(null)}>Batal</Button>
          <Button
            onClick={() => deleteMutation.mutate()}
            disabled={deleteMutation.isPending}
            variant="destructive"
          >
            {deleteMutation.isPending ? "Memproses..." : "Hapus"}
          </Button>
        </ModalFooter>
      </Modal>

      {/* ── Report Modal ──────────────────────────────────── */}

      <Modal open={showReportModal} onClose={() => setShowReportModal(false)} size="lg">
        <ModalContent title={`Laporan ${dimensionTypeLabel(activeTab)}`}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-text-primary mb-1">Tipe</label>
                <Select
                  value={activeTab}
                  onChange={(e) => setActiveTab(e.target.value as DimensionType)}
                >
                  {DIMENSION_TYPES.map((type) => (
                    <option key={type} value={type}>{dimensionTypeLabel(type)}</option>
                  ))}
                </Select>
              </div>
              <div className="flex gap-2">
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1">Dari</label>
                  <Input
                    type="date"
                    value={reportPeriodFrom}
                    onChange={(e) => setReportPeriodFrom(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-primary mb-1">Sampai</label>
                  <Input
                    type="date"
                    value={reportPeriodTo}
                    onChange={(e) => setReportPeriodTo(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <Button size="sm" onClick={() => refetchReport()}>
              <Chart className="h-4 w-4" />
              Tampilkan Laporan
            </Button>

            {reportData && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-sky-50 p-3">
                    <p className="text-xs text-sky-600">Total Debit</p>
                    <p className="text-lg font-bold text-sky-800">{formatMinor(reportData.totalDebit)}</p>
                  </div>
                  <div className="rounded-lg bg-clay-50 p-3">
                    <p className="text-xs text-clay-600">Total Kredit</p>
                    <p className="text-lg font-bold text-clay-800">{formatMinor(reportData.totalCredit)}</p>
                  </div>
                </div>

                {reportData.rows.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-wood-200 text-text-tertiary">
                          <th className="text-left py-2 font-medium">{dimensionTypeLabel(activeTab)}</th>
                          <th className="text-right py-2 font-medium">Debit</th>
                          <th className="text-right py-2 font-medium">Kredit</th>
                          <th className="text-right py-2 font-medium">Net</th>
                          <th className="text-right py-2 font-medium">Transaksi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reportData.rows.map((row) => (
                          <tr key={row.dimensionId} className="border-b border-wood-100 hover:bg-wood-50/50">
                            <td className="py-2">
                              <p className="font-medium text-text-primary">{row.dimensionName}</p>
                              <p className="text-xs text-text-tertiary">{row.dimensionCode}</p>
                            </td>
                            <td className="py-2 text-right text-text-primary">{formatMinor(row.totalDebit)}</td>
                            <td className="py-2 text-right text-text-primary">{formatMinor(row.totalCredit)}</td>
                            <td className={`py-2 text-right font-medium ${row.netAmount >= 0 ? "text-leaf-600" : "text-clay-600"}`}>
                              {formatMinor(row.netAmount)}
                            </td>
                            <td className="py-2 text-right text-text-secondary">{row.transactionCount}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-text-tertiary text-center py-4">
                    Tidak ada aktivitas untuk periode ini.
                  </p>
                )}
              </div>
            )}
          </div>
        </ModalContent>
        <ModalFooter>
          <Button variant="outline" onClick={() => setShowReportModal(false)}>Tutup</Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
