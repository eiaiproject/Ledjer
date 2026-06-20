import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Package, Edit2, Trash2, Search } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useOrganization, useOrgPermissions } from "@/hooks/useOrganization";
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
import { formatIDR, formatNumber } from "@/lib/utils";
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

export function ProductsPage() {
  const { data: orgData } = useOrganization();
  const { canManageProducts } = useOrgPermissions();
  const queryClient = useQueryClient();

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
  const [loading, setLoading] = useState(false);

  const { data: products, isLoading, error, refetch } = useQuery({
    queryKey: ["products", orgData?.organization?.id],
    queryFn: async () => {
      if (!orgData?.organization?.id) return [];
      const { data, error } = await supabase
        .from("products")
        .select("id, code, name, description, unit, purchase_price, selling_price, current_stock, min_stock, is_active")
        .eq("organization_id", orgData.organization.id)
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
        code: data.code,
        name: data.name,
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
          .eq("id", editingProduct.id);
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
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast.success(editingProduct ? "Produk berhasil diperbarui" : "Produk berhasil ditambahkan");
      setModalOpen(false);
      setEditingProduct(null);
      resetForm();
    },
    onError: (err) => toast.error(translateError(err)),
    onSettled: () => setLoading(false),
  });

  const deleteMutation = useMutation({
    mutationFn: async (product: Product) => {
      const { error } = await supabase
        .from("products")
        .update({ is_active: false })
        .eq("id", product.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
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
  };

  const openCreateModal = () => {
    resetForm();
    setEditingProduct(null);
    setModalOpen(true);
  };

  const openEditModal = (product: Product) => {
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
    if (!formData.code || !formData.name) {
      toast.error("Kode dan nama produk wajib diisi");
      return;
    }
    setLoading(true);
    saveMutation.mutate(formData);
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
          <h1 className="text-2xl font-bold text-wood-800">Produk</h1>
          <p className="text-sm text-wood-500 mt-1">Kelola produk dan stok</p>
        </div>
        {canManageProducts && (
          <Button onClick={openCreateModal}>
            <Plus className="h-4 w-4" />
            Tambah Produk
          </Button>
        )}
      </div>

      <Input
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
          description="Tambahkan produk pertama Anda"
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
                      <p className="font-mono text-xs text-text-tertiary">{product.code}</p>
                      <h2 className="mt-1 truncate text-sm font-semibold text-text-primary">{product.name}</h2>
                      {product.description && <p className="mt-1 line-clamp-2 text-xs text-text-tertiary">{product.description}</p>}
                    </div>
                    <Badge variant={(product.current_stock ?? 0) <= (product.min_stock ?? 0) ? "warning" : "success"}>
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

          <Card className="hidden sm:block">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
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
                  <tr key={product.id} className="border-b border-wood-50 hover:bg-cream-100/50">
                    <td className="px-4 py-3 font-mono text-wood-600">{product.code}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-wood-800">{product.name}</div>
                      {product.description && <div className="text-xs text-wood-400">{product.description}</div>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant={(product.current_stock ?? 0) <= (product.min_stock ?? 0) ? "warning" : "success"}>
                        {formatNumber(product.current_stock)} {product.unit || "pcs"}
                      </Badge>
                      {(product.min_stock ?? 0) > 0 && (
                        <div className="mt-1 text-xs text-wood-400">Min {formatNumber(product.min_stock)}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-wood-600">{formatIDR(product.purchase_price)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-wood-800 font-medium">{formatIDR(product.selling_price)}</td>
                    {canManageProducts && (
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button type="button" variant="ghost" size="icon" onClick={() => openEditModal(product)} aria-label="Edit produk" className="h-8 w-8 min-h-0 min-w-0 text-wood-400 hover:text-wood-600">
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button type="button" variant="ghost" size="icon" onClick={() => { setSelectedProduct(product); setDeleteDialogOpen(true); }} aria-label="Hapus produk" className="h-8 w-8 min-h-0 min-w-0 text-wood-400 hover:text-error hover:bg-error-bg">
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
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingProduct ? "Edit Produk" : "Tambah Produk"} size="md">
        <ModalContent>
          <div className="space-y-4">
            <Input label="Kode Produk" value={formData.code} onChange={(e) => setFormData({ ...formData, code: e.target.value })} placeholder="e.g., PRD-001" />
            <Input label="Nama Produk" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="Nama produk" />
            <Input label="Deskripsi" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder="Detail singkat produk" />
            <Select
              label="Satuan"
              value={formData.unit}
              onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
              options={UNITS.map((u) => ({ value: u, label: u }))}
            />
            <Input
              label={editingProduct ? "Biaya Rata-rata" : "Harga Beli"}
              type="number"
              value={formData.purchase_price || ""}
              onChange={(e) => setFormData({ ...formData, purchase_price: Number(e.target.value) })}
              placeholder="0"
              prefix="Rp"
              readOnly={!!editingProduct}
              helperText={editingProduct ? "Dihitung otomatis dari pembelian stok." : undefined}
            />
            <Input label="Harga Jual" type="number" value={formData.selling_price || ""} onChange={(e) => setFormData({ ...formData, selling_price: Number(e.target.value) })} placeholder="0" prefix="Rp" />
            {!editingProduct && (
              <Input label="Stok Awal" type="number" value={formData.current_stock || ""} onChange={(e) => setFormData({ ...formData, current_stock: Number(e.target.value) })} placeholder="0" />
            )}
            <Input label="Stok Minimum" type="number" value={formData.min_stock || ""} onChange={(e) => setFormData({ ...formData, min_stock: Number(e.target.value) })} placeholder="0" />
          </div>
        </ModalContent>
        <ModalFooter>
          <Button variant="ghost" onClick={() => setModalOpen(false)}>Batal</Button>
          <Button onClick={handleSave} loading={loading}>{editingProduct ? "Simpan" : "Tambah"}</Button>
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
