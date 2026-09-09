import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Edit, Plus } from "reicon-react";
import { useOrganization } from "@/hooks/useOrganization";
import { createProduct, listProducts, patchProduct, type Product } from "@/lib/api/products";
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
import { formatIDR, formatDecimalIDR, formatQuantity } from "@/lib/utils";
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
                {products.map((product) => (
                  <li key={product.id} className="flex items-center justify-between gap-4 px-5 py-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 break-words text-sm font-medium text-text-primary">
                        {product.name}
                        {product.is_active !== 1 && (
                          <Badge variant="neutral" size="sm">
                            Nonaktif
                          </Badge>
                        )}
                      </p>
                      <p className="mt-0.5 text-xs text-text-tertiary">
                        {product.code} · Stok {formatQuantity(product.current_stock)} {product.unit}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-4">
                      <div className="text-right">
                        <p className="num-mono text-sm font-semibold text-text-primary">
                          {formatIDR(product.stock_value_idr)}
                        </p>
                        <p className="text-xs text-text-tertiary">
                          HPP {formatDecimalIDR(product.average_cost_idr)}/{product.unit} · Jual{" "}
                          {formatDecimalIDR(product.selling_price_idr)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(product)}>
                          <Edit className="h-4 w-4" />
                          Edit
                        </Button>
                        {product.is_active === 1 ? (
                          <Button variant="ghost" size="sm" onClick={() => handleToggleActive(product)}>
                            Nonaktifkan
                          </Button>
                        ) : (
                          <Button variant="outline" size="sm" onClick={() => handleToggleActive(product)}>
                            Aktifkan
                          </Button>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
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
                label="Nama Produk"
                value={edit.name}
                onChange={(e) => setEdit({ ...edit, name: e.target.value })}
              />
              <Input
                label="Satuan"
                value={edit.unit}
                onChange={(e) => setEdit({ ...edit, unit: e.target.value })}
              />
              <Input
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