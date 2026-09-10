import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Edit, Plus, Power } from "reicon-react";
import { useOrganization } from "@/hooks/useOrganization";
import { createProduct, getProductMovements, listProducts, patchProduct, type Product, type StockMovementReportLine } from "@/lib/api/products";
import { queryKeys } from "@/lib/query-keys";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Modal, ModalContent, ModalFooter } from "@/components/ui/modal";
import { toast } from "@/components/ui/toast";
import { formatIDR, formatDecimalIDR, formatQuantity, formatShortDate, cn } from "@/lib/utils";
import { translateError } from "@/lib/errors";

interface EditState {
  product: Product;
  name: string;
  unit: string;
  sellingPriceIdr: string;
}

export function ProductsPage() {
  const { data: orgData } = useOrganization();
  const orgId = orgData?.organization?.id;
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [sellingPriceIdr, setSellingPriceIdr] = useState("");
  const [creating, setCreating] = useState(false);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const query = useQuery({
    queryKey: queryKeys.products.all(orgId),
    queryFn: async () => {
      if (!orgId) throw new Error("No organization");
      return listProducts(true);
    },
    enabled: !!orgId,
  });

  const products = query.data ?? [];

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.products.allProducts() });
    queryClient.invalidateQueries({ queryKey: queryKeys.transactions.all() });
  };

  const handleCreate = async () => {
    if (creating) return;
    const trimmedName = name.trim();
    const trimmedUnit = unit.trim();
    if (!trimmedName) {
      toast.error("Nama produk harus diisi.");
      return;
    }
    if (!trimmedUnit) {
      toast.error("Satuan harus diisi.");
      return;
    }
    const price = parseAmount(sellingPriceIdr);
    setCreating(true);
    try {
      await createProduct({ name: trimmedName, unit: trimmedUnit, sellingPriceIdr: price });
      toast.success("Produk berhasil dibuat.");
      setName("");
      setUnit("");
      setSellingPriceIdr("");
      invalidate();
    } catch (err) {
      toast.error(translateError(err));
    } finally {
      setCreating(false);
    }
  };

  const openEdit = (product: Product) => {
    setEdit({
      product,
      name: product.name,
      unit: product.unit,
      sellingPriceIdr: product.selling_price_idr > 0 ? String(product.selling_price_idr) : "",
    });
  };

  const handleSaveEdit = async () => {
    if (!edit || saving) return;
    const trimmedName = edit.name.trim();
    const trimmedUnit = edit.unit.trim();
    if (!trimmedName) {
      toast.error("Nama produk harus diisi.");
      return;
    }
    if (!trimmedUnit) {
      toast.error("Satuan harus diisi.");
      return;
    }
    setSaving(true);
    try {
      await patchProduct(edit.product.id, {
        name: trimmedName,
        unit: trimmedUnit,
        sellingPriceIdr: parseAmount(edit.sellingPriceIdr),
      });
      toast.success("Produk berhasil diperbarui.");
      setEdit(null);
      invalidate();
    } catch (err) {
      toast.error(translateError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (product: Product) => {
    try {
      await patchProduct(product.id, { isActive: product.is_active !== 1 });
      toast.success(product.is_active === 1 ? "Produk dinonaktifkan." : "Produk diaktifkan.");
      invalidate();
    } catch (err) {
      toast.error(translateError(err));
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Produk"
        description="Kelola daftar produk untuk pembelian & penjualan barang (HPP dihitung otomatis dari stok)."
      />

      <Card elevated>
        <CardContent className="p-4">
          <form
            className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-4"
            onSubmit={(e) => {
              e.preventDefault();
              handleCreate();
            }}
          >
            <Input
              label="Nama Produk"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Contoh: Kopi Bubuk 250g"
            />
            <Input
              label="Satuan"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="Contoh: bungkus, kg, pcs"
            />
            <Input
              label="Harga Jual (Rp)"
              isCurrency
              inputMode="numeric"
              value={sellingPriceIdr}
              onChange={(e) => setSellingPriceIdr(e.target.value)}
              placeholder="0"
            />
            <div className="flex justify-end lg:col-start-4">
              <Button type="submit" loading={creating} fullWidth className="lg:w-auto">
                <Plus className="h-4 w-4" />
                Tambah Produk
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {query.isError ? (
        <ErrorState title="Gagal memuat produk" message="Terjadi kesalahan saat mengambil daftar produk." onRetry={() => query.refetch()} />
      ) : (
        <Card elevated title="Daftar Produk">
          <CardContent className="p-0">
            {products.length === 0 ? (
              <EmptyState title="Belum ada produk" description="Tambahkan produk untuk mulai mencatat pembelian & penjualan barang." />
            ) : (
              <ul className="divide-y divide-wood-100">
                {products.map((product) => {
                  const expanded = expandedId === product.id;
                  return (
                  <li key={product.id} className="px-5 py-3">
                    <div className="flex items-center justify-between gap-4">
                    <button
                      type="button"
                      onClick={() => setExpandedId(expanded ? null : product.id)}
                      aria-expanded={expanded}
                      aria-controls={`movements-${product.id}`}
                      aria-label={`Riwayat mutasi ${product.name}`}
                      className="group flex min-w-0 flex-1 items-center justify-between gap-4 rounded-lg text-left transition-colors hover:bg-cream-100/60"
                    >
                    <span className="flex min-w-0 items-center gap-1">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-wood-500 transition-colors group-hover:bg-wood-100">
                        <ChevronDown className={cn("h-4 w-4 transition-transform", expanded && "rotate-180")} />
                      </span>
                      <span className="min-w-0">
                        <span className="flex items-center gap-2 break-words text-sm font-medium text-text-primary">
                          {product.name}
                          {product.is_active !== 1 && (
                            <Badge variant="neutral" size="sm">
                              Nonaktif
                            </Badge>
                          )}
                        </span>
                        <span className="mt-0.5 block text-xs text-text-tertiary">
                          {product.code} · Stok {formatQuantity(product.current_stock)} {product.unit}
                        </span>
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="num-mono block text-sm font-semibold text-text-primary">
                        {formatIDR(product.stock_value_idr)}
                      </span>
                    </span>
                    </button>
                    <div className="flex shrink-0 items-center gap-1 sm:gap-2">
                      <Button variant="ghost" size="sm" aria-label={`Edit ${product.name}`} onClick={() => openEdit(product)}>
                        <Edit className="h-4 w-4" />
                        <span className="hidden sm:inline">Edit</span>
                      </Button>
                      {product.is_active === 1 ? (
                        <Button variant="ghost" size="sm" aria-label={`Nonaktifkan ${product.name}`} onClick={() => handleToggleActive(product)}>
                          <Power className="h-4 w-4" />
                          <span className="hidden sm:inline">Nonaktifkan</span>
                        </Button>
                      ) : (
                        <Button variant="outline" size="sm" aria-label={`Aktifkan ${product.name}`} onClick={() => handleToggleActive(product)}>
                          <Power className="h-4 w-4" />
                          <span className="hidden sm:inline">Aktifkan</span>
                        </Button>
                      )}
                    </div>
                    </div>
                    {expanded && (
                      <div id={`movements-${product.id}`} className="mt-2 border-t border-wood-100 pt-2">
                        <p className="px-1 pb-1 text-xs text-text-tertiary">
                          HPP {formatDecimalIDR(product.average_cost_idr)}/{product.unit} · Jual{" "}
                          {formatDecimalIDR(product.selling_price_idr)}
                        </p>
                        <ProductMovementHistory productId={product.id} unit={product.unit} />
                      </div>
                    )}
                  </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      <Modal open={edit !== null} onClose={() => setEdit(null)} title="Edit Produk" size="sm">
        {edit && (
          <>
            <ModalContent className="space-y-4">
              <Input
                id="edit-nama-produk"
                label="Nama Produk"
                value={edit.name}
                onChange={(e) => setEdit({ ...edit, name: e.target.value })}
              />
              <Input
                id="edit-satuan"
                label="Satuan"
                value={edit.unit}
                onChange={(e) => setEdit({ ...edit, unit: e.target.value })}
              />
              <Input
                id="edit-harga-jual"
                label="Harga Jual (Rp)"
                isCurrency
                inputMode="numeric"
                value={edit.sellingPriceIdr}
                onChange={(e) => setEdit({ ...edit, sellingPriceIdr: e.target.value })}
              />
            </ModalContent>
            <ModalFooter>
              <Button variant="secondary" onClick={() => setEdit(null)}>
                Batal
              </Button>
              <Button loading={saving} onClick={handleSaveEdit}>
                Simpan
              </Button>
            </ModalFooter>
          </>
        )}
      </Modal>
    </div>
  );
}

/** Parse the raw formatted input into an integer rupiah amount (0 when blank). */
function parseAmount(raw: string): number {
  const digits = raw.replace(/[^\d]/g, "");
  const value = Number(digits);
  return Number.isFinite(value) ? value : 0;
}

/** Riwayat mutasi satu produk: dimuat malas saat baris dikembangkan. */
function ProductMovementHistory({ productId, unit }: { readonly productId: string; readonly unit: string }) {
  const { data: orgData } = useOrganization();
  const orgId = orgData?.organization?.id;
  const query = useQuery({
    queryKey: queryKeys.products.movements(orgId, productId),
    queryFn: async () => {
      if (!orgId) throw new Error("No organization");
      return getProductMovements(productId);
    },
    enabled: !!orgId,
  });

  if (query.isLoading) {
    return <div className="h-16 animate-pulse rounded-lg bg-wood-100" aria-label="Memuat riwayat mutasi" />;
  }
  if (query.isError) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg bg-wood-100 px-3 py-2 text-sm">
        <span className="text-text-secondary">Gagal memuat riwayat mutasi.</span>
        <Button variant="ghost" size="sm" onClick={() => query.refetch()}>
          Coba lagi
        </Button>
      </div>
    );
  }
  const lines = query.data ?? [];
  if (lines.length === 0) {
    return <p className="px-1 py-2 text-sm text-text-tertiary">Belum ada mutasi untuk produk ini.</p>;
  }
  return (
    <ul className="divide-y divide-wood-100">
      {lines.map((line: StockMovementReportLine) => {
        const incoming = line.quantity_in_milli > 0;
        return (
          <li key={line.transaction_id} className="flex items-center justify-between gap-3 px-1 py-2">
            <div className="min-w-0">
              <p className="text-sm font-medium text-text-primary">
                {formatShortDate(line.entry_date)}{" "}
                <Badge variant={incoming ? "success" : "warning"} size="sm">
                  {incoming ? "Masuk" : "Keluar"}
                </Badge>
              </p>
              <p className="mt-0.5 truncate text-xs text-text-tertiary">
                <span className="font-mono">{line.transaction_number}</span> · {line.description}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="num-mono text-sm font-semibold text-text-primary">
                {incoming ? "+" : "−"}
                {formatQuantity((incoming ? line.quantity_in_milli : line.quantity_out_milli) / 1000)} {unit}
              </p>
              <p className="text-xs text-text-tertiary">Sisa {formatQuantity(line.running_stock_milli / 1000)}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}