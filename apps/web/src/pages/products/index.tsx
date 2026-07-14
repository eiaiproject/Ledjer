import { useCallback, useId, useMemo, useRef, useState } from "react";
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

  return (
    <span className={cn(
      "text-xs font-medium",
      isPositive ? "text-leaf-600" : isNegative ? "text-error" : "text-text-tertiary"
    )}>
      {isPositive ? "+" : ""}{formatIDR(diff)} / {isNegative ? "" : ""}{pct}%
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
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [formData, setFormData] = useState<ProductFormData>({
    code: "", name: "", description: "", unit: "pcs",
    purchase_price: 0, selling_price: 0, current_stock: 0, min_stock: 0,
  });
  const [formErrors, setFormErrors] = useState<ProductFormErrors>({});
  const [loading, setLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchLabelId = useId();
  const filterGroupId = useId();

  const { data: products, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.products.fullList(orgData?.organization?.id ?? ""),
    queryFn: async () => {
      if (!orgData?.organization?.id) return [];
      return listProducts();
    },
    enabled: !!orgData?.organization?.id,
  });

  const allProducts = useMemo(() => products || [], [products]);

  // Counts — from unfiltered dataset
  const stockCounts = useMemo(() => {
    const counts: Record<StockFilter, number> = { all: allProducts.length, in_stock: 0, low: 0, out: 0 };
    for (const p of allProducts) {
      counts[getStockStatus(p)]++;
    }
    return counts;
  }, [allProducts]);

  const filteredProducts = useMemo(() => {
    return allProducts.filter((p) => {
      if (search) {
        const q = search.toLowerCase();
        if (!p.code.toLowerCase().includes(q) && !p.name.toLowerCase().includes(q)) return false;
      }
      if (stockFilter !== "all" && getStockStatus(p) !== stockFilter) return false;
      return true;
    });
  }, [allProducts, search, stockFilter]);

  const hasSearch = search.trim().length > 0;
  const hasFilter = stockFilter !== "all";
  const isSearching = hasSearch || hasFilter;
  const isEmpty = !isLoading && allProducts.length === 0;
  const isSearchEmpty = !isLoading && allProducts.length > 0 && filteredProducts.length === 0;

  const saveMutation = useMutation({
    mutationFn: async (data: ProductFormData) => {
      if (!orgData?.organization?.id) throw new Error("Organisasi tidak ditemukan");
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
      queryClient.invalidateQueries({ queryKey: queryKeys.products.all(orgData?.organization?.id ?? "") });
      toast.success(editingProduct ? "Produk berhasil diperbarui." : "Produk berhasil ditambahkan.");
      setModalOpen(false); setEditingProduct(null); resetForm();
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
      toast.success("Produk berhasil dinonaktifkan.");
      setDeleteDialogOpen(false); setSelectedProduct(null);
    },
    onError: (err) => toast.error(translateError(err)),
  });

  const resetForm = useCallback(() => {
    setFormData({ code: "", name: "", description: "", unit: "pcs", purchase_price: 0, selling_price: 0, current_stock: 0, min_stock: 0 });
    setFormErrors({});
  }, []);

  const updateFormField = useCallback(<K extends keyof ProductFormData>(field: K, value: ProductFormData[K]) => {
    setFormData((c) => ({ ...c, [field]: value }));
    setFormErrors((c) => { if (!c[field]) return c; const n = { ...c }; delete n[field]; return n; });
  }, []);

  const validateForm = useCallback(() => {
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
  }, [formData]);

  const openCreateModal = useCallback(() => { resetForm(); setEditingProduct(null); setModalOpen(true); }, [resetForm]);

  const openEditModal = useCallback((product: Product) => {
    setFormErrors({});
    setFormData({
      code: product.code, name: product.name, description: product.description || "",
      unit: product.unit || "pcs", purchase_price: product.purchase_price ?? 0,
      selling_price: product.selling_price ?? 0, current_stock: product.current_stock ?? 0,
      min_stock: product.min_stock ?? 0,
    });
    setEditingProduct(product); setModalOpen(true);
  }, []);

  const handleSave = useCallback(() => {
    if (formBusy) return;
    const errors = validateForm();
    if (Object.keys(errors).length > 0) { setFormErrors(errors); toast.error("Periksa kembali data produk."); return; }
    setLoading(true); saveMutation.mutate(formData);
  }, [formBusy, validateForm, saveMutation, formData]);

  const handleExport = useCallback(async () => {
    if (!canCreateExports || isExporting) return;
    setIsExporting(true);
    try { await exportProductsCsv(); toast.success("Ekspor produk ke CSV dimulai."); }
    catch { toast.error("Produk belum berhasil diekspor. Coba lagi."); }
    finally { setIsExporting(false); }
  }, [canCreateExports, isExporting]);

  const handleClearSearch = useCallback(() => { setSearch(""); searchInputRef.current?.focus(); }, []);
  const handleResetAll = useCallback(() => { setSearch(""); setStockFilter("all"); }, []);

  // ── Error ──
  if (error) {
    return (
      <div className="space-y-4">
        <div><h1 className="text-2xl font-bold text-text-primary">Produk</h1>
        <p className="mt-1 text-sm text-text-secondary">Kelola produk, harga, dan ketersediaan stok.</p></div>
        <ErrorState error={error} message="Periksa koneksi Anda, lalu coba lagi." onRetry={() => { refetch(); }} />
      </div>
    );
  }

  // ── Loading ──
  if (isLoading) {
    return (
      <div className="space-y-4">
        <div><h1 className="text-2xl font-bold text-text-primary">Produk</h1>
        <p className="mt-1 text-sm text-text-secondary">Kelola produk, harga, dan ketersediaan stok.</p></div>
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

  const filterLabels: Record<StockFilter, string> = { all: "Semua", in_stock: "Aman", low: "Menipis", out: "Habis" };
  const filterValues: StockFilter[] = ["all", "in_stock", "low", "out"];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Produk</h1>
          <p className="mt-1 text-sm text-text-secondary">Kelola produk, harga, dan ketersediaan stok.</p>
        </div>
        <div className="flex items-center gap-2">
          {canCreateExports && (
            <Button type="button" variant="outline" size="sm" onClick={() => { handleExport(); }}
              disabled={!allProducts.length || isExporting} className="hidden sm:inline-flex"
              aria-busy={isExporting || undefined}>
              <Download className="h-4 w-4" aria-hidden="true" />
              {isExporting ? "Mengekspor..." : "Ekspor CSV"}
            </Button>
          )}
          {canCreateExports && (
            <Button type="button" variant="outline" size="icon" onClick={() => { handleExport(); }}
              disabled={!allProducts.length || isExporting} className="sm:hidden min-h-[44px] min-w-[44px]"
              aria-label={isExporting ? "Mengekspor produk ke CSV" : "Ekspor produk ke CSV"}
              aria-busy={isExporting || undefined}>
              <Download className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
          {canManageProducts && (
            <Button onClick={openCreateModal} className="min-h-[44px]">
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
              Tambah Produk
            </Button>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <label htmlFor="product-search" className="sr-only" id={searchLabelId}>Cari produk</label>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-wood-400" aria-hidden="true" />
        <input ref={searchInputRef} id="product-search" type="search" placeholder="Cari kode atau nama produk..."
          value={search} onChange={(e) => setSearch(e.target.value)}
          aria-labelledby={searchLabelId}
          className="h-11 min-h-[44px] w-full rounded-lg border border-wood-200 bg-surface pl-10 pr-10 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-2 focus:outline-offset-2 focus:outline-wood-500 sm:h-10 sm:min-h-0" />
        {hasSearch && (
          <button type="button" onClick={handleClearSearch}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-wood-400 hover:bg-cream-200 hover:text-wood-600 min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Hapus pencarian">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Stock filter */}
      <fieldset id={filterGroupId}>
        <legend className="sr-only">Filter status stok</legend>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-2" role="group" aria-labelledby={filterGroupId}>
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

      {/* Search-result feedback */}
      {isSearching && !isEmpty && (
        <p className="text-sm text-text-secondary" aria-live="polite">
          {filteredProducts.length === 0
            ? "Tidak ada produk yang cocok."
            : `${filteredProducts.length} produk ditemukan.`}
        </p>
      )}

      {/* Empty — no products at all */}
      {isEmpty && (
        <EmptyState
          icon={<Package className="h-7 w-7 text-wood-400" aria-hidden="true" />}
          title="Belum ada produk"
          description="Tambahkan produk pertama untuk mulai mencatat stok dan penjualan."
          action={canManageProducts ? <Button onClick={openCreateModal} className="min-h-[44px]"><Plus className="mr-2 h-4 w-4" aria-hidden="true" />Tambah Produk Pertama</Button> : undefined}
        />
      )}

      {/* Search-empty — products exist but no match */}
      {isSearchEmpty && (
        <EmptyState
          icon={<Search className="h-7 w-7 text-wood-400" aria-hidden="true" />}
          title={hasSearch && hasFilter ? "Tidak ada produk yang sesuai" : "Produk tidak ditemukan"}
          description={hasSearch && hasFilter
            ? "Coba ubah pencarian atau status stok yang dipilih."
            : `Tidak ada produk yang cocok dengan "${search}".`}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {hasSearch && <Button type="button" variant="outline" size="sm" onClick={handleClearSearch}>Hapus pencarian</Button>}
              {hasFilter && <Button type="button" variant="outline" size="sm" onClick={() => setStockFilter("all")}>Tampilkan semua stok</Button>}
              {hasSearch && hasFilter && <Button type="button" variant="outline" size="sm" onClick={handleResetAll}>Reset pencarian dan filter</Button>}
            </div>
          }
        />
      )}

      {/* Product list */}
      {!isEmpty && !isSearchEmpty && (
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
                  <span className="num-mono text-xs text-text-tertiary">
                    Stok: {formatNumber(product.current_stock)} {product.unit || "pcs"}
                  </span>
                </div>

                {canManageProducts && (
                  <div className="mt-3 flex justify-end gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => openEditModal(product)}
                      aria-label={`Edit produk ${product.name}`} className="min-h-[44px] min-w-[44px]">
                      <Edit2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    <Button type="button" variant="outline" size="sm"
                      onClick={() => { setSelectedProduct(product); setDeleteDialogOpen(true); }}
                      aria-label={`Nonaktifkan produk ${product.name}`}
                      className="min-h-[44px] min-w-[44px] text-error hover:bg-error-bg">
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
                  <th scope="col" className="px-4 py-3 text-right font-medium text-wood-600">Markup</th>
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
                          <Button type="button" variant="ghost" size="icon" onClick={() => openEditModal(product)}
                            aria-label={`Edit produk ${product.name}`}
                            className="min-h-[44px] min-w-[44px] sm:min-h-9 sm:min-w-9 text-wood-500 hover:text-wood-600">
                            <Edit2 className="h-4 w-4" aria-hidden="true" />
                          </Button>
                          <Button type="button" variant="ghost" size="icon"
                            onClick={() => { setSelectedProduct(product); setDeleteDialogOpen(true); }}
                            aria-label={`Nonaktifkan produk ${product.name}`}
                            className="min-h-[44px] min-w-[44px] sm:min-h-9 sm:min-w-9 text-wood-500 hover:text-error hover:bg-error-bg">
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
      )}

      {/* Create/Edit Modal */}
      <Modal open={modalOpen} onClose={formBusy ? () => {} : () => setModalOpen(false)}
        title={editingProduct ? "Edit Produk" : "Tambah Produk"} size="md">
        <ModalContent>
          <div className="space-y-4">
            <Input label="Kode Produk" value={formData.code} onChange={(e) => updateFormField("code", e.target.value)}
              placeholder="e.g., PRD-001" error={formErrors.code} maxLength={40} disabled={formBusy} />
            <Input label="Nama Produk" value={formData.name} onChange={(e) => updateFormField("name", e.target.value)}
              placeholder="Nama produk" error={formErrors.name} maxLength={120} disabled={formBusy} />
            <Input label="Deskripsi" value={formData.description} onChange={(e) => updateFormField("description", e.target.value)}
              placeholder="Detail singkat produk" error={formErrors.description} maxLength={500} disabled={formBusy} />
            <Select label="Satuan" value={formData.unit} onChange={(e) => updateFormField("unit", e.target.value)}
              options={UNITS.map((u) => ({ value: u, label: u }))} error={formErrors.unit} disabled={formBusy} />
            <Input label={editingProduct ? "Biaya Rata-rata" : "Harga Beli"}
              value={formatAmountInput(formData.purchase_price)}
              onChange={(e) => updateFormField("purchase_price", parseAmountInput(e.target.value, 0) ?? 0)}
              readOnly={!!editingProduct} isCurrency error={formErrors.purchase_price} disabled={formBusy} />
            {editingProduct && <p className="text-xs text-text-tertiary">Dihitung otomatis dari pembelian stok.</p>}
            <Input label="Harga Jual" value={formatAmountInput(formData.selling_price)}
              onChange={(e) => updateFormField("selling_price", parseAmountInput(e.target.value, 0) ?? 0)}
              isCurrency error={formErrors.selling_price} disabled={formBusy} />
            {!editingProduct && !onboardingCompleted && (
              <Input label="Stok Awal" type="number" min={0} value={formData.current_stock || ""}
                onChange={(e) => updateFormField("current_stock", Number(e.target.value))}
                placeholder="0" error={formErrors.current_stock} disabled={formBusy} />
            )}
            {!editingProduct && onboardingCompleted && (
              <div className="rounded-lg bg-cream-100 px-4 py-3 text-xs text-text-tertiary">
                Stok ditambahkan otomatis melalui alur pembelian atau stok resmi.
              </div>
            )}
            <Input label="Stok Minimum" type="number" min={0} value={formData.min_stock || ""}
              onChange={(e) => updateFormField("min_stock", Number(e.target.value))}
              placeholder="0" error={formErrors.min_stock} disabled={formBusy}
              helperText="Ketika stok tersisa sampai angka ini, produk akan ditandai stok menipis." />
          </div>
        </ModalContent>
        <ModalFooter>
          <Button variant="ghost" onClick={() => setModalOpen(false)} disabled={formBusy}>Batal</Button>
          <Button onClick={handleSave} loading={formBusy} disabled={formBusy}>{editingProduct ? "Simpan" : "Tambah"}</Button>
        </ModalFooter>
      </Modal>

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
