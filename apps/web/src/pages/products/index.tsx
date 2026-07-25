import { useCallback, useId, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Package, Edit2, Trash2, Search, Download, AlertTriangle, Check, X } from "reicon-react";
import { useOrganization, useOrgPermissions } from "@/hooks/useOrganization";
import { queryKeys } from "@/lib/query-keys";
import { cn, formatAmountInput, formatIDR, formatNumber, parseAmountInput } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
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
  adjustStock,
  recordStockCount,
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

type StockFilter = "all" | "in_stock" | "low" | "out";

function getStockStatus(p: Product): StockFilter {
  const stock = p.current_stock ?? 0;
  const minStock = p.min_stock ?? 0;
  if (stock <= 0) return "out";
  if (minStock > 0 && stock <= minStock) return "low";
  return "in_stock";
}



/** Stock status badge — text + icon, never color-only */
function StockBadge({ product }: { readonly product: Product }) {
  const status = getStockStatus(product);

  if (status === "out") {
    return (
      <Badge variant="error" size="sm">
        <X className="h-3 w-3" aria-hidden="true" />
        Stok habis
      </Badge>
    );
  }
  if (status === "low") {
    return (
      <Badge variant="warning" size="sm">
        <AlertTriangle className="h-3 w-3" aria-hidden="true" />
        Stok menipis
      </Badge>
    );
  }
  return (
    <Badge variant="success" size="sm">
      <Check className="h-3 w-3" aria-hidden="true" />
      Stok aman
    </Badge>
  );
}

/**
 * Markup calculation: (selling - purchase) / purchase × 100
 * The denominator is purchase price, so this is markup, not margin.
 */
function MarkupIndicator({ purchase, selling }: { readonly purchase: number; readonly selling: number }) {
  const diff = selling - purchase;
  const pct = purchase > 0 ? Math.round((diff / purchase) * 100) : 0;
  const isPositive = diff > 0;
  const isNegative = diff < 0;

  const colorClass = (() => {
    if (isPositive) return "text-leaf-600";
    if (isNegative) return "text-error";
    return "text-text-tertiary";
  })();

  return (
    <span className={cn("text-xs font-medium", colorClass)}>
      {isPositive ? "+" : ""}{formatIDR(diff)} / {pct}%
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Product form hook                                                  */
/* ------------------------------------------------------------------ */

const EMPTY_FORM: ProductFormData = {
  code: "", name: "", description: "", unit: "pcs",
  purchase_price: 0, selling_price: 0, current_stock: 0, min_stock: 0,
};

function useProductForm() {
  const [formData, setFormData] = useState<ProductFormData>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<ProductFormErrors>({});

  const resetForm = useCallback(() => { setFormData(EMPTY_FORM); setFormErrors({}); }, []);

  const setField = useCallback(<K extends keyof ProductFormData>(field: K, value: ProductFormData[K]) => {
    setFormData((c) => ({ ...c, [field]: value }));
    setFormErrors((c) => {
      if (!c[field]) return c;
      const n = { ...c };
      delete n[field];
      return n;
    });
  }, []);

  const validate = useCallback(() => {
    const e: ProductFormErrors = {};
    if (!formData.code.trim()) e.code = "Kode produk wajib diisi.";
    else if (formData.code.trim().length > 40) e.code = "Kode produk maksimal 40 karakter.";
    if (!formData.name.trim()) e.name = "Nama produk wajib diisi.";
    else if (formData.name.trim().length > 120) e.name = "Nama produk maksimal 120 karakter.";
    if (formData.description.length > 500) e.description = "Deskripsi maksimal 500 karakter.";
    if (!formData.unit.trim()) e.unit = "Satuan wajib dipilih.";
    if (formData.purchase_price < 0) e.purchase_price = "Harga beli tidak boleh negatif.";
    if (formData.selling_price < 0) e.selling_price = "Harga jual tidak boleh negatif.";
    if (formData.current_stock < 0) e.current_stock = "Stok awal tidak boleh negatif.";
    if (formData.min_stock < 0) e.min_stock = "Stok minimum tidak boleh negatif.";
    return e;
  }, [formData]);

  const loadProduct = useCallback((product: Product) => {
    setFormErrors({});
    setFormData({
      code: product.code, name: product.name, description: product.description || "",
      unit: product.unit || "pcs", purchase_price: product.purchase_price ?? 0,
      selling_price: product.selling_price ?? 0, current_stock: product.current_stock ?? 0,
      min_stock: product.min_stock ?? 0,
    });
  }, []);

  return { formData, formErrors, setFormErrors, resetForm, setField, validate, loadProduct };
}

/* ------------------------------------------------------------------ */
/*  Product mutations hook                                             */
/* ------------------------------------------------------------------ */

function useProductMutations({ orgId, form, editingProduct, setEditingProduct, setModalOpen, setDeleteDialogOpen, setSelectedProduct }: {
  orgId: string | undefined;
  form: ReturnType<typeof useProductForm>;
  editingProduct: Product | null;
  setEditingProduct: (p: Product | null) => void;
  setModalOpen: (v: boolean) => void;
  setDeleteDialogOpen: (v: boolean) => void;
  setSelectedProduct: (p: Product | null) => void;
}) {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);

  const saveMutation = useMutation({
    mutationFn: async (data: ProductFormData) => {
      if (!orgId) throw new Error("Organisasi tidak ditemukan");
      const basePayload = {
        code: data.code.trim(), name: data.name.trim(),
        description: data.description.trim() || null, unit: data.unit,
        sellingPrice: data.selling_price, minStock: data.min_stock,
      };
      if (editingProduct) {
        await updateProduct(editingProduct.id, basePayload);
      } else {
        await createProduct({ ...basePayload, purchasePrice: data.purchase_price, currentStock: data.current_stock });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all(orgId ?? "") });
      toast.success(editingProduct ? "Produk berhasil diperbarui." : "Produk berhasil ditambahkan.");
      setModalOpen(false); setEditingProduct(null); form.resetForm();
    },
    onError: (err) => toast.error(translateError(err)),
    onSettled: () => setLoading(false),
  });

  const deleteMutation = useMutation({
    mutationFn: async (product: Product) => {
      if (!orgId) throw new Error("Organisasi tidak ditemukan");
      await deactivateProduct(product.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all(orgId ?? "") });
      toast.success("Produk berhasil dinonaktifkan.");
      setDeleteDialogOpen(false); setSelectedProduct(null);
    },
    onError: (err) => toast.error(translateError(err)),
  });

  return { loading, setLoading, saveMutation, deleteMutation };
}

/* ------------------------------------------------------------------ */
/*  Filter component (reduce cognitive complexity)                    */
/* ------------------------------------------------------------------ */

function StockAdjustmentModal({ open, onClose, product, onSuccess }: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly product: Product | null;
  readonly onSuccess: () => void;
}) {
  const [quantity, setQuantity] = useState(0);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!product || !reason.trim()) return;
    if (quantity === 0) { setError("Jumlah penyesuaian tidak boleh 0."); return; }
    setLoading(true);
    setError(null);
    try {
      await adjustStock({ productId: product.id, quantity, reason: reason.trim() });
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyesuaikan stok");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={loading ? () => {} : onClose}
      title={`Penyesuaian Stok — ${product?.name ?? ""}`} size="sm">
      <ModalContent>
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">
            Stok saat ini: <strong className="text-text-primary">{product?.current_stock ?? 0}</strong> {product?.unit || "pcs"}
          </p>
          <Input
            label="Jumlah Penyesuaian"
            type="number"
            value={quantity || ""}
            onChange={(e) => setQuantity(Number(e.target.value))}
            helperText="Nilai positif = tambah stok, negatif = kurangi stok"
            disabled={loading}
          />
          <Input
            label="Alasan"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g., Stok rusak, kelebihan stok, hilang..."
            maxLength={500}
            disabled={loading}
            helperText="Alasan wajib diisi untuk audit trail"
          />
          {error && (
            <div className="rounded-md bg-error/10 p-3 text-sm text-error" role="alert">{error}</div>
          )}
        </div>
      </ModalContent>
      <ModalFooter>
        <Button variant="ghost" onClick={onClose} disabled={loading}>Batal</Button>
        <Button onClick={handleSubmit} loading={loading} disabled={loading || !reason.trim()}>
          Simpan Penyesuaian
        </Button>
      </ModalFooter>
    </Modal>
  );
}

function StockCountModal({ open, onClose, product, onSuccess }: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly product: Product | null;
  readonly onSuccess: () => void;
}) {
  const [physicalStock, setPhysicalStock] = useState(0);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ systemStock: string; physicalStock: string; difference: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCount = async () => {
    if (!product) return;
    setLoading(true);
    setError(null);
    try {
      const res = await recordStockCount({
        productId: product.id,
        physicalStock,
        notes: notes.trim() || undefined,
      });
      setResult({
        systemStock: res.systemStock,
        physicalStock: res.physicalStock,
        difference: res.difference,
      });
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mencatat stok fisik");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={loading ? () => {} : onClose}
      title={`Stok Opname — ${product?.name ?? ""}`} size="sm">
      <ModalContent>
        <div className="space-y-4">
          {!result ? (
            <>
              <p className="text-sm text-text-secondary">
                Stok sistem: <strong className="text-text-primary">{product?.current_stock ?? 0}</strong> {product?.unit || "pcs"}
              </p>
              <Input
                label="Stok Fisik"
                type="number"
                min={0}
                value={physicalStock || ""}
                onChange={(e) => setPhysicalStock(Number(e.target.value))}
                disabled={loading}
              />
              <Input
                label="Catatan (opsional)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g., Hasil hitung manual gudang"
                maxLength={500}
                disabled={loading}
              />
              {error && (
                <div className="rounded-md bg-error/10 p-3 text-sm text-error" role="alert">{error}</div>
              )}
            </>
          ) : (
            <div className="space-y-3 rounded-lg border border-wood-200 bg-cream-50 p-4">
              <p className="text-sm font-medium text-wood-800">Hasil Perbandingan</p>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-xs text-text-tertiary">Sistem</p>
                  <p className="num-mono text-lg font-bold text-wood-700">{result.systemStock}</p>
                </div>
                <div>
                  <p className="text-xs text-text-tertiary">Fisik</p>
                  <p className="num-mono text-lg font-bold text-leaf-700">{result.physicalStock}</p>
                </div>
                <div>
                  <p className="text-xs text-text-tertiary">Selisih</p>
                  <p className={`num-mono text-lg font-bold ${Number(result.difference) === 0 ? "text-wood-500" : Number(result.difference) > 0 ? "text-leaf-600" : "text-error"}`}>
                    {result.difference}
                  </p>
                </div>
              </div>
              <p className="text-xs text-text-tertiary">
                {Number(result.difference) === 0
                  ? "Stok fisik sesuai dengan sistem."
                  : `Gunakan fitur Penyesuaian Stok untuk menyelaraskan stok.`}
              </p>
            </div>
          )}
        </div>
      </ModalContent>
      <ModalFooter>
        {!result ? (
          <>
            <Button variant="ghost" onClick={onClose} disabled={loading}>Batal</Button>
            <Button onClick={handleCount} loading={loading} disabled={loading}>
              Catat Stok Fisik
            </Button>
          </>
        ) : (
          <Button onClick={onClose}>Tutup</Button>
        )}
      </ModalFooter>
    </Modal>
  );
}

function ProductFilter({ search, setSearch, stockFilter, setStockFilter, searchInputRef, hasSearch, hasFilter, stockCounts, filterGroupId, onClearSearch, onResetAll, allProducts, filterLabels, filterValues }: {
  readonly search: string;
  readonly setSearch: (v: string) => void;
  readonly stockFilter: StockFilter;
  readonly setStockFilter: (v: StockFilter) => void;
  readonly searchInputRef: React.RefObject<HTMLInputElement | null>;
  readonly hasSearch: boolean;
  readonly hasFilter: boolean;
  readonly stockCounts: Record<StockFilter, number>;
  readonly filterGroupId: string;
  readonly onClearSearch: () => void;
  readonly onResetAll: () => void;
  readonly allProducts: Product[];
  readonly filterLabels: Record<StockFilter, string>;
  readonly filterValues: StockFilter[];
}) {
  return (
    <div className="rounded-xl border border-wood-200 bg-surface-elevated px-4 py-3">
      <div className="relative">
        <label htmlFor="product-search" className="sr-only">Cari produk</label>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-wood-400" aria-hidden="true" />
        <input ref={searchInputRef} id="product-search" type="search" placeholder="Cari kode atau nama produk..."
          value={search} onChange={(e) => setSearch(e.target.value)}
          className="h-11 min-h-[44px] w-full rounded-lg border border-wood-200 bg-surface pl-10 pr-14 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-2 focus:outline-offset-2 focus:outline-wood-500 sm:h-10 sm:min-h-0" />
        {hasSearch && (
          <button type="button" onClick={onClearSearch}
            className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-1 text-wood-400 hover:bg-cream-200 hover:text-wood-600 min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Hapus pencarian">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <fieldset id={filterGroupId} className="mt-3 border-0 p-0 m-0">
        <legend className="sr-only">Filter status stok</legend>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-2">
          {filterValues.map((f) => (
            <Button key={f} type="button"
              variant={stockFilter === f ? "primary" : "outline"} size="sm"
              onClick={() => setStockFilter(f)}
              aria-pressed={stockFilter === f}>
              {filterLabels[f]}{allProducts.length > 0 && f !== "all" ? ` (${stockCounts[f]})` : ""}
            </Button>
          ))}
        </div>
      </fieldset>
      {(hasSearch || hasFilter) && (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-wood-100 pt-3">
          {hasSearch && <Button type="button" variant="outline" size="sm" onClick={onClearSearch}>Hapus pencarian</Button>}
          {hasFilter && <Button type="button" variant="outline" size="sm" onClick={() => setStockFilter("all")}>Tampilkan semua stok</Button>}
          {hasSearch && hasFilter && <Button type="button" variant="outline" size="sm" onClick={onResetAll}>Reset pencarian dan filter</Button>}
        </div>
      )}
    </div>
  );
}

function ProductFormModal({ open, formBusy, editingProduct, form, onClosing, onSave, onboardingCompleted }: {
  readonly open: boolean;
  readonly formBusy: boolean;
  readonly editingProduct: Product | null;
  readonly form: ReturnType<typeof useProductForm>;
  readonly onClosing: () => void;
  readonly onSave: () => void;
  readonly onboardingCompleted: boolean;
}) {
  return (
    <Modal open={open} onClose={formBusy ? () => {} : onClosing}
      title={editingProduct ? "Edit Produk" : "Tambah Produk"} size="md">
      <ModalContent>
        <div className="space-y-4">
          <Input label="Kode Produk" value={form.formData.code} onChange={(e) => form.setField("code", e.target.value)}
            placeholder="e.g., PRD-001" error={form.formErrors.code} maxLength={40} disabled={formBusy} />
          <Input label="Nama Produk" value={form.formData.name} onChange={(e) => form.setField("name", e.target.value)}
            placeholder="Nama produk" error={form.formErrors.name} maxLength={120} disabled={formBusy} />
          <Input label="Deskripsi" value={form.formData.description} onChange={(e) => form.setField("description", e.target.value)}
            placeholder="Detail singkat produk" error={form.formErrors.description} maxLength={500} disabled={formBusy} />
          <Select label="Satuan" value={form.formData.unit} onChange={(e) => form.setField("unit", e.target.value)}
            options={UNITS.map((u) => ({ value: u, label: u }))} error={form.formErrors.unit} disabled={formBusy} />
          <Input label={editingProduct ? "Biaya Rata-rata" : "Harga Beli"}
            value={formatAmountInput(form.formData.purchase_price)}
            onChange={(e) => form.setField("purchase_price", parseAmountInput(e.target.value, 0) ?? 0)}
            readOnly={!!editingProduct} isCurrency error={form.formErrors.purchase_price} disabled={formBusy} />
          {editingProduct && <p className="text-xs text-text-tertiary">Dihitung otomatis dari pembelian stok.</p>}
          <Input label="Harga Jual" value={formatAmountInput(form.formData.selling_price)}
            onChange={(e) => form.setField("selling_price", parseAmountInput(e.target.value, 0) ?? 0)}
            isCurrency error={form.formErrors.selling_price} disabled={formBusy} />
          {!editingProduct && !onboardingCompleted && (
            <Input label="Stok Awal" type="number" min={0} value={form.formData.current_stock || ""}
              onChange={(e) => form.setField("current_stock", Number(e.target.value))}
              placeholder="0" error={form.formErrors.current_stock} disabled={formBusy} />
          )}
          {!editingProduct && onboardingCompleted && (
            <div className="rounded-lg bg-cream-100 px-4 py-3 text-xs text-text-tertiary">
              Stok ditambahkan otomatis melalui alur pembelian atau stok resmi.
            </div>
          )}
          <Input label="Stok Minimum" type="number" min={0} value={form.formData.min_stock || ""}
            onChange={(e) => form.setField("min_stock", Number(e.target.value))}
            placeholder="0" error={form.formErrors.min_stock} disabled={formBusy}
            helperText="Ketika stok tersisa sampai angka ini, produk akan ditandai stok menipis." />
        </div>
      </ModalContent>
      <ModalFooter>
        <Button variant="ghost" onClick={onClosing} disabled={formBusy}>Batal</Button>
        <Button onClick={onSave} loading={formBusy} disabled={formBusy}>{editingProduct ? "Simpan" : "Tambah"}</Button>
      </ModalFooter>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/*  Error/Loading states (reduce cognitive complexity)                 */
/* ------------------------------------------------------------------ */

function ProductsHeader() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-text-primary">Produk</h1>
      <p className="mt-1 text-sm text-text-secondary">Kelola produk, harga, dan ketersediaan stok.</p>
    </div>
  );
}

function ProductsEmptyStates({ isEmpty, isSearchEmpty, hasSearch, hasFilter, search, canManageProducts, onClearSearch, onResetFilters, onSetStockFilter, onCreate }: {
  readonly isEmpty: boolean;
  readonly isSearchEmpty: boolean;
  readonly hasSearch: boolean;
  readonly hasFilter: boolean;
  readonly search: string;
  readonly canManageProducts: boolean;
  readonly onClearSearch: () => void;
  readonly onResetFilters: () => void;
  readonly onSetStockFilter: (v: StockFilter) => void;
  readonly onCreate: () => void;
}) {
  if (isEmpty) {
    return (
      <EmptyState icon={<Package className="h-7 w-7 text-wood-400" aria-hidden="true" />}
        title="Belum ada produk"
        description="Tambahkan produk pertama untuk mulai mencatat stok dan penjualan."
        action={canManageProducts ? <Button onClick={onCreate} className="min-h-[44px]"><Plus className="mr-2 h-4 w-4" aria-hidden="true" />Tambah Produk Pertama</Button> : undefined} />
    );
  }
  if (isSearchEmpty) {
    return (
      <EmptyState icon={<Search className="h-7 w-7 text-wood-400" aria-hidden="true" />}
        title={hasSearch && hasFilter ? "Tidak ada produk yang sesuai" : "Produk tidak ditemukan"}
        description={hasSearch && hasFilter ? "Coba ubah pencarian atau status stok yang dipilih." : `Tidak ada produk yang cocok dengan "${search}".`}
        action={<div className="flex flex-wrap justify-center gap-2">
          {hasSearch && <Button type="button" variant="outline" size="sm" onClick={onClearSearch}>Hapus pencarian</Button>}
          {hasFilter && <Button type="button" variant="outline" size="sm" onClick={() => onSetStockFilter("all")}>Tampilkan semua stok</Button>}
          {hasSearch && hasFilter && <Button type="button" variant="outline" size="sm" onClick={onResetFilters}>Reset pencarian dan filter</Button>}
        </div>} />
    );
  }
  return null;
}

function ProductsPageHeader({ canCreateExports, canManageProducts, isExporting, allProductsLength, onExport, onCreate }: {
  readonly canCreateExports: boolean;
  readonly canManageProducts: boolean;
  readonly isExporting: boolean;
  readonly allProductsLength: number;
  readonly onExport: () => void;
  readonly onCreate: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <ProductsHeader />
      <div className="flex items-center gap-2">
        {canCreateExports && (
          <Button type="button" variant="outline" size="sm" onClick={onExport}
            disabled={!allProductsLength || isExporting} className="hidden sm:inline-flex"
            aria-busy={isExporting || undefined}>
            <Download className="h-4 w-4" aria-hidden="true" />
            {isExporting ? "Mengekspor..." : "Ekspor CSV"}
          </Button>
        )}
        {canCreateExports && (
          <Button type="button" variant="outline" size="icon" onClick={onExport}
            disabled={!allProductsLength || isExporting} className="sm:hidden min-h-[44px] min-w-[44px]"
            aria-label={isExporting ? "Mengekspor produk ke CSV" : "Ekspor produk ke CSV"}
            aria-busy={isExporting || undefined}>
            <Download className="h-4 w-4" aria-hidden="true" />
          </Button>
        )}
        {canManageProducts && (
          <Button onClick={onCreate} className="min-h-[44px]">
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
            Tambah Produk
          </Button>
        )}
      </div>
    </div>
  );
}

function ProductListView({ filteredProducts, canManageProducts, onEdit, onDelete, onAdjust, onStockCount }: {
  readonly filteredProducts: Product[];
  readonly canManageProducts: boolean;
  readonly onEdit: (p: Product) => void;
  readonly onDelete: (p: Product) => void;
  readonly onAdjust: (p: Product) => void;
  readonly onStockCount: (p: Product) => void;
}) {
  return (
    <>
      {/* Mobile: Card stack */}
      <div className="divide-y divide-wood-100 rounded-xl border border-wood-200 bg-surface-elevated lg:hidden">
        {filteredProducts.map((product) => (
          <div key={product.id} className="px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-mono text-xs text-wood-500">{product.code}</p>
                <h2 className="mt-0.5 line-clamp-2 break-words text-sm font-semibold text-text-primary">{product.name}</h2>
                {product.description && <p className="mt-0.5 line-clamp-1 text-xs text-text-tertiary">{product.description}</p>}
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
              <MarkupIndicator purchase={product.purchase_price ?? 0} selling={product.selling_price ?? 0} />
              <span className="num-mono text-xs text-text-tertiary">Stok: {formatNumber(product.current_stock)} {product.unit || "pcs"}</span>
            </div>              {canManageProducts && (
              <div className="mt-3 flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => onStockCount(product)} aria-label={`Stok opname ${product.name}`} className="min-h-[44px] min-w-[44px] text-sky-600 hover:bg-sky-50">
                  <Package className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => onAdjust(product)} aria-label={`Sesuaikan stok ${product.name}`} className="min-h-[44px] min-w-[44px] text-honey-600 hover:bg-honey-50">
                  <Edit2 className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => onEdit(product)} aria-label={`Edit produk ${product.name}`} className="min-h-[44px] min-w-[44px]">
                  <Edit2 className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => onDelete(product)} aria-label={`Nonaktifkan produk ${product.name}`} className="min-h-[44px] min-w-[44px] text-error hover:bg-error-bg">
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Desktop: Table */}
      <div className="hidden lg:block rounded-xl border border-wood-200 bg-surface-elevated overflow-hidden">
        <table className="w-full text-sm">
          <caption className="sr-only">Daftar produk</caption>
          <thead className="border-b border-wood-100 bg-cream-100/50">
            <tr>
              <th scope="col" className="px-4 py-3 text-left font-medium text-wood-600">Kode</th>
              <th scope="col" className="px-4 py-3 text-left font-medium text-wood-600">Nama</th>
              <th scope="col" className="px-4 py-3 text-center font-medium text-wood-600">Status Stok</th>
              <th scope="col" className="px-4 py-3 text-right font-medium text-wood-600">Harga Beli</th>
              <th scope="col" className="px-4 py-3 text-right font-medium text-wood-600">Harga Jual</th>
              <th scope="col" className="px-4 py-3 text-right font-medium text-wood-600">Markup</th>                {canManageProducts && <th scope="col" className="px-4 py-3 text-center font-medium text-wood-600">Stok</th>}
                {canManageProducts && <th scope="col" className="px-4 py-3 text-center font-medium text-wood-600">Aksi</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-wood-50">
            {filteredProducts.map((product) => (
              <tr key={product.id} className="transition-colors hover:bg-cream-50">
                <td className="whitespace-nowrap px-4 py-3 font-mono text-wood-600">{product.code}</td>
                <td className="min-w-[200px] max-w-[320px] px-4 py-3">
                  <div className="break-words font-medium text-wood-800">{product.name}</div>
                  {product.description && <div className="line-clamp-1 break-words text-xs text-wood-500">{product.description}</div>}
                </td>
                <td className="px-4 py-3 text-center">
                  <div className="flex flex-col items-center gap-1">
                    <StockBadge product={product} />
                    <span className="num-mono text-xs text-wood-500">{formatNumber(product.current_stock)} {product.unit || "pcs"}</span>
                    {(product.min_stock ?? 0) > 0 && <span className="text-xs text-wood-400">Min: {formatNumber(product.min_stock)}</span>}
                  </div>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right num-mono text-wood-600">{formatIDR(product.purchase_price)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right num-mono font-medium text-wood-800">{formatIDR(product.selling_price)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  <MarkupIndicator purchase={product.purchase_price ?? 0} selling={product.selling_price ?? 0} />
                </td>
                {canManageProducts && (
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Button type="button" variant="ghost" size="icon" onClick={() => onStockCount(product)} aria-label={`Stok opname ${product.name}`} className="min-h-[44px] min-w-[44px] sm:min-h-9 sm:min-w-9 text-sky-500 hover:text-sky-600 hover:bg-sky-50" title="Stok Opname">
                        <Package className="h-4 w-4" aria-hidden="true" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" onClick={() => onAdjust(product)} aria-label={`Sesuaikan stok ${product.name}`} className="min-h-[44px] min-w-[44px] sm:min-h-9 sm:min-w-9 text-honey-500 hover:text-honey-600 hover:bg-honey-50" title="Penyesuaian Stok">
                        <Edit2 className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                  </td>
                )}
                {canManageProducts && (
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Button type="button" variant="ghost" size="icon" onClick={() => onEdit(product)} aria-label={`Edit produk ${product.name}`} className="min-h-[44px] min-w-[44px] sm:min-h-9 sm:min-w-9 text-wood-500 hover:text-wood-600">
                        <Edit2 className="h-4 w-4" aria-hidden="true" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" onClick={() => onDelete(product)} aria-label={`Nonaktifkan produk ${product.name}`} className="min-h-[44px] min-w-[44px] sm:min-h-9 sm:min-w-9 text-wood-500 hover:text-error hover:bg-error-bg">
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
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
  );
}

function ProductsErrorState({ onRetry }: { readonly onRetry: () => void }) {
  return (
    <div className="space-y-4">
      <ProductsHeader />
      <ErrorState error={null} message="Periksa koneksi Anda, lalu coba lagi." onRetry={onRetry} />
    </div>
  );
}

function ProductsLoadingSkeleton() {
  return (
    <div className="space-y-4">
      <ProductsHeader />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2"><Skeleton className="h-10 w-28 rounded-md" /><Skeleton className="h-10 w-28 rounded-md" /></div>
        <div className="flex gap-2"><Skeleton className="h-10 w-28 rounded-md" /><Skeleton className="h-10 w-36 rounded-md" /></div>
      </div>
      <Skeleton className="h-11 w-full rounded-lg" />
      <div className="flex gap-2"><Skeleton className="h-9 w-16 rounded-full" /><Skeleton className="h-9 w-16 rounded-full" /><Skeleton className="h-9 w-16 rounded-full" /><Skeleton className="h-9 w-16 rounded-full" /></div>
      <div className="space-y-3">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Filter helper (extracted to reduce S3776 complexity)               */
/* ------------------------------------------------------------------ */

function filterProducts(products: Product[], search: string, stockFilter: StockFilter): Product[] {
  const q = search.toLowerCase();
  return products.filter((p) => {
    if (q && !p.code.toLowerCase().includes(q) && !p.name.toLowerCase().includes(q)) return false;
    return stockFilter === "all" || getStockStatus(p) === stockFilter;
  });
}

/* ------------------------------------------------------------------ */
/*  Product list hook                                                  */
/* ------------------------------------------------------------------ */

function useProductList(orgId: string | undefined) {
  const { data: products, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.products.fullList(orgId ?? ""),
    queryFn: async () => {
      if (!orgId) return [];
      return listProducts();
    },
    enabled: !!orgId,
  });
  const allProducts = useMemo(() => products || [], [products]);
  return { allProducts, isLoading, error, refetch };
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export function ProductsPage() {
  const { data: orgData } = useOrganization();
  const { canManageProducts, canCreateExports } = useOrgPermissions();
  const onboardingCompleted = orgData?.organization?.onboarding_status === 'completed';
  const form = useProductForm();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [adjustModalOpen, setAdjustModalOpen] = useState(false);
  const [adjustProduct, setAdjustProduct] = useState<Product | null>(null);
  const [stockCountModalOpen, setStockCountModalOpen] = useState(false);
  const [stockCountProduct, setStockCountProduct] = useState<Product | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const filterGroupId = useId();

  const { loading, setLoading, saveMutation, deleteMutation } = useProductMutations({
    orgId: orgData?.organization?.id,
    form, editingProduct, setEditingProduct, setModalOpen, setDeleteDialogOpen, setSelectedProduct,
  });
  const formBusy = loading || saveMutation.isPending;

  const { allProducts, isLoading, error, refetch } = useProductList(orgData?.organization?.id);

  const [search, setSearch] = useState("");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const hasSearch = search.trim().length > 0;
  const hasFilter = stockFilter !== "all";
  const isSearching = hasSearch || hasFilter;
  const isEmpty = !isLoading && allProducts.length === 0;

  const filteredProducts = useMemo(
    () => filterProducts(allProducts, search, stockFilter),
    [allProducts, search, stockFilter],
  );
  const isSearchEmpty = !isLoading && allProducts.length > 0 && filteredProducts.length === 0;

  const stockCounts = useMemo(() => {
    const counts: Record<StockFilter, number> = { all: allProducts.length, in_stock: 0, low: 0, out: 0 };
    for (const p of allProducts) counts[getStockStatus(p)]++;
    return counts;
  }, [allProducts]);

  const openCreateModal = useCallback(() => { form.resetForm(); setEditingProduct(null); setModalOpen(true); }, [form]);
  const openEditModal = useCallback((product: Product) => { form.loadProduct(product); setEditingProduct(product); setModalOpen(true); }, [form]);
  const handleSave = useCallback(() => {
    if (formBusy) return;
    const errors = form.validate();
    if (Object.keys(errors).length > 0) { form.setFormErrors(errors); toast.error("Periksa kembali data produk."); return; }
    setLoading(true); saveMutation.mutate(form.formData);
  }, [form, formBusy, saveMutation, setLoading]);

  const handleExport = useCallback(async () => {
    if (!canCreateExports || isExporting) return;
    setIsExporting(true);
    try { await exportProductsCsv(); toast.success("Ekspor produk ke CSV dimulai."); }
    catch { toast.error("Produk belum berhasil diekspor. Coba lagi."); }
    finally { setIsExporting(false); }
  }, [canCreateExports, isExporting]);

  const openAdjustModal = useCallback((product: Product) => { setAdjustProduct(product); setAdjustModalOpen(true); }, []);
  const openStockCountModal = useCallback((product: Product) => { setStockCountProduct(product); setStockCountModalOpen(true); }, []);

  const handleInventoryChange = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.products.all(orgData?.organization?.id ?? "") });
    toast.success("Stok berhasil diperbarui.");
  }, [queryClient, orgData]);

  const handleResetAll = useCallback(() => { setSearch(""); setStockFilter("all"); }, []);

  // ── Error ──
  if (error) {
    return <ProductsErrorState onRetry={refetch} />;
  }

  // ── Loading ──
  if (isLoading) {
    return <ProductsLoadingSkeleton />;
  }

  const filterLabels: Record<StockFilter, string> = { all: "Semua", in_stock: "Aman", low: "Menipis", out: "Habis" };
  const filterValues: StockFilter[] = ["all", "in_stock", "low", "out"];

  return (
    <div className="space-y-4">
      {/* Header */}
      <ProductsPageHeader
        canCreateExports={canCreateExports}
        canManageProducts={canManageProducts}
        isExporting={isExporting}
        allProductsLength={allProducts.length}
        onExport={handleExport}
        onCreate={openCreateModal}
      />

      {/* Search + Filter */}
      <ProductFilter
        search={search} setSearch={setSearch}
        stockFilter={stockFilter} setStockFilter={setStockFilter}
        searchInputRef={searchInputRef} hasSearch={hasSearch} hasFilter={hasFilter}
        stockCounts={stockCounts} filterGroupId={filterGroupId}
        onClearSearch={handleClearSearch} onResetAll={handleResetAll}
        allProducts={allProducts} filterLabels={filterLabels} filterValues={filterValues}
      />

      {/* Search-result feedback */}
      {isSearching && !isEmpty && (
        <p className="text-sm text-text-secondary" aria-live="polite">
          {filteredProducts.length === 0
            ? "Tidak ada produk yang cocok."
            : `${filteredProducts.length} produk ditemukan.`}
        </p>
      )}

      {/* Empty states */}
      <ProductsEmptyStates
        isEmpty={isEmpty}
        isSearchEmpty={isSearchEmpty}
        hasSearch={hasSearch}
        hasFilter={hasFilter}
        search={search}
        canManageProducts={canManageProducts}
        onClearSearch={handleClearSearch}
        onResetFilters={handleResetAll}
        onSetStockFilter={setStockFilter}
        onCreate={openCreateModal}
      />

      {/* Product list */}
      {!isEmpty && !isSearchEmpty && (
        <ProductListView
          filteredProducts={filteredProducts}
          canManageProducts={canManageProducts}
          onEdit={openEditModal}
          onDelete={(p) => { setSelectedProduct(p); setDeleteDialogOpen(true); }}
          onAdjust={openAdjustModal}
          onStockCount={openStockCountModal}
        />
      )}

      {/* Create/Edit Modal */}
      <ProductFormModal
        open={modalOpen}
        formBusy={formBusy}
        editingProduct={editingProduct}
        form={form}
        onClosing={() => setModalOpen(false)}
        onSave={handleSave}
        onboardingCompleted={onboardingCompleted}
      />

      {/* Stock Adjustment Modal */}
      <StockAdjustmentModal
        open={adjustModalOpen}
        onClose={() => setAdjustModalOpen(false)}
        product={adjustProduct}
        onSuccess={handleInventoryChange}
      />

      {/* Stock Count Modal */}
      <StockCountModal
        open={stockCountModalOpen}
        onClose={() => setStockCountModalOpen(false)}
        product={stockCountProduct}
        onSuccess={handleInventoryChange}
      />

      {/* Deactivate confirmation */}
      <ConfirmDialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={() => selectedProduct && deleteMutation.mutate(selectedProduct)}
        title="Nonaktifkan produk?"
        message={`"${selectedProduct?.name}" akan dinonaktifkan dan tidak muncul sebagai produk aktif. Riwayat transaksi tetap tersimpan.`}
        confirmLabel={deleteMutation.isPending ? "Menonaktifkan..." : "Ya, Nonaktifkan"}
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
