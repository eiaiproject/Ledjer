import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Package, Edit2, Trash2, Search, Download } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useOrganization, useOrgPermissions } from "@/hooks/useOrganization";
import { queryKeys } from "@/lib/query-keys";
import { exportProductsCsv } from "@/lib/csv-export";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { PageSpinner } from "@/components/ui/spinner";
import { Modal, ModalContent, ModalFooter } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { formatAmountInput, formatIDR, formatNumber, parseAmountInput } from "@/lib/utils";
import { translateError } from "@/lib/errors";
import { toast } from "@/components/ui/toast-api";

interface Product {
  id: string;
  code: string;
  name: string;
  description: string | null;
  current_stock: number | null;
  min_stock: number | null;
  unit: string | null;
  purchase_price: number | null;
  selling_price: number | null;
  is_active: boolean | null;
}

interface ProductFormData {
  code: string;
  name: string;
  description: string;
  unit: string;
  purchase_price: number;
  selling_price: number;
  current_stock: number;
  min_stock: number;
}

const UNITS = ["pcs", "kg", "liter", "meter", "box", "pack", "roll", "pair", "set", "other"];
type ProductFormErrors = Partial<Record<keyof ProductFormData, string>>;

export function ProductsPage() {
  const { data: orgData } = useOrganization();
  const { canManageProducts } = useOrgPermissions();
  const queryClient = useQueryClient();
  const onboardingCompleted = orgData?.organization?.onboarding_status === 'completed';

  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [formData, setFormData] = useState<ProductFormData>({
    code: "",
    name: "",
    description: "",
    unit: "pcs",
    purchase_price: 0,
    selling_price: 0,
    current_stock: 0,
    min_stock: 0,
  });
  const [formErrors, setFormErrors] = useState<ProductFormErrors>({});
  const [loading, setLoading] = useState(false);

  const { data: products, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.products.fullList(orgData?.organization?.id ?? ""),
    queryFn: async () => {
      if (!orgData?.organization?.id) return [];
      const { data, error } = await supabase
        .from("products")
        .select("id, code, name, description, unit, purchase_price, selling_price, current_stock, min_stock, is_active")
        .eq("organization_id", orgData.organization.id)
        .eq("is_active", true)
        .order("code");
      if (error) throw error;
      return data;
    },
    enabled: !!orgData?.organization?.id,
  });

  const saveMutation = useMutation({
    mutationFn: async (data: ProductFormData) => {
      if (!orgData?.organization?.id) throw new Error("Organisasi tidak ditemukan");
      
      const basePayload = {
        code: data.code.trim(),
        name: data.name.trim(),
        description: data.description.trim() || null,
        unit: data.unit,
        selling_price: data.selling_price,
        min_stock: data.min_stock,
        is_active: true,
      };

      if (editingProduct) {
        const { error } = await supabase
          .from("products")
          .update(basePayload)
          .eq("id", editingProduct.id)
          .eq("organization_id", orgData.organization.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("products")
          .insert({
            ...basePayload,
            purchase_price: data.purchase_price,
            organization_id: orgData.organization.id,
            current_stock: data.current_stock,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all(orgData?.organization?.id ?? "") });
      toast.success(editingProduct ? "Produk berhasil diperbarui" : "Produk berhasil ditambahkan");
      setModalOpen(false);
      setEditingProduct(null);
      resetForm();
    },
    onError: (err) => toast.error(translateError(err)),
    onSettled: () => setLoading(false),
  });
  const formBusy = loading || saveMutation.isPending;

  const deleteMutation = useMutation({
    mutationFn: async (product: Product) => {
      if (!orgData?.organization?.id) throw new Error("Organisasi tidak ditemukan");
      const { error } = await supabase
        .from("products")
        .update({ is_active: false })
        .eq("id", product.id)
        .eq("organization_id", orgData.organization.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all(orgData?.organization?.id ?? "") });
      toast.success("Produk dinonaktifkan");
      setDeleteDialogOpen(false);
      setSelectedProduct(null);
    },
    onError: (err) => toast.error(translateError(err)),
  });

  const resetForm = () => {
    setFormData({
      code: "",
      name: "",
      description: "",
      unit: "pcs",
      purchase_price: 0,
      selling_price: 0,
      current_stock: 0,
      min_stock: 0,
    });
    setFormErrors({});
  };

  const updateFormField = <K extends keyof ProductFormData>(field: K, value: ProductFormData[K]) => {
    setFormData((current) => ({ ...current, [field]: value }));
    setFormErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const validateForm = () => {
    const errors: ProductFormErrors = {};
    if (!formData.code.trim()) errors.code = "Kode produk wajib diisi.";
    if (formData.code.trim().length > 40) errors.code = "Kode produk maksimal 40 karakter.";
    if (!formData.name.trim()) errors.name = "Nama produk wajib diisi.";
    if (formData.name.trim().length > 120) errors.name = "Nama produk maksimal 120 karakter.";
    if (formData.description.length > 500) errors.description = "Deskripsi maksimal 500 karakter.";
    if (!formData.unit.trim()) errors.unit = "Satuan wajib dipilih.";
    if (formData.purchase_price < 0) errors.purchase_price = "Harga beli tidak boleh negatif.";
    if (formData.selling_price < 0) errors.selling_price = "Harga jual tidak boleh negatif.";
    if (formData.current_stock < 0) errors.current_stock = "Stok awal tidak boleh negatif.";
    if (formData.min_stock < 0) errors.min_stock = "Stok minimum tidak boleh negatif.";
    return errors;
  };

  const openCreateModal = () => {
    resetForm();
    setEditingProduct(null);
    setModalOpen(true);
  };

  const openEditModal = (product: Product) => {
    setFormErrors({});
    setFormData({
      code: product.code,
      name: product.name,
      description: product.description || "",
      unit: product.unit || "pcs",
      purchase_price: product.purchase_price ?? 0,
      selling_price: product.selling_price ?? 0,
      current_stock: product.current_stock ?? 0,
      min_stock: product.min_stock ?? 0,
    });
    setEditingProduct(product);
    setModalOpen(true);
  };

  const handleSave = () => {
    if (formBusy) return;
    const errors = validateForm();
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      toast.error("Periksa kembali data produk.");
      return;
    }
    setLoading(true);
    saveMutation.mutate(formData);
  };

  const handleExport = () => {
    if (!orgData?.organization?.id) return;
    exportProductsCsv(orgData.organization.id).catch((err) => toast.error(translateError(err)));
  };

  const filteredProducts = (products || []).filter((p) =>
    !search ||
    p.code.toLowerCase().includes(search.toLowerCase()) ||
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.description?.toLowerCase().includes(search.toLowerCase())
  );

  if (error) return <ErrorState error={error} onRetry={refetch} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Produk</h1>
          <p className="text-sm text-text-secondary mt-1">Kelola produk dan stok</p>
        </div>
        {canManageProducts && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button type="button" variant="outline" onClick={handleExport} disabled={!products?.length}>
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
            <Button onClick={openCreateModal}>
              <Plus className="h-4 w-4" />
              Tambah Produk
            </Button>
          </div>
        )}
      </div>

      <Input
        aria-label="Cari produk"
        placeholder="Cari kode atau nama produk..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        leftIcon={<Search className="h-4 w-4" />}
      />

      {isLoading ? (
        <PageSpinner />
      ) : filteredProducts.length === 0 ? (
        <EmptyState
          icon={<Package className="h-8 w-8 text-wood-400" />}
          title="Belum ada produk"
          description="Tambahkan produk pertama untuk melacak stok dan HPP."
          action={canManageProducts ? <Button onClick={openCreateModal}><Plus className="h-4 w-4" /> Tambah Produk</Button> : undefined}
        />
      ) : (
        <>
          <div className="space-y-3 sm:hidden">
            {filteredProducts.map((product) => (
              <Card key={product.id}>
                <CardContent>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-words font-mono text-xs text-text-tertiary">{product.code}</p>
                      <h2 className="mt-1 line-clamp-2 break-words text-sm font-semibold text-text-primary">{product.name}</h2>
                      {product.description && <p className="mt-1 line-clamp-2 text-xs text-text-tertiary">{product.description}</p>}
                    </div>
                    <Badge variant={(product.current_stock ?? 0) <= (product.min_stock ?? 0) ? "warning" : "success"} className="shrink-0">
                      {formatNumber(product.current_stock)} {product.unit || "pcs"}
                    </Badge>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-text-tertiary">Harga Beli</p>
                      <p className="num-mono font-medium text-text-secondary">{formatIDR(product.purchase_price)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-text-tertiary">Harga Jual</p>
                      <p className="num-mono font-semibold text-text-primary">{formatIDR(product.selling_price)}</p>
                    </div>
                  </div>
                  {canManageProducts && (
                    <div className="mt-4 flex justify-end gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => openEditModal(product)}>
                        <Edit2 className="h-4 w-4" />
                        Edit
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => { setSelectedProduct(product); setDeleteDialogOpen(true); }} className="text-error hover:bg-error-bg">
                        <Trash2 className="h-4 w-4" />
                        Hapus
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="hidden overflow-hidden sm:block">
            <div className="overflow-x-auto">
              <table className="min-w-[900px] w-full text-sm">
              <thead>
                <tr className="border-b border-wood-100">
                  <th className="px-4 py-3 text-left font-medium text-wood-600">Kode</th>
                  <th className="px-4 py-3 text-left font-medium text-wood-600">Nama</th>
                  <th className="px-4 py-3 text-center font-medium text-wood-600">Stok</th>
                  <th className="px-4 py-3 text-right font-medium text-wood-600">Harga Beli</th>
                  <th className="px-4 py-3 text-right font-medium text-wood-600">Harga Jual</th>
                  {canManageProducts && <th className="px-4 py-3 text-center font-medium text-wood-600">Aksi</th>}
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((product) => (
                  <tr key={product.id} className="border-b border-wood-50 transition-colors hover:bg-cream-100/50">
                    <td className="max-w-[160px] break-words px-4 py-3 font-mono text-wood-600">{product.code}</td>
                    <td className="min-w-[220px] max-w-[360px] px-4 py-3">
                      <div className="break-words font-medium text-wood-800">{product.name}</div>
                      {product.description && <div className="line-clamp-2 break-words text-xs text-wood-500">{product.description}</div>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant={(product.current_stock ?? 0) <= (product.min_stock ?? 0) ? "warning" : "success"}>
                        {formatNumber(product.current_stock)} {product.unit || "pcs"}
                      </Badge>
                      {(product.min_stock ?? 0) > 0 && (
                        <div className="mt-1 text-xs text-wood-500">Min {formatNumber(product.min_stock)}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-wood-600">{formatIDR(product.purchase_price)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-wood-800 font-medium">{formatIDR(product.selling_price)}</td>
                    {canManageProducts && (
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button type="button" variant="ghost" size="icon" onClick={() => openEditModal(product)} aria-label="Edit produk" className="h-10 w-10 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 text-wood-500 hover:text-wood-600">
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button type="button" variant="ghost" size="icon" onClick={() => { setSelectedProduct(product); setDeleteDialogOpen(true); }} aria-label="Hapus produk" className="h-10 w-10 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 text-wood-500 hover:text-error hover:bg-error-bg">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {/* Create/Edit Modal */}
      <Modal open={modalOpen} onClose={formBusy ? () => {} : () => setModalOpen(false)} title={editingProduct ? "Edit Produk" : "Tambah Produk"} size="md">
        <ModalContent>
          <div className="space-y-4">
            <Input label="Kode Produk" value={formData.code} onChange={(e) => updateFormField("code", e.target.value)} placeholder="e.g., PRD-001" error={formErrors.code} maxLength={40} disabled={formBusy} />
            <Input label="Nama Produk" value={formData.name} onChange={(e) => updateFormField("name", e.target.value)} placeholder="Nama produk" error={formErrors.name} maxLength={120} disabled={formBusy} />
            <Input label="Deskripsi" value={formData.description} onChange={(e) => updateFormField("description", e.target.value)} placeholder="Detail singkat produk" error={formErrors.description} maxLength={500} disabled={formBusy} />
            <Select
              label="Satuan"
              value={formData.unit}
              onChange={(e) => updateFormField("unit", e.target.value)}
              options={UNITS.map((u) => ({ value: u, label: u }))}
              error={formErrors.unit}
              disabled={formBusy}
            />
            <Input
              label={editingProduct ? "Biaya Rata-rata" : "Harga Beli"}
              value={formatAmountInput(formData.purchase_price)}
              onChange={(e) => updateFormField("purchase_price", parseAmountInput(e.target.value, 0) ?? 0)}
              readOnly={!!editingProduct}
              isCurrency
              error={formErrors.purchase_price}
              disabled={formBusy}
              aria-describedby={formErrors.purchase_price ? "purchase-price-error" : undefined}
            />
            {formErrors.purchase_price && (
              <p id="purchase-price-error" className="mt-1 text-xs text-error" role="alert">
                {formErrors.purchase_price}
              </p>
            )}
            {editingProduct && (
              <p className="text-xs text-text-tertiary">Dihitung otomatis dari pembelian stok.</p>
            )}
            <Input
              label="Harga Jual"
              value={formatAmountInput(formData.selling_price)}
              onChange={(e) => updateFormField("selling_price", parseAmountInput(e.target.value, 0) ?? 0)}
              isCurrency
              error={formErrors.selling_price}
              disabled={formBusy}
              aria-describedby={formErrors.selling_price ? "selling-price-error" : undefined}
            />
            {formErrors.selling_price && (
              <p id="selling-price-error" className="mt-1 text-xs text-error" role="alert">
                {formErrors.selling_price}
              </p>
            )}
            {!editingProduct && !onboardingCompleted && (
              <Input label="Stok Awal" type="number" min={0} value={formData.current_stock || ""} onChange={(e) => updateFormField("current_stock", Number(e.target.value))} placeholder="0" error={formErrors.current_stock} disabled={formBusy} />
            )}
            {!editingProduct && onboardingCompleted && (
              <div className="rounded-lg bg-cream-100 px-4 py-3 text-xs text-text-tertiary">
                Stok ditambahkan otomatis melalui alur pembelian atau stok resmi.
              </div>
            )}
            <Input label="Stok Minimum" type="number" min={0} value={formData.min_stock || ""} onChange={(e) => updateFormField("min_stock", Number(e.target.value))} placeholder="0" error={formErrors.min_stock} disabled={formBusy} />
          </div>
        </ModalContent>
        <ModalFooter>
          <Button variant="ghost" onClick={() => setModalOpen(false)} disabled={formBusy}>Batal</Button>
          <Button onClick={handleSave} loading={formBusy} disabled={formBusy}>{editingProduct ? "Simpan" : "Tambah"}</Button>
        </ModalFooter>
      </Modal>

      <ConfirmDialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={() => selectedProduct && deleteMutation.mutate(selectedProduct)}
        title="Nonaktifkan Produk?"
        message={`Produk "${selectedProduct?.name}" akan dinonaktifkan dan tidak muncul sebagai produk aktif. Riwayat transaksi tetap dipertahankan.`}
        confirmLabel="Ya, Nonaktifkan"
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
