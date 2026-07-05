import { useEffect, useMemo, useRef, useState } from "react";
import { useBlocker, useNavigate } from "react-router-dom";
import { Controller, useForm, useWatch } from "react-hook-form";
import { z } from "zod/v3";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Database } from "@ledjer/database-types";
import { formatAmountInput, formatDateInputValue, formatNumber, parseAmountInput } from "@/lib/utils";
import { useOrganization, useOrgPermissions } from "@/hooks/useOrganization";
import { queryKeys, invalidateTransactionFinancialCaches } from "@/lib/query-keys";
import { fetchMonthlyTransactionUsage, FREE_PLAN_TRANSACTION_LIMIT } from "@/lib/transaction-usage";
import {
  usesCashAccount,
  usesCategory,
  usesDestinationAccount,
  usesParty,
  usesPaymentStatus,
} from "@/lib/transactions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Combobox } from "@/components/ui/combobox";
import { ErrorState } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  TransactionTypeSelector,
  PaymentStatusSelector,
  ProductDetailFields,
  ReviewPanel,
  MobileReviewToggle,
  PlanUsageBanner,
  SubmitBar,
  ErrorSummary,
  UnsavedChangesDialog,
  SectionCard,
} from "./_components";
import {
  buildPreview,
  TRANSACTION_META,
  PARTY_COPY,
  CASH_ACCOUNT_LABELS,
  CASH_ACCOUNT_PLACEHOLDERS,
  CATEGORY_LABELS,
  DESCRIPTION_PLACEHOLDERS,
  SECTION_LABELS,
  generateAutoDescription,
  getSubmitLabel,
} from "./_helpers";

/* ------------------------------------------------------------------ */
/*  Schema                                                             */
/* ------------------------------------------------------------------ */

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
  debitAccountId: z.string().optional(),
});

type TransactionForm = z.infer<typeof transactionSchema>;
type TransactionSubmission = TransactionForm & { clientToken: string };

type PostTransactionArgs = Database["public"]["Functions"]["post_transaction"]["Args"];

interface ImpactSummary {
  debit_account: string;
  credit_account: string;
  debit_change: string;
  credit_change: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function localDate(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return formatDateInputValue(date);
}

function getLastCashAccountKey(transactionType: string) {
  return `ledjer:last-cash-account:${transactionType}`;
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export function NewTransactionPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: orgData } = useOrganization();
  const { canCreateTransaction } = useOrgPermissions();
  const [manualAmount, setManualAmount] = useState(false);
  const [successTransactionId, setSuccessTransactionId] = useState<string | null>(null);
  const [clientToken, setClientToken] = useState(() => crypto.randomUUID());
  const [isTypeSelectorExpanded, setIsTypeSelectorExpanded] = useState(true);
  const errorSummaryRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const activeFieldsRef = useRef<HTMLDivElement>(null);
  const previousTypeRef = useRef<string>("");
  const submitInFlightRef = useRef(false);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    setError,
    clearErrors,
    getValues,
    formState,
  } = useForm<TransactionForm>({
    resolver: zodResolver(transactionSchema),
    defaultValues: {
      transactionDate: localDate(),
      paymentStatus: "unpaid",
      description: "",
      amount: 0,
    },
  });

  const { errors, isDirty } = formState;

  /* -- Blocker & navigation safety -- */
  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    return isDirty && !successTransactionId && currentLocation.pathname !== nextLocation.pathname;
  });

  /* -- Watched values -- */
  const selectedType = useWatch({ control, name: "transactionType" }) || "";
  const selectedPaymentStatus = useWatch({ control, name: "paymentStatus" }) || "unpaid";
  const selectedAmount = useWatch({ control, name: "amount" }) || 0;
  const selectedProductId = useWatch({ control, name: "productId" });
  const selectedQuantity = useWatch({ control, name: "quantity" });
  const selectedUnitPrice = useWatch({ control, name: "unitPrice" });
  const selectedCashAccountId = useWatch({ control, name: "cashAccountId" });
  const selectedDestinationCashAccountId = useWatch({ control, name: "destinationCashAccountId" });
  const selectedPartyName = useWatch({ control, name: "partyName" }) || "";
  const selectedCategoryName = useWatch({ control, name: "categoryName" }) || "";
  const selectedDebitAccountId = useWatch({ control, name: "debitAccountId" }) || "";
  const selectedDueDate = useWatch({ control, name: "dueDate" });
  const selectedPartialAmount = useWatch({ control, name: "partialAmount" }) || 0;

  /* -- Derived booleans -- */
  const selectedTypeLabel = selectedType ? (TRANSACTION_META[selectedType]?.label || selectedType) : "";
  const showPaymentStatus = usesPaymentStatus(selectedType);
  const showCashAccount = usesCashAccount(selectedType) || (showPaymentStatus && selectedPaymentStatus !== "unpaid");
  const showDestinationAccount = usesDestinationAccount(selectedType);
  const showParty = usesParty(selectedType);
  const showCategory = usesCategory(selectedType);
  const showDueDate = showPaymentStatus && selectedPaymentStatus !== "paid";
  const isProductType = selectedType === "cash_purchase" || selectedType === "credit_purchase" || selectedType === "cash_sale" || selectedType === "credit_sale";
  const isSaleType = selectedType === "cash_sale" || selectedType === "credit_sale";

  /* -- Query: accounts -- */
  const {
    data: accounts,
    isLoading: accountsLoading,
    error: accountsError,
    refetch: refetchAccounts,
  } = useQuery({
    queryKey: queryKeys.accounts.activeTransactionOptions(orgData?.organization?.id ?? ""),
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

  /* -- Query: expense/cogs accounts for CoA dropdown -- */
  const {
    data: expenseCogsAccounts,
    isLoading: expenseAccountsLoading,
    error: expenseAccountsError,
    refetch: refetchExpenseAccounts,
  } = useQuery({
    queryKey: queryKeys.accounts.expenseCogsOptions(orgData?.organization?.id ?? ""),
    queryFn: async () => {
      if (!orgData?.organization?.id) return [];
      const { data, error } = await supabase
        .from("accounts")
        .select("id, code, name, account_type")
        .eq("organization_id", orgData.organization.id)
        .eq("is_active", true)
        .in("account_type", ["expense", "cogs"])
        .order("code");
      if (error) throw error;
      return data || [];
    },
    enabled: !!orgData?.organization?.id,
  });

  /* -- Query: parties -- */
  const {
    data: parties,
    isLoading: partiesLoading,
    error: partiesError,
    refetch: refetchParties,
  } = useQuery({
    queryKey: queryKeys.parties.transactionOptions(orgData?.organization?.id ?? ""),
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

  /* -- Query: products -- */
  const {
    data: products,
    isLoading: productsLoading,
    error: productsError,
    refetch: refetchProducts,
  } = useQuery({
    queryKey: queryKeys.products.transactionOptions(orgData?.organization?.id ?? ""),
    queryFn: async () => {
      if (!orgData?.organization?.id) return [];
      const { data, error } = await supabase
        .from("products")
        .select("id, code, name, unit, purchase_price, selling_price, current_stock")
        .eq("organization_id", orgData.organization.id)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data || [];
    },
    enabled: !!orgData?.organization?.id,
  });

  /* -- Query: monthly usage -- */
  const {
    data: monthlyUsage,
    error: usageError,
    refetch: refetchMonthlyUsage,
  } = useQuery({
    queryKey: queryKeys.monthlyUsage(orgData?.organization?.id ?? ""),
    queryFn: async () => {
      if (!orgData?.organization?.id) return null;
      return fetchMonthlyTransactionUsage(orgData.organization.id);
    },
    enabled: !!orgData?.organization?.id && orgData.organization.current_plan === "free",
  });

  /* -- Derived data -- */
  const cashAccountOptions = useMemo(() => {
    return (accounts || [])
      .filter((account) => account.account_type === "asset" && account.is_cash_account)
      .map((account) => ({
        id: account.id,
        value: account.id,
        label: `${account.code} - ${account.name}`,
        secondaryLabel: account.code === 1110 ? "Kas" : "Bank",
        kind: account.code === 1110 ? "cash" : "bank",
      }));
  }, [accounts]);

  // ponytail: CoA dropdown options filtered by transaction type
  const debitAccountOptions = useMemo(() => {
    const accounts = expenseCogsAccounts || [];
    if (selectedType === "expense_payment") {
      // Expense payments: only operating expense accounts
      return accounts
        .filter((a) => a.account_type === "expense")
        .map((a) => ({ value: a.id, label: `${a.code} - ${a.name}` }));
    }
    // cash_purchase / credit_purchase without product: COGS + expense accounts
    return accounts.map((a) => ({ value: a.id, label: `${a.code} - ${a.name}` }));
  }, [expenseCogsAccounts, selectedType]);

  const selectedCashAccountOption = cashAccountOptions.find((account) => account.id === selectedCashAccountId);
  const selectedDestinationCashAccountOption = cashAccountOptions.find((account) => account.id === selectedDestinationCashAccountId);
  const selectedProduct = products?.find((product) => product.id === selectedProductId);
  const showBankNameField = selectedCashAccountOption?.kind === "bank" || selectedDestinationCashAccountOption?.kind === "bank";
  const partyCopy = PARTY_COPY[selectedType] || { label: "Pihak", placeholder: "Ketik nama pihak...", helper: "" };
  const cashAccountLabel = CASH_ACCOUNT_LABELS[selectedType] || "Akun kas/bank";
  const categoryLabel = CATEGORY_LABELS[selectedType] || "Kategori";
  const descriptionPlaceholder = DESCRIPTION_PLACEHOLDERS[selectedType] || "Contoh: Keterangan transaksi";
  const productSubtotal = selectedProductId && selectedQuantity && selectedUnitPrice ? selectedQuantity * selectedUnitPrice : 0;
  const remainingAmount = Math.max(selectedAmount - selectedPartialAmount, 0);
  const stockAfterSale = selectedProduct && selectedQuantity ? (selectedProduct.current_stock ?? 0) - selectedQuantity : null;
  const lookupError = accountsError || expenseAccountsError || partiesError || productsError;

  const retryLookups = () => {
    void refetchAccounts();
    void refetchExpenseAccounts();
    void refetchParties();
    void refetchProducts();
  };

  // ponytail: derive account name for preview from CoA or fallback to category/product name
  const debitAccountName = (() => {
    if (selectedProductId && selectedProduct) return selectedProduct.name;
    if (selectedDebitAccountId) {
      const account = expenseCogsAccounts?.find((a) => a.id === selectedDebitAccountId);
      if (account) return account.name;
    }
    return selectedCategoryName || "Beban / Pembelian";
  })();

  const preview = buildPreview({
    transactionType: selectedType,
    amount: selectedAmount,
    partialAmount: selectedPartialAmount,
    paymentStatus: selectedPaymentStatus,
    cashAccountLabel: selectedCashAccountOption?.label || "Kas / Bank",
    destinationAccountLabel: selectedDestinationCashAccountOption?.label || "Akun tujuan",
    categoryName: debitAccountName,
    productName: selectedProduct?.name || "",
  });

  const isFreePlan = orgData?.organization?.current_plan === "free";
  const usageCount = monthlyUsage?.count || 0;
  const usageLimit = monthlyUsage?.limit ?? FREE_PLAN_TRANSACTION_LIMIT;
  const isAtLimit = isFreePlan && usageCount >= usageLimit;

  /* -- Effects -- */

  // Before unload protection
  useEffect(() => {
    if (!isDirty || successTransactionId) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty, successTransactionId]);

  const showUnsavedDialog = blocker.state === "blocked" && isDirty && !successTransactionId;

  const handleUnsavedConfirm = () => {
    blocker.proceed?.();
  };

  const handleUnsavedCancel = () => {
    blocker.reset?.();
  };

  // Auto-set payment status & due date when type changes
  useEffect(() => {
    if (!selectedType) return;
    if (usesPaymentStatus(selectedType)) {
      const currentStatus = getValues("paymentStatus");
      if (!currentStatus || currentStatus === "paid") setValue("paymentStatus", "unpaid");
      if (!getValues("dueDate")) setValue("dueDate", localDate(30));
    } else {
      setValue("paymentStatus", "paid");
      setValue("dueDate", "");
    }

    const lastCashAccountId = window.localStorage.getItem(getLastCashAccountKey(selectedType));
    if (lastCashAccountId && cashAccountOptions.some((account) => account.id === lastCashAccountId)) {
      setValue("cashAccountId", lastCashAccountId);
    }

    // Auto-select first debit account when type changes and no product is selected
    if (usesCategory(selectedType) && !selectedProductId && debitAccountOptions.length > 0) {
      const current = getValues("debitAccountId");
      if (!current || !debitAccountOptions.some((a) => a.value === current)) {
        setValue("debitAccountId", debitAccountOptions[0].value, { shouldDirty: true, shouldValidate: true });
      }
    }
  }, [cashAccountOptions, debitAccountOptions, getValues, selectedProductId, selectedType, setValue]);

  // Auto-set due date if empty
  useEffect(() => {
    if (showDueDate && !selectedDueDate) setValue("dueDate", localDate(30));
  }, [selectedDueDate, setValue, showDueDate]);

  // Auto-fill product price and quantity
  useEffect(() => {
    if (!selectedProductId || !selectedProduct) return;
    if (!selectedQuantity) setValue("quantity", 1, { shouldDirty: true, shouldValidate: true });
    const defaultPrice = (isSaleType ? selectedProduct.selling_price : selectedProduct.purchase_price) ?? 0;
    if ((!selectedUnitPrice || selectedUnitPrice <= 0) && defaultPrice > 0) {
      setValue("unitPrice", defaultPrice, { shouldDirty: true, shouldValidate: true });
    }
  }, [isSaleType, selectedProduct, selectedProductId, selectedQuantity, selectedUnitPrice, setValue]);

  // Auto-fill amount from product subtotal
  useEffect(() => {
    if (!selectedProductId || manualAmount || productSubtotal <= 0) return;
    setValue("amount", productSubtotal, { shouldDirty: true, shouldValidate: true });
  }, [manualAmount, productSubtotal, selectedProductId, setValue]);

  // Auto-generate description for sale/purchase types when product is selected
  useEffect(() => {
    if (!isSaleType && !isProductType) return;
    if (!selectedProductId || !selectedProduct) return;
    const currentDesc = getValues("description");
    // Only auto-fill if description is empty or auto-generated
    if (currentDesc && !currentDesc.startsWith("Penjualan ") && !currentDesc.startsWith("Pembelian ")) return;
    const autoDesc = generateAutoDescription({
      transactionType: selectedType,
      productName: selectedProduct.name,
      quantity: selectedQuantity,
      totalAmount: selectedAmount,
    });
    setValue("description", autoDesc, { shouldDirty: true });
  }, [selectedType, selectedProduct, selectedProductId, selectedQuantity, selectedAmount, isSaleType, isProductType, getValues, setValue]);

  // Auto-navigate after success
  useEffect(() => {
    if (!successTransactionId) return;
    const timer = window.setTimeout(() => navigate(`/transactions/${successTransactionId}`), 1400);
    return () => window.clearTimeout(timer);
  }, [navigate, successTransactionId]);

  // Collapse type selector & scroll to active fields when selectedType changes
  useEffect(() => {
    if (!selectedType) {
      previousTypeRef.current = "";
      return;
    }
    const previousType = previousTypeRef.current;
    previousTypeRef.current = selectedType;

    // Only act when transitioning from empty to selected, or to a different type
    if (previousType === selectedType) return;

    setIsTypeSelectorExpanded(false);

    // Mobile only: scroll to active fields
    const isMobile = window.innerWidth < 1024;
    if (isMobile && activeFieldsRef.current) {
      requestAnimationFrame(() => {
        const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        activeFieldsRef.current?.scrollIntoView({
          behavior: prefersReduced ? "auto" : "smooth",
          block: "start",
        });
      });
    }
  }, [selectedType]);

  /* -- Mutation -- */
  const postMutation = useMutation({
    mutationFn: async (data: TransactionSubmission) => {
      const organizationId = orgData?.organization?.id;
      if (!organizationId) throw new Error("Organisasi tidak ditemukan");

      const shouldUseParty = usesParty(data.transactionType);
      const shouldUseCategory = usesCategory(data.transactionType);
      const shouldUseCashAccount = usesCashAccount(data.transactionType);
      const shouldUseDestinationAccount = usesDestinationAccount(data.transactionType);
      const shouldUsePaymentStatus = usesPaymentStatus(data.transactionType);
      const paymentStatus = shouldUsePaymentStatus ? data.paymentStatus : "paid";
      const shouldSendCashAccount = shouldUseCashAccount || (shouldUsePaymentStatus && paymentStatus !== "unpaid");

      const rpcParams: PostTransactionArgs = {
        p_organization_id: organizationId,
        p_transaction_date: data.transactionDate,
        p_transaction_type: data.transactionType,
        p_amount: data.amount,
        p_payment_status: paymentStatus,
        p_partial_amount: data.partialAmount ?? 0,
        p_description: data.description,
        p_client_token: data.clientToken,
      };

      if (shouldUseParty && data.partyName?.trim()) rpcParams.p_party_name = data.partyName.trim();

      // CoA account ID for debit account (expense/cogs purchases)
      if (shouldUseCategory && data.debitAccountId) {
        rpcParams.p_debit_account_id = data.debitAccountId;
        // Also send account name as category_name for transaction record display
        const selectedAccount = expenseCogsAccounts?.find((a) => a.id === data.debitAccountId);
        if (selectedAccount) rpcParams.p_category_name = selectedAccount.name;
      } else if (shouldUseCategory && data.categoryName?.trim()) {
        // Legacy fallback: category name only
        rpcParams.p_category_name = data.categoryName.trim();
      }
      if (shouldSendCashAccount && data.cashAccountId) rpcParams.p_cash_account_id = data.cashAccountId;
      if (shouldUseDestinationAccount && data.destinationCashAccountId) {
        rpcParams.p_destination_cash_account_id = data.destinationCashAccountId;
      }
      if (shouldUsePaymentStatus && paymentStatus !== "paid" && data.dueDate) rpcParams.p_due_date = data.dueDate;

      const notes = data.bankName
        ? `Bank: ${data.bankName}${data.notes ? "\n" + data.notes : ""}`
        : data.notes?.trim();
      if (notes) rpcParams.p_notes = notes;

      if (data.productId) {
        rpcParams.p_product_id = data.productId;
        if (data.quantity !== undefined) rpcParams.p_quantity = data.quantity;
        if (data.unitPrice !== undefined) rpcParams.p_unit_price = data.unitPrice;
      }

      const { data: result, error } = await supabase.rpc("post_transaction", rpcParams);
      if (error) {
        if (import.meta.env.DEV) console.error("post_transaction error:", error);
        const msg = error.message || error.details || JSON.stringify(error);
        // Friendly messages for common errors
        if (msg.includes("does not exist") || msg.includes("column")) {
          throw new Error("Terjadi kesalahan sistem. Silakan hubungi admin.");
        }
        if (msg.includes("multiple function") || error.code === "PGRST202") {
          throw new Error("Database belum di-update. Silakan hubungi admin.");
        }
        // Extract PostgreSQL error message
        const pgMatch = msg.match(/ERROR:\s*(.+?)(?:\n|$)/);
        throw new Error(pgMatch ? pgMatch[1].trim() : "Gagal menyimpan transaksi. Silakan coba lagi.");
      }
      return result as unknown as { transaction_id: string; impact: ImpactSummary };
    },
    onSuccess: (result, variables) => {
      if (variables.cashAccountId) {
        window.localStorage.setItem(getLastCashAccountKey(variables.transactionType), variables.cashAccountId);
      }
      setSuccessTransactionId(result.transaction_id);
      setClientToken(crypto.randomUUID());
      // P1.5: invalidate every query key affected by a financial mutation so
      // dashboard, reports, accounts, products, parties, and usage do not
      // display stale data after a successful post.
      invalidateTransactionFinancialCaches(queryClient, orgData?.organization?.id);
    },
    onSettled: () => {
      submitInFlightRef.current = false;
    },
  });

  /* -- Submit handler -- */
  const onSubmit = (data: TransactionForm) => {
    if (submitInFlightRef.current || successTransactionId) return;

    if (usesParty(data.transactionType) && !data.partyName?.trim()) {
      setError("partyName", { type: "manual", message: "Isi nama pihak" });
      scrollToError();
      return;
    }

    const needsCashAccount = usesCashAccount(data.transactionType) || (usesPaymentStatus(data.transactionType) && data.paymentStatus !== "unpaid");
    if (needsCashAccount && !data.cashAccountId) {
      setError("cashAccountId", { type: "manual", message: "Pilih akun kas/bank" });
      scrollToError();
      return;
    }

    if (usesDestinationAccount(data.transactionType) && !data.destinationCashAccountId) {
      setError("destinationCashAccountId", { type: "manual", message: "Pilih akun tujuan" });
      scrollToError();
      return;
    }

    // Validate debit account for expense/purchase types (when no product selected)
    if (usesCategory(data.transactionType) && !data.productId && !data.debitAccountId) {
      setError("debitAccountId", { type: "manual", message: "Pilih akun CoA" });
      scrollToError();
      return;
    }

    if (data.transactionType === "cash_transfer" && data.cashAccountId === data.destinationCashAccountId) {
      setError("destinationCashAccountId", { type: "manual", message: "Akun tujuan harus berbeda dari sumber" });
      scrollToError();
      return;
    }

    if (usesPaymentStatus(data.transactionType) && data.paymentStatus === "partial") {
      if (!data.partialAmount || data.partialAmount <= 0) {
        setError("partialAmount", { type: "manual", message: "Isi jumlah pembayaran sebagian" });
        scrollToError();
        return;
      }
      if (data.partialAmount >= data.amount) {
        setError("partialAmount", { type: "manual", message: "Jumlah pembayaran sebagian harus lebih kecil dari nominal transaksi" });
        scrollToError();
        return;
      }
    }

    if (data.productId) {
      if (!data.quantity || data.quantity <= 0) {
        setError("quantity", { type: "manual", message: "Isi kuantitas produk (minimal 1)" });
        scrollToError();
        return;
      }
      if (data.unitPrice === undefined || data.unitPrice < 0) {
        setError("unitPrice", { type: "manual", message: "Isi harga satuan produk" });
        scrollToError();
        return;
      }
    }

    submitInFlightRef.current = true;
    postMutation.mutate({ ...data, clientToken });
  };

  const scrollToError = () => {
    // Use requestAnimationFrame to ensure errors are rendered before scrolling
    requestAnimationFrame(() => {
      errorSummaryRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      errorSummaryRef.current?.focus();
    });
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      formRef.current?.requestSubmit();
    }
  };

  /* -- No access guard -- */
  if (orgData?.member && !canCreateTransaction) {
    return (
      <div className="mx-auto max-w-lg px-4 py-8">
        <Card>
          <CardContent className="text-center py-8">
            <h1 className="text-lg font-semibold text-text-primary">Tidak ada akses</h1>
            <p className="mt-2 text-sm text-text-secondary">Anda tidak memiliki izin untuk mencatat transaksi.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  /* -- Render -- */
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Transaksi Baru</h1>
          <p className="mt-1 text-sm text-text-secondary">
            {selectedType === "cash_sale"
              ? "Catat penjualan yang langsung dibayar."
              : selectedType === "credit_sale"
              ? "Catat penjualan yang belum dibayar."
              : selectedType === "cash_purchase"
              ? "Catat pembelian yang langsung dibayar."
              : selectedType === "credit_purchase"
              ? "Catat pembelian dengan utang."
              : "Catat transaksi bisnis Anda. Isi dari atas ke bawah."}
          </p>
        </div>
        {successTransactionId && <Badge variant="success">Tersimpan, membuka detail...</Badge>}
      </div>

      {/* Free plan usage banner */}
      <PlanUsageBanner
        isFreePlan={isFreePlan}
        isAtLimit={isAtLimit}
        usageCount={usageCount}
        usageLimit={usageLimit}
      />

      {usageError && isFreePlan && (
        <div className="mb-4 flex min-w-0 flex-col gap-2 rounded-lg border border-warning-border bg-warning-bg px-4 py-3 text-sm text-warning sm:flex-row sm:items-center sm:justify-between" role="alert">
          <p className="min-w-0 break-words">
            Gagal memuat pemakaian paket gratis. Batas transaksi mungkin belum akurat.
          </p>
          <Button type="button" variant="outline" size="sm" onClick={() => void refetchMonthlyUsage()} className="shrink-0">
            Coba lagi
          </Button>
        </div>
      )}

      {/* Error summary (after failed submit) */}
      <ErrorSummary ref={errorSummaryRef} errors={errors} formErrorMessage={postMutation.isError ? (postMutation.error as Error).message || "Gagal memproses transaksi" : undefined} />

      {lookupError ? (
        <Card>
          <CardContent>
            <ErrorState
              error={lookupError}
              message="Gagal memuat data akun, pihak, atau produk yang dibutuhkan untuk mencatat transaksi."
              onRetry={retryLookups}
              className="py-8"
            />
          </CardContent>
        </Card>
      ) : (
        <div className={selectedType ? "grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(19rem,22rem)] xl:gap-6" : "grid gap-5"}>
          <form
            ref={formRef}
            onSubmit={(event) => {
              void handleSubmit(onSubmit)(event);
            }}
            onKeyDown={handleKeyDown}
            className="min-w-0 space-y-4"
            noValidate
          >
          {/* Section 1: Detail utama */}
          <SectionCard
            id="section-type"
            title={SECTION_LABELS[selectedType]?.detail || "Detail utama"}
            step={1}
          >
            {/* Full type selector: shown when no type selected or user explicitly expands */}
            {(!selectedType || isTypeSelectorExpanded) && (
              <TransactionTypeSelector
                value={selectedType}
                onChange={(type) => {
                  setValue("transactionType", type, { shouldDirty: true, shouldValidate: true });
                  clearErrors("transactionType");
                }}
                error={errors.transactionType?.message}
              />
            )}

            {/* Compact summary: shown when type is selected and selector is collapsed */}
            {selectedType && !isTypeSelectorExpanded && (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-wood-200 bg-cream-50 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-semibold text-text-primary">
                    {selectedTypeLabel}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setIsTypeSelectorExpanded(true)}
                  className="shrink-0"
                >
                  Ganti jenis
                </Button>
              </div>
            )}

            {/* Active fields: shown immediately below the type area */}
            {selectedType && (
              <div ref={activeFieldsRef} className="space-y-4 pt-1">
                {/* For sale/purchase types: Product first */}
                {isProductType && (
                  <>
                    <Combobox
                      id="productId"
                      name="productId"
                      label="Produk / Jasa"
                      value={selectedProductId || ""}
                      onChange={(value) => {
                        setManualAmount(false);
                        setValue("productId", value, { shouldDirty: true, shouldValidate: true });
                        clearErrors("productId");
                      }}
                      options={(products || []).map((product) => ({
                        value: product.id,
                        label: `${product.code} - ${product.name}`,
                        secondaryLabel: `Stok: ${formatNumber(product.current_stock)} ${product.unit}`,
                      }))}
                      placeholder="Pilih produk atau ketik nama item"
                      loading={productsLoading}
                      emptyText="Tidak ada produk. Tambahkan dari menu Produk."
                    />

                    {/* Product detail fields */}
                    {selectedProductId && selectedProduct && (
                      <ProductDetailFields
                        product={selectedProduct}
                        isSaleType={isSaleType}
                        quantity={selectedQuantity || 0}
                        unitPrice={selectedUnitPrice || 0}
                        subtotal={productSubtotal}
                        stockAfterSale={stockAfterSale}
                        onQuantityChange={(value) => setValue("quantity", value, { shouldDirty: true, shouldValidate: true })}
                        onUnitPriceChange={(value) => setValue("unitPrice", value, { shouldDirty: true, shouldValidate: true })}
                        quantityError={errors.quantity?.message}
                        unitPriceError={errors.unitPrice?.message}
                      />
                    )}
                  </>
                )}

                {/* Total / Amount */}
                <Controller
                  control={control}
                  name="amount"
                  render={({ field }) => (
                    <Input
                      ref={field.ref}
                      name={field.name}
                      label={isSaleType ? "Total Penjualan" : isProductType ? "Total Pembelian" : "Nominal"}
                      value={formatAmountInput(field.value, true)}
                      onBlur={field.onBlur}
                      onChange={(event) => field.onChange(parseAmountInput(event.target.value, 0))}
                      placeholder="0"
                      isCurrency
                      readOnly={Boolean(selectedProductId && !manualAmount)}
                      helperText={selectedProductId && !manualAmount ? "Otomatis: kuantitas x harga satuan" : undefined}
                      error={errors.amount?.message}
                      required
                    />
                  )}
                />

                {selectedProductId && (
                  <Button type="button" variant="link" size="xs" onClick={() => setManualAmount((current) => !current)}>
                    {manualAmount ? "Gunakan otomatis" : "Edit manual"}
                  </Button>
                )}

                {/* Description / Keterangan */}
                <Input
                  label="Keterangan"
                  {...register("description")}
                  placeholder={descriptionPlaceholder}
                  error={errors.description?.message}
                />

                {/* Payment status */}
                {showPaymentStatus && (
                  <PaymentStatusSelector
                    value={selectedPaymentStatus as "unpaid" | "partial"}
                    onChange={(status) => {
                      setValue("paymentStatus", status, { shouldDirty: true, shouldValidate: true });
                      if (status !== "partial") setValue("partialAmount", undefined);
                    }}
                    showDueDate={showDueDate}
                    dueDate={selectedDueDate || ""}
                    onDueDateChange={(date) => setValue("dueDate", date, { shouldDirty: true })}
                  />
                )}

                {/* Partial payment fields */}
                {selectedPaymentStatus === "partial" && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Controller
                      control={control}
                      name="partialAmount"
                      render={({ field }) => (
                        <Input
                          ref={field.ref}
                          name={field.name}
                          label="Jumlah yang dibayar"
                          value={formatAmountInput(field.value, true)}
                          onBlur={field.onBlur}
                          onChange={(event) => field.onChange(parseAmountInput(event.target.value, 0))}
                          placeholder="0"
                          isCurrency
                          error={errors.partialAmount?.message}
                          required
                        />
                      )}
                    />
                    <Input
                      label="Sisa Tagihan"
                      value={formatAmountInput(remainingAmount)}
                      isCurrency
                      readOnly
                      helperText={remainingAmount > 0 ? "Belum dibayar" : undefined}
                    />
                  </div>
                )}
              </div>
            )}
          </SectionCard>

          {/* Section 2: Pihak, akun, dan detail tambahan */}
          {selectedType && (
            <SectionCard
              id="section-details"
              title={SECTION_LABELS[selectedType]?.payment || "Pihak, akun, dan detail tambahan"}
              step={2}
            >
              {/* Party */}
              {showParty && (
                <Combobox
                  id="partyName"
                  name="partyName"
                  label={partyCopy.label}
                  value={selectedPartyName}
                  onChange={(value) => {
                    setValue("partyName", value, { shouldDirty: true, shouldValidate: true });
                    clearErrors("partyName");
                  }}
                  options={(parties || []).map((party) => ({ value: party.name, label: party.name }))}
                  placeholder={partyCopy.placeholder}
                  helperText={partyCopy.helper}
                  allowCreate
                  loading={partiesLoading}
                  emptyText="Ketik nama baru untuk membuat data"
                  error={errors.partyName?.message}
                />
              )}

              {/* Cash account */}
              {showCashAccount && (
                <>
                  <Combobox
                    id="cashAccountId"
                    name="cashAccountId"
                    label={cashAccountLabel}
                    value={selectedCashAccountId || ""}
                    onChange={(value) => {
                      setValue("cashAccountId", value, { shouldDirty: true, shouldValidate: true });
                      clearErrors("cashAccountId");
                    }}
                    options={cashAccountOptions}
                    placeholder={CASH_ACCOUNT_PLACEHOLDERS[selectedType] || "Pilih akun kas/bank..."}
                    loading={accountsLoading}
                    error={errors.cashAccountId?.message}
                  />
                  {showBankNameField && (
                    <Input
                      label="Nama Bank (opsional)"
                      {...register("bankName")}
                      placeholder="Contoh: BCA, Mandiri, BRI, BNI..."
                    />
                  )}
                </>
              )}

              {/* Destination account (for transfers) */}
              {showDestinationAccount && (
                <Combobox
                  id="destinationCashAccountId"
                  name="destinationCashAccountId"
                  label="Akun Tujuan"
                  value={selectedDestinationCashAccountId || ""}
                  onChange={(value) => {
                    setValue("destinationCashAccountId", value, { shouldDirty: true, shouldValidate: true });
                    clearErrors("destinationCashAccountId");
                  }}
                  options={cashAccountOptions.filter((account) => account.id !== selectedCashAccountId)}
                  placeholder="Pilih akun tujuan..."
                  helperText={selectedCashAccountId === selectedDestinationCashAccountId ? "Akun tujuan harus berbeda dari sumber." : undefined}
                  loading={accountsLoading}
                  error={errors.destinationCashAccountId?.message}
                />
              )}

              {/* Debit account from CoA, hidden when product is selected */}
              {showCategory && !selectedProductId && (
                <Combobox
                  id="debitAccountId"
                  name="debitAccountId"
                  label={categoryLabel}
                  value={selectedDebitAccountId}
                  onChange={(value) => {
                    setValue("debitAccountId", value, { shouldDirty: true, shouldValidate: true });
                    clearErrors("debitAccountId");
                  }}
                  options={debitAccountOptions}
                  placeholder="Pilih akun CoA..."
                  loading={expenseAccountsLoading}
                  error={errors.debitAccountId?.message}
                />
              )}
            </SectionCard>
          )}

          {/* Section 3: Catatan */}
          {selectedType && (
            <SectionCard id="section-notes" title={SECTION_LABELS[selectedType]?.notes || "Catatan"} step={3}>
              <Textarea
                label="Catatan (opsional)"
                {...register("notes")}
                rows={2}
                placeholder="Catatan tambahan untuk transaksi ini..."
              />
            </SectionCard>
          )}

          {/* Mobile review toggle */}
          {selectedType && (
            <MobileReviewToggle
              debit={preview.debit}
              credit={preview.credit}
              transactionType={selectedType}
              amount={selectedAmount}
              stockWarning={stockAfterSale}
              isAtLimit={isAtLimit}
              usageCount={usageCount}
              usageLimit={usageLimit}
              cashAccountLabel={selectedCashAccountOption?.label || "Kas / Bank"}
              productName={selectedProduct?.name}
            />
          )}

          {/* Submit bar */}
          <div className="sticky bottom-0 z-sticky -mx-4 border-t border-wood-100 bg-surface p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 sm:pb-0">
            <SubmitBar
              loading={postMutation.isPending}
              disabled={postMutation.isPending || isAtLimit || !selectedType}
              isAtLimit={isAtLimit}
              successId={successTransactionId}
              label={getSubmitLabel({
                transactionType: selectedType,
                amount: selectedAmount,
                isEditing: false,
                loading: postMutation.isPending,
                successId: successTransactionId,
              })}
            />
          </div>
        </form>

        {/* Desktop sidebar: Review Panel */}
          {selectedType && (
            <aside className="hidden lg:block">
              <Card className="sticky top-6">
                <CardContent>
                  <ReviewPanel
                    debit={preview.debit}
                    credit={preview.credit}
                    stockWarning={stockAfterSale}
                    isAtLimit={isAtLimit}
                    usageCount={usageCount}
                    usageLimit={usageLimit}
                    transactionType={selectedType}
                    amount={selectedAmount}
                    cashAccountLabel={selectedCashAccountOption?.label || "Kas / Bank"}
                    productName={selectedProduct?.name}
                  />
                </CardContent>
              </Card>
            </aside>
          )}
        </div>
      )}

      {/* Unsaved changes dialog */}
      <UnsavedChangesDialog
        open={showUnsavedDialog}
        onConfirm={handleUnsavedConfirm}
        onCancel={handleUnsavedCancel}
      />
    </div>
  );
}
