import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Controller, useForm, useWatch } from "react-hook-form";
import { z } from "zod/v4";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/database-types";
import { formatAmountInput, parseAmountInput, parseDecimalInput } from "@/lib/utils";
import { useOrganization, useOrgPermissions } from "@/hooks/useOrganization";
import { Link } from "react-router-dom";
import { DollarSign, FileText, Download, ShoppingCart, ClipboardList, CreditCard, Receipt, Landmark, Wallet, ArrowRightLeft } from "lucide-react";
import {
  fetchMonthlyTransactionUsage,
  FREE_PLAN_TRANSACTION_LIMIT,
} from "@/lib/transaction-usage";
import {
  TRANSACTION_TYPE_LABELS,
  partyTypeForTransaction,
  usesCashAccount,
  usesCategory,
  usesDestinationAccount,
  usesParty,
  usesPaymentStatus,
} from "@/lib/transactions";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/select";

const transactionSchema = z.object({
  transactionDate: z.string().min(1, "Tanggal wajib diisi"),
  transactionType: z.string().min(1, "Jenis transaksi wajib dipilih"),
  amount: z.number().min(1, "Nominal harus lebih dari 0"),
  partyName: z.string().optional(),
  categoryName: z.string().optional(),
  cashAccountId: z.string().optional(),
  bankName: z.string().optional(),
  destinationCashAccountId: z.string().optional(),
  paymentStatus: z.enum(["paid", "unpaid", "partial"]),
  partialAmount: z.number().optional(),
  dueDate: z.string().optional(),
  description: z.string().min(1, "Deskripsi wajib diisi"),
  notes: z.string().optional(),
  productId: z.string().optional(),
  quantity: z.number().optional(),
  unitPrice: z.number().optional(),
});

type TransactionForm = z.infer<typeof transactionSchema>;
type PostTransactionArgs = Database["public"]["Functions"]["post_transaction"]["Args"];

const TRANSACTION_TYPES = [
  { value: "cash_sale", label: TRANSACTION_TYPE_LABELS.cash_sale, icon: DollarSign },
  { value: "credit_sale", label: TRANSACTION_TYPE_LABELS.credit_sale, icon: FileText },
  { value: "receive_receivable", label: TRANSACTION_TYPE_LABELS.receive_receivable, icon: Download },
  { value: "cash_purchase", label: TRANSACTION_TYPE_LABELS.cash_purchase, icon: ShoppingCart },
  { value: "credit_purchase", label: TRANSACTION_TYPE_LABELS.credit_purchase, icon: ClipboardList },
  { value: "pay_payable", label: TRANSACTION_TYPE_LABELS.pay_payable, icon: CreditCard },
  { value: "expense_payment", label: TRANSACTION_TYPE_LABELS.expense_payment, icon: Receipt },
  { value: "owner_capital", label: TRANSACTION_TYPE_LABELS.owner_capital, icon: Landmark },
  { value: "owner_draw", label: TRANSACTION_TYPE_LABELS.owner_draw, icon: Wallet },
  { value: "cash_transfer", label: TRANSACTION_TYPE_LABELS.cash_transfer, icon: ArrowRightLeft },
];

const EXPENSE_CATEGORIES = [
  "Gaji",
  "Sewa",
  "Listrik dan Air",
  "Internet dan Telepon",
  "Transportasi",
  "Iklan dan Promosi",
  "Perlengkapan",
  "Software / Langganan",
  "Lain-lain",
];

interface ImpactSummary {
  debit_account: string;
  credit_account: string;
  debit_change: string;
  credit_change: string;
}

const PARTY_COPY: Record<string, { label: string; placeholder: string }> = {
  credit_sale: { label: "Pelanggan", placeholder: "Ketik nama pelanggan..." },
  receive_receivable: { label: "Pelanggan yang membayar", placeholder: "Ketik nama pelanggan..." },
  credit_purchase: { label: "Supplier", placeholder: "Ketik nama supplier..." },
  pay_payable: { label: "Supplier yang dibayar", placeholder: "Ketik nama supplier..." },
};

const CASH_ACCOUNT_LABELS: Record<string, string> = {
  cash_sale: "Uang masuk ke akun",
  credit_sale: "Uang diterima lewat akun",
  receive_receivable: "Uang diterima lewat akun",
  cash_purchase: "Uang keluar dari akun",
  credit_purchase: "Uang dibayar lewat akun",
  pay_payable: "Uang dibayar lewat akun",
  expense_payment: "Uang keluar dari akun",
  owner_capital: "Modal masuk ke akun",
  owner_draw: "Uang diambil dari akun",
  cash_transfer: "Sumber transfer",
};

const CATEGORY_LABELS: Record<string, string> = {
  cash_purchase: "Kategori pembelian",
  credit_purchase: "Kategori pembelian",
  expense_payment: "Kategori beban",
};

const DESCRIPTION_PLACEHOLDERS: Record<string, string> = {
  cash_sale: "Contoh: Penjualan tunai produk A",
  credit_sale: "Contoh: Penjualan kredit produk A ke Budi",
  receive_receivable: "Contoh: Pelunasan piutang dari Budi",
  cash_purchase: "Contoh: Pembelian perlengkapan toko",
  credit_purchase: "Contoh: Pembelian kredit dari supplier",
  pay_payable: "Contoh: Pembayaran utang ke supplier",
  expense_payment: "Contoh: Pembayaran listrik bulan ini",
  owner_capital: "Contoh: Setoran modal pemilik",
  owner_draw: "Contoh: Pengambilan pribadi pemilik",
  cash_transfer: "Contoh: Transfer dari Kas ke Bank",
};

export function NewTransactionPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: orgData } = useOrganization();
  const { canCreateTransaction } = useOrgPermissions();
  const [impact, setImpact] = useState<ImpactSummary | null>(null);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    setError,
    formState: { errors },
  } = useForm<TransactionForm>({
    resolver: zodResolver(transactionSchema),
    defaultValues: {
      transactionDate: new Date().toISOString().split("T")[0],
      paymentStatus: "unpaid",
      description: "",
    },
  });

  const selectedType = useWatch({ control, name: "transactionType" });
  const selectedPaymentStatus = useWatch({ control, name: "paymentStatus" });
  const selectedAmount = useWatch({ control, name: "amount" });
  const amountDisplay = formatAmountInput(selectedAmount, true);

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, "");
    const numValue = value ? parseInt(value, 10) : 0;
    setValue("amount", numValue, { shouldDirty: true, shouldValidate: true });
  };

  const selectedProductId = useWatch({ control, name: "productId" });
  const selectedQuantity = useWatch({ control, name: "quantity" });
  const selectedUnitPrice = useWatch({ control, name: "unitPrice" });
  const selectedCashAccountId = useWatch({ control, name: "cashAccountId" });
  const selectedDestinationCashAccountId = useWatch({ control, name: "destinationCashAccountId" });

  useEffect(() => {
    if (selectedProductId && selectedQuantity && selectedUnitPrice) {
      const calculatedAmount = selectedQuantity * selectedUnitPrice;
      if (calculatedAmount > 0) {
        setValue("amount", calculatedAmount, { shouldDirty: true, shouldValidate: true });
      }
    }
  }, [selectedProductId, selectedQuantity, selectedUnitPrice, setValue]);

  const { data: accounts } = useQuery({
    queryKey: ["accounts", orgData?.organization?.id],
    queryFn: async () => {
      if (!orgData?.organization?.id) return [];
      const { data, error } = await supabase
        .from("accounts")
        .select("id, code, name, account_type, is_cash_account")
        .eq("organization_id", orgData.organization.id)
        .eq("is_active", true)
        .order("code");
      if (error) throw error;
      return data || [];
    },
    enabled: !!orgData?.organization?.id,
  });

  const { data: parties } = useQuery({
    queryKey: ["parties", orgData?.organization?.id],
    queryFn: async () => {
      if (!orgData?.organization?.id) return [];
      const { data, error } = await supabase
        .from("parties")
        .select("id, name")
        .eq("organization_id", orgData.organization.id)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data || [];
    },
    enabled: !!orgData?.organization?.id,
  });

  const { data: products } = useQuery({
    queryKey: ["products", orgData?.organization?.id],
    queryFn: async () => {
      if (!orgData?.organization?.id) return [];
      const { data, error } = await supabase
        .from("products")
        .select("id, code, name, current_stock")
        .eq("organization_id", orgData.organization.id)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data || [];
    },
    enabled: !!orgData?.organization?.id,
  });

  const cashAccountOptions = (() => {
    return (accounts || [])
      .filter((account) => account.account_type === "asset" && account.is_cash_account)
      .map((account) => ({
        id: account.id,
        label: `${account.code} - ${account.name}`,
        kind: account.code === 1110 ? "cash" : "bank",
      }));
  })();

  const selectedCashAccountOption = cashAccountOptions.find((a) => a?.id === selectedCashAccountId);
  const selectedDestinationCashAccountOption = cashAccountOptions.find((a) => a?.id === selectedDestinationCashAccountId);
  const showBankNameField = selectedCashAccountOption?.kind === "bank" || selectedDestinationCashAccountOption?.kind === "bank";

  const { data: monthlyUsage } = useQuery({
    queryKey: ["monthly-usage", orgData?.organization?.id],
    queryFn: async () => {
      if (!orgData?.organization?.id) return null;
      return fetchMonthlyTransactionUsage(orgData.organization.id);
    },
    enabled: !!orgData?.organization?.id && orgData.organization.current_plan === "free",
  });

  const isFreePlan = orgData?.organization?.current_plan === "free";
  const usageCount = monthlyUsage?.count || 0;
  const usageLimit = monthlyUsage?.limit ?? FREE_PLAN_TRANSACTION_LIMIT;
  const isAtLimit = isFreePlan && usageCount >= usageLimit;

  const postMutation = useMutation({
    mutationFn: async (data: TransactionForm) => {
      const organizationId = orgData?.organization?.id;
      if (!organizationId) throw new Error("Organisasi tidak ditemukan");

      const shouldUseParty = usesParty(data.transactionType);
      const shouldUseCategory = usesCategory(data.transactionType);
      const shouldUseCashAccount = usesCashAccount(data.transactionType);
      const shouldUseDestinationAccount = usesDestinationAccount(data.transactionType);
      const shouldUsePaymentStatus = usesPaymentStatus(data.transactionType);
      const paymentStatus = shouldUsePaymentStatus ? data.paymentStatus : "paid";
      const shouldSendCashAccount = shouldUseCashAccount || (shouldUsePaymentStatus && paymentStatus === "partial");
      let partyId: string | null = null;

      if (shouldUseParty && data.partyName && data.partyName.trim()) {
        const partyName = data.partyName.trim();
        const { data: existingParties, error: partyLookupError } = await supabase
          .from("parties")
          .select("id")
          .eq("organization_id", organizationId)
          .ilike("name", partyName)
          .limit(1);
        if (partyLookupError) throw partyLookupError;

        if (existingParties && existingParties.length > 0) {
          partyId = existingParties[0].id;
        } else {
          const { data: newParty, error: partyError } = await supabase
            .from("parties")
            .insert({
              organization_id: organizationId,
              name: partyName,
              party_type: partyTypeForTransaction(data.transactionType),
              is_active: true,
            })
            .select("id")
            .single();
          if (partyError) throw partyError;
          partyId = newParty.id;
        }
      }

      const rpcParams: PostTransactionArgs = {
        p_organization_id: organizationId,
        p_transaction_date: data.transactionDate,
        p_transaction_type: data.transactionType,
        p_amount: data.amount,
        p_party_id: shouldUseParty ? partyId : null,
        p_category_name: shouldUseCategory ? data.categoryName?.trim() || null : null,
        p_cash_account_id: shouldSendCashAccount ? data.cashAccountId || null : null,
        p_destination_cash_account_id: shouldUseDestinationAccount ? data.destinationCashAccountId || null : null,
        p_payment_status: paymentStatus,
        p_due_date: shouldUsePaymentStatus && paymentStatus !== "paid" ? data.dueDate || null : null,
        p_description: data.description,
        p_notes: data.bankName ? `Bank: ${data.bankName}${data.notes ? '\n' + data.notes : ''}` : (data.notes || null),
      };

      if (paymentStatus === "partial" && data.partialAmount !== undefined && data.partialAmount !== null) {
        rpcParams.p_partial_amount = data.partialAmount;
      }

      if (data.productId) {
        rpcParams.p_product_id = data.productId;
        rpcParams.p_quantity = data.quantity !== undefined && data.quantity !== null ? data.quantity : null;
        rpcParams.p_unit_price = data.unitPrice !== undefined && data.unitPrice !== null ? data.unitPrice : null;
      }

      const { data: result, error } = await supabase.rpc("post_transaction", rpcParams);
      if (error) {
        if (error.code === "PGRST202") {
          throw new Error("Database Supabase belum memakai migration transaksi terbaru. Jalankan migration terbaru agar transaksi produk/pembayaran sebagian tersedia.");
        }
        throw error;
      }
      return result as unknown as { transaction_id: string; impact: ImpactSummary };
    },
    onSuccess: (result) => {
      setImpact(result.impact);
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["monthly-usage"] });
    },
  });

  const onSubmit = (data: TransactionForm) => {
    if (usesParty(data.transactionType) && !data.partyName?.trim()) {
      setError("partyName", { type: "manual", message: "Isi nama pihak" });
      return;
    }

    const needsCashAccount = usesCashAccount(data.transactionType) || (usesPaymentStatus(data.transactionType) && data.paymentStatus === "partial");
    if (needsCashAccount && !data.cashAccountId) {
      setError("cashAccountId", { type: "manual", message: "Pilih akun kas/bank" });
      return;
    }

    if (usesDestinationAccount(data.transactionType) && !data.destinationCashAccountId) {
      setError("destinationCashAccountId", { type: "manual", message: "Pilih akun tujuan" });
      return;
    }

    if (data.transactionType === "cash_transfer" && data.cashAccountId === data.destinationCashAccountId) {
      setError("destinationCashAccountId", { type: "manual", message: "Akun tujuan harus berbeda" });
      return;
    }

    if (usesPaymentStatus(data.transactionType) && data.paymentStatus === "partial") {
      if (!data.partialAmount || data.partialAmount <= 0) {
        setError("partialAmount", { type: "manual", message: "Isi jumlah pembayaran sebagian" });
        return;
      }
      if (data.partialAmount >= data.amount) {
        setError("partialAmount", { type: "manual", message: "Jumlah pembayaran sebagian harus lebih kecil dari nominal" });
        return;
      }
    }

    if (data.productId) {
      if (!data.quantity || data.quantity <= 0) {
        setError("quantity", { type: "manual", message: "Isi kuantitas produk" });
        return;
      }
      if (data.unitPrice === undefined || data.unitPrice < 0) {
        setError("unitPrice", { type: "manual", message: "Isi harga satuan produk" });
        return;
      }
      if (Math.abs(data.amount - data.quantity * data.unitPrice) > 0.01) {
        setError("amount", { type: "manual", message: "Nominal harus sama dengan kuantitas x harga satuan" });
        return;
      }
    }

    postMutation.mutate(data);
  };

  if (impact) {
    return (
      <div className="mx-auto max-w-lg px-4 py-8">
        <div className="rounded-lg border border-leaf-200 bg-leaf-50 p-6 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-leaf-100">
            <svg className="h-6 w-6 text-leaf-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-leaf-800">Transaksi Berhasil!</h2>
          <div className="mt-4 space-y-2 text-sm text-leaf-700">
            <p>
              <strong>{impact.debit_account}</strong>{" "}
              {impact.debit_change === "increase" ? "bertambah" : "berkurang"}
            </p>
            <p>
              <strong>{impact.credit_account}</strong>{" "}
              {impact.credit_change === "increase" ? "bertambah" : "berkurang"}
            </p>
          </div>
          <div className="mt-6 flex gap-3">
            <button
              onClick={() => { setImpact(null); postMutation.reset(); }}
              className="flex-1 rounded-md border border-leaf-300 px-4 py-2 text-sm font-medium text-leaf-700 hover:bg-leaf-100"
            >
              Tambah Lagi
            </button>
            <button
              onClick={() => navigate("/transactions")}
              className="flex-1 rounded-md bg-leaf-500 px-4 py-2 text-sm font-medium text-white hover:bg-leaf-600"
            >
              Lihat Transaksi
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (orgData?.member && !canCreateTransaction) {
    return (
      <div className="mx-auto max-w-lg px-4 py-8">
        <Card>
          <CardContent className="text-center py-8">
            <h1 className="text-lg font-semibold text-wood-800">Tidak ada akses</h1>
            <p className="mt-2 text-sm text-wood-500">Anda tidak memiliki izin untuk mencatat transaksi.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const showPaymentStatus = usesPaymentStatus(selectedType);
  const showCashAccount = usesCashAccount(selectedType) || (showPaymentStatus && selectedPaymentStatus === "partial");
  const showDestinationAccount = usesDestinationAccount(selectedType);
  const showParty = usesParty(selectedType);
  const showCategory = usesCategory(selectedType);
  const showDueDate = showPaymentStatus && selectedPaymentStatus !== "paid";
  const selectedTypeKey = selectedType || "";
  const partyCopy = PARTY_COPY[selectedTypeKey] || { label: "Pihak", placeholder: "Ketik nama pihak..." };
  const cashAccountLabel = CASH_ACCOUNT_LABELS[selectedTypeKey] || "Akun kas/bank";
  const categoryLabel = CATEGORY_LABELS[selectedTypeKey] || "Kategori";
  const descriptionPlaceholder = DESCRIPTION_PLACEHOLDERS[selectedTypeKey] || "Contoh: Keterangan transaksi";

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-wood-800">Transaksi Baru</h1>

      {isFreePlan && (
        <div className={`mb-4 rounded-md p-3 text-sm ${
          isAtLimit ? "border border-error/30 bg-error/10 text-error"
            : usageCount >= 40 ? "border border-clay-400/30 bg-clay-400/10 text-clay-600"
            : "border border-wood-200 bg-cream-100 text-wood-600"
        }`}>
          {isAtLimit ? (
            <div>
              <p className="font-medium">Limit transaksi bulanan tercapai ({usageLimit}/{usageLimit})</p>
              <p className="mt-1">Upgrade ke paket Solo untuk transaksi unlimited.</p>
              <Link to="/settings/billing" className="mt-2 inline-block font-medium underline">Lihat paket →</Link>
            </div>
          ) : (
            <p>
              Paket Gratis: {usageCount}/{usageLimit} transaksi bulan ini
              {usageCount >= usageLimit * 0.8 && <span className="ml-1">— pertimbangkan upgrade</span>}
            </p>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <input type="hidden" {...register("amount", { valueAsNumber: true })} value={selectedAmount ?? ""} readOnly />

        {postMutation.isError && (
          <div className="rounded-md bg-error/10 p-3 text-sm text-error">
            {(postMutation.error as Error).message || "Gagal memproses transaksi"}
          </div>
        )}

        {/* Transaction Type */}
        <div>
          <label className="block text-sm font-medium text-wood-700">Transaksi ini tentang apa?</label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {TRANSACTION_TYPES.map((t) => (
              <label
                key={t.value}
                className={`flex cursor-pointer items-center gap-2 rounded-md border p-3 text-sm transition-colors ${
                  selectedType === t.value
                    ? "border-leaf-500 bg-leaf-50 text-leaf-700"
                    : "border-wood-200 hover:border-wood-300"
                }`}
              >
                <input type="radio" value={t.value} {...register("transactionType")} className="sr-only" />
                <t.icon className="h-4 w-4 shrink-0" />
                <span>{t.label}</span>
              </label>
            ))}
          </div>
          {errors.transactionType && <p className="mt-1 text-xs text-error">{errors.transactionType.message}</p>}
        </div>

        {/* Date */}
        <div>
          <label className="block text-sm font-medium text-wood-700">Tanggal berapa?</label>
          <input
            type="date"
            {...register("transactionDate")}
            className="mt-1 block w-full rounded-md border border-wood-200 bg-cream-50 px-3 py-2 shadow-xs focus:border-leaf-500 focus:outline-none focus:ring-2 focus:ring-leaf-500"
          />
          {errors.transactionDate && <p className="mt-1 text-xs text-error">{errors.transactionDate.message}</p>}
        </div>

        {/* Amount */}
        <div>
          <label className="block text-sm font-medium text-wood-700">Berapa nominalnya?</label>
          <input
            type="text"
            inputMode="numeric"
            value={amountDisplay}
            onChange={handleAmountChange}
            className="mt-1 block w-full rounded-md border border-wood-200 bg-cream-50 px-3 py-2 shadow-xs focus:border-leaf-500 focus:outline-none focus:ring-2 focus:ring-leaf-500"
            placeholder="0"
          />
          {errors.amount && <p className="mt-1 text-xs text-error">{errors.amount.message}</p>}
        </div>

        {/* Party */}
        {showParty && (
          <div>
            <label className="block text-sm font-medium text-wood-700">{partyCopy.label}</label>
            <input
              type="text"
              list="parties-list"
              {...register("partyName")}
              className="mt-1 block w-full rounded-md border border-wood-200 bg-cream-50 px-3 py-2 shadow-xs focus:border-leaf-500 focus:outline-none focus:ring-2 focus:ring-leaf-500"
              placeholder={partyCopy.placeholder}
            />
            <datalist id="parties-list">
              {parties?.map((p) => <option key={p.id} value={p.name} />)}
            </datalist>
            {errors.partyName && <p className="mt-1 text-xs text-error">{errors.partyName.message}</p>}
          </div>
        )}

        {/* Cash Account */}
        {showCashAccount && (
          <>
            <Select
              label={cashAccountLabel}
              {...register("cashAccountId")}
              options={cashAccountOptions.map((a) => ({ value: a.id, label: a.label }))}
              placeholder="Pilih Kas atau Bank..."
              error={errors.cashAccountId?.message}
            />
            {showBankNameField && (
              <div>
                <label className="block text-sm font-medium text-wood-700">Nama bank</label>
                <input
                  type="text"
                  {...register("bankName")}
                  className="mt-1 block w-full rounded-md border border-wood-200 bg-cream-50 px-3 py-2 shadow-xs focus:border-leaf-500 focus:outline-none focus:ring-2 focus:ring-leaf-500"
                  placeholder="Contoh: BCA, Mandiri, BRI, BNI..."
                />
              </div>
            )}
          </>
        )}

        {/* Destination Account */}
        {showDestinationAccount && (
          <Select
            label="Tujuan transfer"
            {...register("destinationCashAccountId")}
            options={cashAccountOptions.map((a) => ({ value: a.id, label: a.label }))}
            placeholder="Pilih akun tujuan..."
            error={errors.destinationCashAccountId?.message}
          />
        )}

        {/* Category */}
        {showCategory && (
          <Select
            label={categoryLabel}
            {...register("categoryName")}
            options={EXPENSE_CATEGORIES.map((c) => ({ value: c, label: c }))}
            placeholder="Pilih kategori..."
          />
        )}

        {/* Product Selection */}
        {(selectedType === "cash_purchase" || selectedType === "credit_purchase" || selectedType === "cash_sale" || selectedType === "credit_sale") && (
          <>
            <Select
              label="Produk (opsional - untuk stok)"
              {...register("productId")}
              options={products?.map((p) => ({ value: p.id, label: `${p.code} - ${p.name} (Stok: ${p.current_stock})` })) || []}
              placeholder="-- Tidak pakai stok --"
              helperText="Pilih produk jika transaksi ini mempengaruhi stok"
            />
            {selectedProductId && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-wood-700">Kuantitas</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    {...register("quantity", { setValueAs: parseDecimalInput })}
                    className="mt-1 block w-full rounded-md border border-wood-200 bg-cream-50 px-3 py-2 shadow-xs focus:border-leaf-500 focus:outline-none focus:ring-2 focus:ring-leaf-500"
                    placeholder="0"
                  />
                  {errors.quantity && <p className="mt-1 text-xs text-error">{errors.quantity.message}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-wood-700">Harga Satuan</label>
                  <Controller
                    control={control}
                    name="unitPrice"
                    render={({ field }) => (
                      <input
                        ref={field.ref}
                        name={field.name}
                        type="text"
                        inputMode="numeric"
                        value={formatAmountInput(field.value)}
                        onBlur={field.onBlur}
                        onChange={(event) => field.onChange(parseAmountInput(event.target.value))}
                        className="mt-1 block w-full rounded-md border border-wood-200 bg-cream-50 px-3 py-2 shadow-xs focus:border-leaf-500 focus:outline-none focus:ring-2 focus:ring-leaf-500"
                        placeholder="0"
                      />
                    )}
                  />
                  {errors.unitPrice && <p className="mt-1 text-xs text-error">{errors.unitPrice.message}</p>}
                </div>
              </div>
            )}
          </>
        )}

        {/* Payment Status */}
        {showPaymentStatus && (
          <>
            <Select
              label="Sudah dibayar atau belum?"
              {...register("paymentStatus")}
              options={[
                { value: "unpaid", label: "Belum dibayar" },
                { value: "partial", label: "Sebagian dibayar" },
              ]}
            />
            {selectedPaymentStatus === "partial" && (
              <div>
                <label className="block text-sm font-medium text-wood-700">Jumlah yang dibayar saat ini</label>
                <Controller
                  control={control}
                  name="partialAmount"
                  render={({ field }) => (
                    <input
                      ref={field.ref}
                      name={field.name}
                      type="text"
                      inputMode="numeric"
                      value={formatAmountInput(field.value)}
                      onBlur={field.onBlur}
                      onChange={(event) => field.onChange(parseAmountInput(event.target.value))}
                      className="mt-1 block w-full rounded-md border border-wood-200 bg-cream-50 px-3 py-2 shadow-xs focus:border-leaf-500 focus:outline-none focus:ring-2 focus:ring-leaf-500"
                      placeholder="0"
                    />
                  )}
                />
                {errors.partialAmount && <p className="mt-1 text-xs text-error">{errors.partialAmount.message}</p>}
              </div>
            )}
          </>
        )}

        {/* Due Date */}
        {showDueDate && (
          <div>
            <label className="block text-sm font-medium text-wood-700">Jatuh tempo</label>
            <input
              type="date"
              {...register("dueDate")}
              className="mt-1 block w-full rounded-md border border-wood-200 bg-cream-50 px-3 py-2 shadow-xs focus:border-leaf-500 focus:outline-none focus:ring-2 focus:ring-leaf-500"
            />
          </div>
        )}

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-wood-700">Deskripsi</label>
          <input
            {...register("description")}
            className="mt-1 block w-full rounded-md border border-wood-200 bg-cream-50 px-3 py-2 shadow-xs focus:border-leaf-500 focus:outline-none focus:ring-2 focus:ring-leaf-500"
            placeholder={descriptionPlaceholder}
          />
          {errors.description && <p className="mt-1 text-xs text-error">{errors.description.message}</p>}
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-wood-700">Catatan (opsional)</label>
          <textarea
            {...register("notes")}
            rows={2}
            className="mt-1 block w-full rounded-md border border-wood-200 bg-cream-50 px-3 py-2 shadow-xs focus:border-leaf-500 focus:outline-none focus:ring-2 focus:ring-leaf-500"
            placeholder="Catatan tambahan..."
          />
        </div>

        <button
          type="submit"
          disabled={postMutation.isPending || isAtLimit}
          className="w-full rounded-md bg-leaf-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-leaf-600 disabled:opacity-50"
        >
          {postMutation.isPending ? "Memproses..." : "Catat Transaksi"}
        </button>
      </form>
    </div>
  );
}
