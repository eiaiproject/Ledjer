import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod/v3";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash } from "reicon-react";
import { useOrganization } from "@/hooks/useOrganization";
import { listAccounts, type Account } from "@/lib/api/accounts";
import { listProducts, type Product } from "@/lib/api/products";
import { postTransaction, type TransactionType } from "@/lib/api/transactions";
import { queryKeys, invalidateTransactionFinancialCaches } from "@/lib/query-keys";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Callout } from "@/components/ui/callout";
import { toast } from "@/components/ui/toast";
import { cn, createClientToken, formatDateInputValue, formatIDR, formatQuantity, parseAmountInput, parseSignedDecimalInput } from "@/lib/utils";
import { translateError } from "@/lib/errors";
import { TRANSACTION_TYPES, labelForTransactionType, counterAccountLabel, cashAccountLabel } from "@/lib/transactions";

const transactionSchema = z.object({
  transactionType: z.enum(["cash_in", "cash_out", "transfer", "owner_deposit", "owner_withdrawal", "purchase"]),
  transactionDate: z.string().min(1, "Tanggal wajib diisi"),
  cashAccountId: z.string().min(1, "Pilih akun kas/bank"),
  counterAccountId: z.string().optional(),
  amountIdr: z.string().optional(),
  description: z.string().min(1, "Keterangan wajib diisi").max(200, "Maksimal 200 karakter"),
});

type TransactionForm = z.infer<typeof transactionSchema>;

/** Label harga per baris produk: hanya baris pertama berlabel, ikut jenis transaksi. */
function unitPriceRowLabel(index: number, isPurchase: boolean): string | undefined {
  if (index !== 0) return undefined;
  return isPurchase ? "Harga Beli (Rp)" : "Harga Jual (Rp)";
}

interface FormItem {
  key: string;
  productId: string;
  quantity: string;
  unitPrice: string;
}

export function NewTransactionPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: orgData } = useOrganization();
  const orgId = orgData?.organization?.id;

  const accountsQuery = useQuery({
    queryKey: queryKeys.accounts.fullList(orgId ?? ""),
    queryFn: async () => {
      if (!orgId) throw new Error("No organization");
      return listAccounts({ includeInactive: false });
    },
    enabled: !!orgId,
  });

  const productsQuery = useQuery({
    queryKey: queryKeys.products.all(orgId),
    queryFn: async () => {
      if (!orgId) throw new Error("No organization");
      return listProducts(false);
    },
    enabled: !!orgId,
  });

  const idempotencyKeyRef = useRef(createClientToken());

  const [selectedType, setSelectedType] = useState<TransactionType>("cash_in");
  const [goodsSale, setGoodsSale] = useState(false);
  const [items, setItems] = useState<FormItem[]>([]);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<TransactionForm>({
    resolver: zodResolver(transactionSchema),
    defaultValues: {
      transactionType: "cash_in",
      transactionDate: formatDateInputValue(),
      cashAccountId: "",
      counterAccountId: "",
      amountIdr: "",
      description: "",
    },
  });

  const watchType = watch("transactionType");
  const watchCashAccountId = watch("cashAccountId");

  useEffect(() => {
    setSelectedType(watchType);
    // Reset akun lawan & item saat jenis transaksi berubah.
    setValue("counterAccountId", "");
    setItems([]);
    setGoodsSale(false);
  }, [watchType, setValue]);

  const accounts = useMemo(() => accountsQuery.data ?? [], [accountsQuery.data]);
  const products = useMemo(() => productsQuery.data ?? [], [productsQuery.data]);

  const cashBankAccounts = useMemo(
    () => accounts.filter((a) => a.account_subtype === "cash" || a.account_subtype === "bank"),
    [accounts],
  );
  const incomeAccounts = useMemo(
    () => accounts.filter((a) => a.account_class === "income"),
    [accounts],
  );
  const expenseAccounts = useMemo(
    () => accounts.filter((a) => a.account_class === "expense"),
    [accounts],
  );
  const equityAccounts = useMemo(
    () => accounts.filter((a) => a.account_class === "equity"),
    [accounts],
  );

  const isPurchase = selectedType === "purchase";
  const isGoodsSale = selectedType === "cash_in" && goodsSale;

  const counterOptions = useMemo(() => {
    switch (selectedType) {
      case "cash_in":
        return incomeAccounts;
      case "cash_out":
        return expenseAccounts;
      case "transfer":
        return cashBankAccounts.filter((a) => a.id !== watchCashAccountId);
      case "owner_deposit":
      case "owner_withdrawal":
        return equityAccounts;
      case "purchase":
        return [];
    }
  }, [selectedType, incomeAccounts, expenseAccounts, equityAccounts, cashBankAccounts, watchCashAccountId]);

  const productById = useMemo(() => {
    const map = new Map(products.map((p) => [p.id, p]));
    return (id: string): Product | undefined => map.get(id);
  }, [products]);

  /** Total nominal dihitung dari item (qty × harga) bila ada. */
  const computedTotal = useMemo(() => {
    if (items.length === 0) return null;
    let total = 0;
    for (const item of items) {
      const product = productById(item.productId);
      if (!product) continue;
      const qty = parseSignedDecimalInput(item.quantity, 0) ?? 0;
      const price = parseAmount(item.unitPrice);
      total += qty * price;
    }
    return Math.round(total);
  }, [items, productById]);

  const addItem = () => {
    setItems((prev) => [...prev, { key: createClientToken(), productId: "", quantity: "", unitPrice: "" }]);
  };

  const updateItem = (key: string, patch: Partial<FormItem>) => {
    setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  };

  const removeItem = (key: string) => {
    setItems((prev) => prev.filter((it) => it.key !== key));
  };

  const validateItems = (): FormItem[] | null => {
    const valid: FormItem[] = [];
    for (const item of items) {
      if (!item.productId) {
        toast.error("Pilih produk untuk setiap baris.");
        return null;
      }
      const qty = parseSignedDecimalInput(item.quantity, 0) ?? 0;
      if (qty <= 0) {
        toast.error("Jumlah produk harus lebih dari 0.");
        return null;
      }
      const price = parseAmount(item.unitPrice);
      if (!isPurchase && price <= 0) {
        toast.error("Harga jual harus lebih dari 0.");
        return null;
      }
      if (isPurchase && price < 0) {
        toast.error("Harga beli tidak valid.");
        return null;
      }
      valid.push({ ...item });
    }
    return valid.length > 0 ? valid : null;
  };

  const onSubmit = async (data: TransactionForm) => {
    if (!orgId) return;

    const isPurchaseSubmit = data.transactionType === "purchase";
    const withItems = isPurchaseSubmit || (data.transactionType === "cash_in" && goodsSale);

    let normalizedItems: FormItem[] = [];
    if (withItems) {
      const valid = validateItems();
      if (!valid) return;
      normalizedItems = valid;
    }

    const amount = withItems
      ? (computedTotal ?? 0)
      : (parseAmountInput(data.amountIdr) ?? 0);
    if (!withItems && (amount <= 0 || !Number.isFinite(amount))) {
      toast.error("Nominal harus lebih dari 0.");
      return;
    }
    if (withItems && amount <= 0) {
      toast.error("Total transaksi harus lebih dari 0.");
      return;
    }

    try {
      const result = await postTransaction({
        transactionType: data.transactionType,
        transactionDate: data.transactionDate,
        cashAccountId: data.cashAccountId,
        counterAccountId: isPurchaseSubmit ? undefined : data.counterAccountId || undefined,
        amountIdr: withItems ? undefined : amount,
        description: data.description.trim(),
        idempotencyKey: idempotencyKeyRef.current,
        items: withItems
          ? normalizedItems.map((item) => ({
              productId: item.productId,
              quantity: parseSignedDecimalInput(item.quantity, 0) ?? 0,
              ...(isPurchaseSubmit
                ? { unitCostIdr: parseAmount(item.unitPrice) }
                : { unitPriceIdr: parseAmount(item.unitPrice) }),
            }))
          : undefined,
      });
      invalidateTransactionFinancialCaches(queryClient, orgId);
      toast.success(result.replayed ? "Transaksi sudah tercatat sebelumnya." : "Transaksi berhasil dicatat.");
      navigate(`/transactions/${result.transaction_id}`);
    } catch (err) {
      toast.error(translateError(err));
    }
  };

  const accountOptions = (items: Account[]) =>
    items.map((account) => ({
      value: account.id,
      label: `${account.code} · ${account.name}`,
    }));

  const productOptions = products.map((product) => ({
    value: product.id,
    label: `${product.name} (stok ${formatQuantity(product.current_stock)} ${product.unit})`,
  }));

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader
        title="Transaksi Baru"
        description="Catat uang masuk, uang keluar, transfer, modal, pembelian barang, atau pengambilan pemilik."
      />

      {accountsQuery.isError && (
        <Callout variant="error">Gagal memuat daftar akun. Muat ulang halaman dan coba lagi.</Callout>
      )}

      <Card elevated>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Select
              label="Jenis Transaksi"
              required
              error={errors.transactionType?.message}
              placeholder="Pilih jenis transaksi"
              options={TRANSACTION_TYPES.map((type) => ({
                value: type,
                label: labelForTransactionType(type),
              }))}
              {...register("transactionType")}
            />

            <Input
              label="Tanggal"
              type="date"
              required
              error={errors.transactionDate?.message}
              {...register("transactionDate")}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                label={cashAccountLabel(selectedType)}
                required
                error={errors.cashAccountId?.message}
                placeholder="Pilih akun"
                options={accountOptions(cashBankAccounts)}
                {...register("cashAccountId")}
              />
              {isPurchase ? (
                <div className="flex items-end pb-2">
                  <p className="w-full rounded-md border border-wood-200 bg-cream-100 px-3 py-2.5 text-sm text-text-secondary">
                    Akun Persediaan (otomatis)
                  </p>
                </div>
              ) : (
                <Select
                  label={counterAccountLabel(selectedType)}
                  required
                  error={errors.counterAccountId?.message}
                  placeholder="Pilih akun"
                  options={accountOptions(counterOptions)}
                  {...register("counterAccountId")}
                />
              )}
            </div>

            {!isPurchase && !isGoodsSale && (
              <Input
                label="Nominal (Rp)"
                isCurrency
                required
                inputMode="numeric"
                placeholder="0"
                error={errors.amountIdr?.message}
                {...register("amountIdr")}
              />
            )}

            {!isPurchase && selectedType === "cash_in" && !goodsSale && (
              <button
                type="button"
                onClick={() => setGoodsSale(true)}
                className="block min-h-[24px] text-left text-sm text-wood-600 underline underline-offset-2 hover:text-wood-800"
              >
                Ini penjualan barang? Isi daftar produknya di sini.
              </button>
            )}

            {(isPurchase || (selectedType === "cash_in" && goodsSale)) && (
              <div className="space-y-3 rounded-md border border-wood-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-text-primary">
                    {isPurchase ? "Barang yang Dibeli" : "Barang yang Terjual"}
                  </p>
                  <Button type="button" variant="outline" size="sm" onClick={addItem}>
                    <Plus className="h-4 w-4" />
                    Tambah Baris
                  </Button>
                </div>

                {items.length > 0 && (
                  <ul className="space-y-3">
                    {items.map((item, index) => {
                      const product = productById(item.productId);
                      const stockOk = !isPurchase && product !== undefined
                        ? (parseSignedDecimalInput(item.quantity, 0) ?? 0) <= product.current_stock
                        : true;
                      return (
                        <li key={item.key} className="grid gap-2 sm:grid-cols-[1fr_110px_130px_auto]">
                          <Select
                            label={index === 0 ? "Produk" : undefined}
                            value={item.productId}
                            onChange={(e) => updateItem(item.key, { productId: e.target.value })}
                            options={productOptions}
                            placeholder="Pilih produk"
                          />
                          <Input
                            label={index === 0 ? "Jumlah" : undefined}
                            inputMode="decimal"
                            placeholder="0"
                            value={item.quantity}
                            onChange={(e) => updateItem(item.key, { quantity: e.target.value })}
                            error={!stockOk ? "Melebihi stok" : undefined}
                          />
                          <Input
                            label={unitPriceRowLabel(index, isPurchase)}
                            isCurrency
                            inputMode="numeric"
                            placeholder="0"
                            value={item.unitPrice}
                            onChange={(e) => updateItem(item.key, { unitPrice: e.target.value })}
                          />
                          <div className={cn("flex items-end", index === 0 && "pt-2")}>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              aria-label={`Hapus baris ${index + 1}`}
                              onClick={() => removeItem(item.key)}
                            >
                              <Trash className="h-4 w-4" />
                            </Button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}

                {items.length > 0 && computedTotal !== null && (
                  <p className="flex items-center justify-between border-t border-wood-100 pt-3 text-sm">
                    <span className="text-text-secondary">Total</span>
                    <span className="num-mono font-semibold text-text-primary">{formatIDR(computedTotal)}</span>
                  </p>
                )}
              </div>
            )}

            <Input
              label="Keterangan"
              required
              error={errors.description?.message}
              placeholder="Contoh: Penjualan tunai 3 Mei"
              {...register("description")}
            />

            <div className={cn("flex items-center justify-end gap-2 pt-2")}>
              <Button type="button" variant="secondary" onClick={() => navigate("/transactions")}>
                Batal
              </Button>
              <Button
                type="submit"
                loading={isSubmitting}
                disabled={!orgId || accountsQuery.isLoading || productsQuery.isLoading}
              >
                Simpan Transaksi
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

/** Parse input rupiah (mungkin diformat) menjadi bilangan bulat IDR. */
function parseAmount(raw: string): number {
  const digits = raw.replace(/[^\d]/g, "");
  const value = Number(digits);
  return Number.isFinite(value) ? value : 0;
}