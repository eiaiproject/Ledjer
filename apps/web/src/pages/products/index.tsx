import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Package, Edit2, Trash2, Search, Download, AlertTriangle, Check, X } from "lucide-react";
import { useOrganization, useOrgPermissions } from "@/hooks/useOrganization";
import { queryKeys } from "@/lib/query-keys";
import { cn, formatAmountInput, formatIDR, formatNumber, parseAmountInput } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Modal, ModalContent, ModalFooter } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { translateError } from "@/lib/errors";
import { toast } from "@/components/ui/toast";
import { exportProductsCsv } from "@/lib/csv-export";
import {
  createProduct,
  deactivateProduct,
  listProducts,
  updateProduct,
  type Product,
} from "@/lib/api/products";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

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

/** Stock status badge */
function StockBadge({ product }: { readonly product: Product }) {
  const stock = product.current_stock ?? 0;
  const minStock = product.min_stock ?? 0;
  
  if (stock <= 0) {
    return (
      <Badge variant="error" size="sm">
        <X className="h-3 w-3" />
        Stok habis
      </Badge>
    );
  }
  if (minStock > 0 && stock <= minStock) {
    return (
      <Badge variant="warning" size="sm">
        <AlertTriangle className="h-3 w-3" />
        Stok menipis
      </Badge>
    );
  }
  return (
    <Badge variant="success" size="sm">
      <Check className="h-3 w-3" />
      Stok aman
    </Badge>
  );
}

/** Margin indicator */
function MarginIndicator({ purchase, selling }: { readonly purchase: number; readonly selling: number }) {
  const margin = selling - purchase;
  const pct = purchase > 0 ? Math.round((margin / purchase) * 100) : 0;
  const isPositive = margin > 0;
  
  return (
    <span className={cn("text-xs font-medium", isPositive ? "text-leaf-600" : "text-clay-600")}>
      {isPositive ? "+" : ""}{formatIDR(margin)} / {pct}%
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export function ProductsPage() {
  const { data: orgData } = useOrganization();
  const { canManageProducts, canCreateExports } = useOrgPermissions();
  const queryClient = useQueryClient();
  const onboardingCompleted = orgData?.organization?.onboarding_status === 'completed';

  const [search, setSearch] = useState("");
  const [stockFilter, setStockFilter] = useState<"all" | "in_stock" | "low" | "out">("all");
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
      return listProducts();
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
        sellingPrice: data.selling_price,
        minStock: data.min_stock,
      };

      if (editingProduct) {
        await updateProduct(editingProduct.id, basePayload);
      } else {
        await createProduct({
          ...basePayload,
          purchasePrice: data.purchase_price,
          currentStock: data.current_stock,
        });
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
      await deactivateProduct(product.id);
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

  const handleExport = async () => {
    if (!orgData?.organization?.id) return;
    try {
      await exportProductsCsv();
      toast.success("Export CSV produk dimulai");
    } catch (err) {
      toast.error(translateError(err));
    }
  };

  const getStockStatus = (p: Product): "in_stock" | "low" | "out" => {
    const stock = p.current_stock ?? 0;
    const minStock = p.min_stock ?? 0;
    if (stock <= 0) return "out";
    if (minStock > 0 && stock <= minStock) return "low";
    return "in_stock";
  };

  const filteredProducts = (products || []).filter((p) => {
    // Search filter
    if (search) {
      const q = search.toLowerCase();
      if (!p.code.toLowerCase().includes(q) && !p.name.toLowerCase().includes(q)) {
        return false;
      }
    }
    // Stock filter
    if (stockFilter !== "all") {
      if (getStockStatus(p) !== stockFilter) return false;
    }
    return true;
  });

  if (error) return <ErrorState error={error} onRetry={refetch} />;

  return (
    <div className="ledger-page space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Produk</h1>
          <p className="text-sm text-text-secondary mt-1">Kelola produk dan stok</p>
        </div>
        <div className="flex items-center gap-2">
          {canCreateExports && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void handleExport()}
              disabled={!products?.length}
              className="hidden sm:inline-flex"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
          )}
          {canCreateExports && (
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => void handleExport()}
              disabled={!products?.length}
              className="sm:hidden min-h-[44px] min-w-[44px]"
              aria-label="Export CSV"
            >
              <Download className="h-4 w-4" />
            </Button>
          )}
          {canManageProducts && (
            <Button onClick={openCreateModal} className="min-h-[44px]">
              <Plus className="h-4 w-4" />
              Tambah Produk
            </Button>
          )}
        </div>
      </div>

      {/* Search — always visible */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-wood-400" />
        <input
          type="text"
          placeholder="Cari kode atau nama produk..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-11 min-h-[44px] w-full rounded-lg border border-wood-200 bg-surface pl-10 pr-4 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-2 focus:outline-offset-2 focus:outline-wood-500 sm:h-10 sm:min-h-0"
        />
      </div>

      {/* Stock filter */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-text-secondary">Stok:</span>
        {(["all", "in_stock", "low", "out"] as const).map((filter) => (
          <Button
            key={filter}
            type="button"
            variant={stockFilter === filter ? "primary" : "outline"}
            size="sm"
            onClick={() => setStockFilter(filter)}
            className="min-h-[36px]"
          >
            {filter === "all" && "Semua"}
            {filter === "in_stock" && "Aman"}
            {filter === "low" && "Menipis"}
            {filter === "out" && "Habis"}
          </Button>
        ))}
      </div>

      {/* Content */}
      {isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
        </div>
      )}
      {!isLoading && !products?.length && (
        /* Empty state — no products at all */
        <div className="flex min-h-[320px] items-center justify-center p-8">
          <div className="mx-auto max-w-sm text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-wood-200 text-wood-400">
              <Package className="h-7 w-7" />
            </div>
            <h3 className="mt-4 text-base font-semibold text-text-primary">Belum ada produk</h3>
            <p className="mt-1 text-sm text-text-secondary">Tambahkan produk pertama untuk melacak stok dan HPP.</p>
            {canManageProducts && (
              <Button onClick={openCreateModal} className="mt-4 min-h-[44px]">
                <Plus className="h-4 w-4" />
                Tambah Produk Pertama
              </Button>
            )}
          </div>
        </div>
      )}
      {!isLoading && products?.length && !filteredProducts.length && (
        /* No results — filters active but no match */
        <div className="flex min-h-[240px] items-center justify-center p-8">
          <div className="mx-auto max-w-sm text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-wood-200 text-wood-400">
              <Search className="h-6 w-6" />
            </div>
            <h3 className="mt-3 text-base font-semibold text-text-primary">Tidak ada produk yang cocok</h3>
            <p className="mt-1 text-sm text-text-secondary">Coba ubah filter atau kata kunci pencarian.</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => { setSearch(""); setStockFilter("all"); }}
            >
              Reset filter
            </Button>
          </div>
        </div>
      )}
      {!isLoading && filteredProducts.length > 0 && (
        <>
          {/* Mobile: Card stack */}
          <div className="divide-y divide-wood-100 rounded-xl border border-wood-200 bg-surface-elevated lg:hidden">
            {filteredProducts.map((product) => (
              <div key={product.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-xs text-wood-500">{product.code}</p>
                    <h2 className="mt-0.5 line-clamp-1 break-words text-sm font-semibold text-text-primary">
                      {product.name}
                    </h2>
                  </div>
                  <StockBadge product={product} />
                </div>
                
                <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-xs text-text-tertiary">Beli</p>
                    <p className="num-mono font-medium text-text-secondary">{formatIDR(product.purchase_price)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-text-tertiary">Jual</p>
                    <p className="num-mono font-semibold text-text-primary">{formatIDR(product.selling_price)}</p>
                  </div>
                </div>
                
                <div className="mt-2 flex items-center justify-between">
                  <MarginIndicator purchase={product.purchase_price ?? 0} selling={product.selling_price ?? 0} />
                  <span className="num-mono text-xs text-text-tertiary">
                    Stok: {formatNumber(product.current_stock)} {product.unit || "pcs"}
                  </span>
                </div>
                
                {canManageProducts && (
                  <div className="mt-3 flex justify-end gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => openEditModal(product)} className="min-h-[44px] min-w-[44px]">
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => { setSelectedProduct(product); setDeleteDialogOpen(true); }}
                      className="min-h-[44px] min-w-[44px] text-error hover:bg-error-bg"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Desktop: Table */}
          <div className="hidden lg:block rounded-xl border border-wood-200 bg-surface-elevated overflow-hidden">
            <table className="w-full text-sm">
              <thead className="border-b border-wood-100 bg-cream-100/50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-wood-600">Kode</th>
                  <th className="px-4 py-3 text-left font-medium text-wood-600">Nama</th>
                  <th className="px-4 py-3 text-center font-medium text-wood-600">Status Stok</th>
                  <th className="px-4 py-3 text-right font-medium text-wood-600">Harga Beli</th>
                  <th className="px-4 py-3 text-right font-medium text-wood-600">Harga Jual</th>
                  <th className="px-4 py-3 text-right font-medium text-wood-600">Margin</th>
                  {canManageProducts && <th className="px-4 py-3 text-center font-medium text-wood-600">Aksi</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-wood-50">
                {filteredProducts.map((product) => (
                  <tr key={product.id} className="transition-colors hover:bg-cream-50">
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-wood-600">{product.code}</td>
                    <td className="min-w-[200px] max-w-[320px] px-4 py-3">
                      <div className="break-words font-medium text-wood-800">{product.name}</div>
                      {product.description && (
                        <div className="line-clamp-1 break-words text-xs text-wood-500">{product.description}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <StockBadge product={product} />
                        <span className="num-mono text-xs text-wood-500">
                          {formatNumber(product.current_stock)} {product.unit || "pcs"}
                        </span>
                        {(product.min_stock ?? 0) > 0 && (
                          <span className="text-xs text-wood-400">Min: {formatNumber(product.min_stock)}</span>
                        )}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right num-mono text-wood-600">
                      {formatIDR(product.purchase_price)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right num-mono font-medium text-wood-800">
                      {formatIDR(product.selling_price)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <MarginIndicator purchase={product.purchase_price ?? 0} selling={product.selling_price ?? 0} />
                    </td>
                    {canManageProducts && (
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditModal(product)}
                            aria-label="Edit produk"
                            className="min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 text-wood-500 hover:text-wood-600"
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => { setSelectedProduct(product); setDeleteDialogOpen(true); }}
                            aria-label="Hapus produk"
                            className="min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 text-wood-500 hover:text-error hover:bg-error-bg"
                          >
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
            />
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
            />
            {!editingProduct && !onboardingCompleted && (
              <Input label="Stok Awal" type="number" min={0} value={formData.current_stock || ""} onChange={(e) => updateFormField("current_stock", Number(e.target.value))} placeholder="0" error={formErrors.current_stock} disabled={formBusy} />
            )}
            {!editingProduct && onboardingCompleted && (
              <div className="rounded-lg bg-cream-100 px-4 py-3 text-xs text-text-tertiary">
                Stok ditambahkan otomatis melalui alur pembelian atau stok resmi.
              </div>
            )}
            <Input label="Stok Minimum" type="number" min={0} value={formData.min_stock || ""} onChange={(e) => updateFormField("min_stock", Number(e.target.value))} placeholder="0" error={formErrors.min_stock} disabled={formBusy} helperText="Ketika stok tersisa sampai angka ini, produk akan ditandai stok menipis." />
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
