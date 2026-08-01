import { useEffect, useMemo, useState } from "react";
import { useBlocker, useNavigate } from "react-router-dom";
import { useForm, useWatch, type UseFormReturn } from "react-hook-form";
import { z } from "zod/v3";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClientToken, formatIDR } from "@/lib/utils";
import { toast } from "@/components/ui/toast";

import { queryKeys, invalidateTransactionFinancialCaches } from "@/lib/query-keys";
import { listAccounts } from "@/lib/api/accounts";
import { listParties } from "@/lib/api/parties";
import { listProducts } from "@/lib/api/products";
import {
  postTransaction as postTransactionApi,
  type PostTransactionInput,
  type PostTransactionResult,
} from "@/lib/api/transactions";
import {
  usesCashAccount,
  usesCategory,
  usesDestinationAccount,
  usesParty,
  usesPaymentStatus,
} from "@/lib/transactions";
import {
  TRANSACTION_META,
  PARTY_COPY,
  CASH_ACCOUNT_LABELS,
  CATEGORY_LABELS,
  DESCRIPTION_PLACEHOLDERS,
  generateAutoDescription,
  localDate,
} from "./_helpers";

function formatNotes(bankName?: string, notes?: string): string | undefined {
  if (bankName) {
    return `Bank: ${bankName}${notes ? "\n" + notes : ""}`;
  }
  return notes?.trim();
}

type AccountLookup = ReturnType<typeof useTransactionLookups>["expenseCogsAccounts"];

function buildPartyParams(data: TransactionSubmission): Partial<PostTransactionInput> {
  if (!usesParty(data.transactionType)) return {};
  const name = data.partyName?.trim();
  return name ? { partyName: name } : {};
}

function buildCategoryParams(
  data: TransactionSubmission,
  expenseCogsAccounts: AccountLookup,
): Partial<PostTransactionInput> {
  if (!usesCategory(data.transactionType)) return {};
  if (data.debitAccountId) {
    const selectedAccount = expenseCogsAccounts?.find((a) => a.id === data.debitAccountId);
    return selectedAccount
      ? { debitAccountId: data.debitAccountId, categoryName: selectedAccount.name }
      : { debitAccountId: data.debitAccountId };
  }
  const name = data.categoryName?.trim();
  return name ? { categoryName: name } : {};
}

function buildCashAccountParams(data: TransactionSubmission): Partial<PostTransactionInput> {
  const usesCash = usesCashAccount(data.transactionType);
  const usesPayment = usesPaymentStatus(data.transactionType);
  const sendsCash = usesCash || (usesPayment && data.paymentStatus !== "unpaid");
  return sendsCash && data.cashAccountId ? { cashAccountId: data.cashAccountId } : {};
}

function buildDestinationParams(data: TransactionSubmission): Partial<PostTransactionInput> {
  if (usesDestinationAccount(data.transactionType) && data.destinationCashAccountId) {
    return { destinationCashAccountId: data.destinationCashAccountId };
  }
  return {};
}

function buildDueDateParams(data: TransactionSubmission): Partial<PostTransactionInput> {
  if (!usesPaymentStatus(data.transactionType)) return {};
  return data.paymentStatus !== "paid" && data.dueDate ? { dueDate: data.dueDate } : {};
}

function buildNotesParams(data: TransactionSubmission): Partial<PostTransactionInput> {
  const notes = formatNotes(data.bankName, data.notes);
  return notes ? { notes } : {};
}

function buildProductParams(data: TransactionSubmission): Partial<PostTransactionInput> {
  if (!data.productId) return {};
  const params: Partial<PostTransactionInput> = { productId: data.productId };
  if (data.quantity !== undefined) params.quantity = data.quantity;
  if (data.unitPrice !== undefined) params.unitPrice = data.unitPrice;
  return params;
}

function buildTransactionParams(
  data: TransactionSubmission & { originalTransactionId?: string },
  expenseCogsAccounts: AccountLookup,
): PostTransactionInput {
  const params: PostTransactionInput = {
    transactionDate: data.transactionDate,
    transactionType: data.transactionType,
    amount: data.amount,
    paymentStatus: usesPaymentStatus(data.transactionType) ? data.paymentStatus : "paid",
    partialAmount: data.partialAmount ?? undefined,
    description: data.description,
    originalTransactionId: data.originalTransactionId ?? undefined,
    idempotencyKey: data.clientToken,
  };

  Object.assign(
    params,
    buildPartyParams(data),
    buildCategoryParams(data, expenseCogsAccounts),
    buildCashAccountParams(data),
    buildDestinationParams(data),
    buildDueDateParams(data),
    buildNotesParams(data),
    buildProductParams(data),
  );

  return params;
}

/* ------------------------------------------------------------------ */
/*  Schema & Types                                                     */
/* ------------------------------------------------------------------ */

export const transactionSchema = z.object({
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

export type TransactionForm = z.infer<typeof transactionSchema>;
export type TransactionSubmission = TransactionForm & { clientToken: string };

export interface ImpactSummary {
  debit_account: string;
  credit_account: string;
  debit_change: string;
  credit_change: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function getLastCashAccountKey(transactionType: string) {
  return `ledjer:last-cash-account:${transactionType}`;
}

/* ------------------------------------------------------------------ */
/*  Hook: useTransactionForm                                           */
/* ------------------------------------------------------------------ */

export function useTransactionForm() {
  const form = useForm<TransactionForm>({
    resolver: zodResolver(transactionSchema),
    defaultValues: {
      transactionDate: localDate(),
      paymentStatus: "unpaid",
      description: "",
      amount: 0,
    },
  });

  const { control, getValues, setValue, setError, formState } = form;
  const { errors, isDirty } = formState;

  /* -- Blocker & navigation safety -- */
  const [successTransactionId, setSuccessTransactionId] = useState<string | null>(null);
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

  return {
    form,
    control,
    getValues,
    setValue,
    setError,
    errors,
    isDirty,
    blocker,
    successTransactionId,
    setSuccessTransactionId,
    selectedType,
    selectedPaymentStatus,
    selectedAmount,
    selectedProductId,
    selectedQuantity,
    selectedUnitPrice,
    selectedCashAccountId,
    selectedDestinationCashAccountId,
    selectedPartyName,
    selectedCategoryName,
    selectedDebitAccountId,
    selectedDueDate,
    selectedPartialAmount,
    selectedTypeLabel,
    showPaymentStatus,
    showCashAccount,
    showDestinationAccount,
    showParty,
    showCategory,
    showDueDate,
    isProductType,
    isSaleType,
  };
}

/* ------------------------------------------------------------------ */
/*  Hook: useTransactionLookups                                        */
/* ------------------------------------------------------------------ */

export function useTransactionLookups(orgId: string | undefined) {
  const {
    data: accounts,
    isLoading: accountsLoading,
    error: accountsError,
    refetch: refetchAccounts,
  } = useQuery({
    queryKey: queryKeys.accounts.activeTransactionOptions(orgId ?? ""),
    queryFn: async () => {
      if (!orgId) return [];
      return listAccounts({ active: true });
    },
    enabled: !!orgId,
  });

  const {
    data: expenseCogsAccounts,
    isLoading: expenseAccountsLoading,
    error: expenseAccountsError,
    refetch: refetchExpenseAccounts,
  } = useQuery({
    queryKey: queryKeys.accounts.expenseCogsOptions(orgId ?? ""),
    queryFn: async () => {
      if (!orgId) return [];
      return listAccounts({ active: true, accountTypes: ["expense", "cogs"] });
    },
    enabled: !!orgId,
  });

  const {
    data: parties,
    isLoading: partiesLoading,
    error: partiesError,
    refetch: refetchParties,
  } = useQuery({
    queryKey: queryKeys.parties.transactionOptions(orgId ?? ""),
    queryFn: async () => {
      if (!orgId) return { parties: [], customers: [], suppliers: [] };
      return listParties();
    },
    enabled: !!orgId,
  });

  const {
    data: products,
    isLoading: productsLoading,
    error: productsError,
    refetch: refetchProducts,
  } = useQuery({
    queryKey: queryKeys.products.transactionOptions(orgId ?? ""),
    queryFn: async () => {
      if (!orgId) return [];
      return listProducts();
    },
    enabled: !!orgId,
  });

  const retryLookups = () => {
    Promise.allSettled([
      refetchAccounts(),
      refetchExpenseAccounts(),
      refetchParties(),
      refetchProducts(),
    ]).then((settlements) => {
      const rejected = settlements.filter((s) => s.status === "rejected");
      if (rejected.length > 0) console.error(`${rejected.length} lookup refetch(es) failed`, rejected);
    });
  };

  const lookupError = accountsError || expenseAccountsError || partiesError || productsError;

  return {
    accounts,
    accountsLoading,
    expenseCogsAccounts,
    expenseAccountsLoading,
    parties,
    partiesLoading,
    products,
    productsLoading,
    lookupError,
    retryLookups,
  };
}

/* ------------------------------------------------------------------ */
/*  Hook: useTransactionDerived                                        */
/* ------------------------------------------------------------------ */

export function useTransactionDerived(params: {
  selectedType: string;
  selectedAmount: number;
  selectedProductId: string | undefined;
  selectedQuantity: number | undefined;
  selectedUnitPrice: number | undefined;
  selectedCashAccountId: string | undefined;
  selectedDestinationCashAccountId: string | undefined;
  selectedCategoryName: string;
  selectedDebitAccountId: string;
  selectedPartialAmount: number;
  accounts: ReturnType<typeof useTransactionLookups>["accounts"];
  expenseCogsAccounts: ReturnType<typeof useTransactionLookups>["expenseCogsAccounts"];
  products: ReturnType<typeof useTransactionLookups>["products"];
}) {
  const {
    selectedType,
    selectedAmount,
    selectedProductId,
    selectedQuantity,
    selectedUnitPrice,
    selectedCashAccountId,
    selectedDestinationCashAccountId,
    selectedCategoryName,
    selectedDebitAccountId,
    selectedPartialAmount,
    accounts,
    expenseCogsAccounts,
    products,
  } = params;

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
    const accts = expenseCogsAccounts || [];
    if (selectedType === "expense_payment") {
      return accts
        .filter((a) => a.account_type === "expense")
        .map((a) => ({ value: a.id, label: `${a.code} - ${a.name}` }));
    }
    return accts.map((a) => ({ value: a.id, label: `${a.code} - ${a.name}` }));
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
  const isSaleType = selectedType === "cash_sale" || selectedType === "credit_sale";
  const stockAdjustment = isSaleType ? -selectedQuantity! : selectedQuantity!;
  const stockAfterSale = selectedProduct && selectedQuantity
    ? (selectedProduct.current_stock ?? 0) + stockAdjustment
    : null;

  // ponytail: derive account name for preview from CoA or fallback to category/product name
  const debitAccountName = (() => {
    if (selectedProductId && selectedProduct) return selectedProduct.name;
    if (selectedDebitAccountId) {
      const account = expenseCogsAccounts?.find((a) => a.id === selectedDebitAccountId);
      if (account) return account.name;
    }
    return selectedCategoryName || "Beban / Pembelian";
  })();

  return {
    cashAccountOptions,
    debitAccountOptions,
    selectedCashAccountOption,
    selectedDestinationCashAccountOption,
    selectedProduct,
    showBankNameField,
    partyCopy,
    cashAccountLabel,
    categoryLabel,
    descriptionPlaceholder,
    productSubtotal,
    remainingAmount,
    stockAfterSale,
    debitAccountName,
  };
}

/* ------------------------------------------------------------------ */
/*  Hook: useTransactionEffects                                        */
/* ------------------------------------------------------------------ */

export function useTransactionEffects(params: {
  form: UseFormReturn<TransactionForm>;
  selectedType: string;
  selectedProductId: string | undefined;
  selectedQuantity: number | undefined;
  selectedUnitPrice: number | undefined;
  selectedDueDate: string | undefined;
  selectedAmount: number;
  showDueDate: boolean;
  isProductType: boolean;
  isSaleType: boolean;
  manualAmount: boolean;
  productSubtotal: number;
  successTransactionId: string | null;
  setIsTypeSelectorExpanded: (expanded: boolean) => void;
  activeFieldsRef: React.RefObject<HTMLDivElement | null>;
  previousTypeRef: React.RefObject<string>;
  cashAccountOptions: Array<{ id: string }>;
  debitAccountOptions: Array<{ value: string }>;
  selectedProduct: { name: string; selling_price?: number; purchase_price?: number } | undefined;
}) {
  const {
    form,
    selectedType,
    selectedProductId,
    selectedQuantity,
    selectedUnitPrice,
    selectedDueDate,
    selectedAmount,
    showDueDate,
    isProductType,
    isSaleType,
    manualAmount,
    productSubtotal,
    successTransactionId,
    setIsTypeSelectorExpanded,
    activeFieldsRef,
    previousTypeRef,
    cashAccountOptions,
    debitAccountOptions,
    selectedProduct,
  } = params;

  const { getValues, setValue } = form;
  const navigate = useNavigate();

  // Before unload protection
  useEffect(() => {
    if (!form.formState.isDirty || successTransactionId) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [form.formState.isDirty, successTransactionId]);

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedType]);
}

/* ------------------------------------------------------------------ */
/*  Hook: useTransactionMutation                                       */
/* ------------------------------------------------------------------ */

export function useTransactionMutation(params: {
  orgId: string | undefined;
  expenseCogsAccounts: ReturnType<typeof useTransactionLookups>["expenseCogsAccounts"];
  setSuccessTransactionId: (id: string) => void;
  setClientToken: (token: string) => void;
  submitInFlightRef: React.RefObject<boolean>;
}) {
  const { orgId, expenseCogsAccounts, setSuccessTransactionId, setClientToken, submitInFlightRef } = params;
  const queryClient = useQueryClient();

  const postMutation = useMutation({
    mutationFn: async (data: TransactionSubmission) => {
      if (!orgId) throw new Error("Organisasi tidak ditemukan");
      const params = buildTransactionParams(data, expenseCogsAccounts);
      return postTransactionApi(params) as Promise<PostTransactionResult>;
    },
    onSuccess: (result, variables) => {
      if (variables.cashAccountId) {
        window.localStorage.setItem(getLastCashAccountKey(variables.transactionType), variables.cashAccountId);
      }
      setSuccessTransactionId(result.transaction_id);
      setClientToken(createClientToken());
      // ponytail: Delay cache invalidation to avoid D1 read-after-write inconsistency.
      // D1 replicas may not have synced yet; 500ms gives primary time to propagate.
      setTimeout(() => {
        invalidateTransactionFinancialCaches(queryClient, orgId);
      }, 500);
      toast.success(`Transaksi ${result.transaction_number} berhasil dicatat ${formatIDR(variables.amount)}`);
    },
    onSettled: () => {
      submitInFlightRef.current = false;
    },
  });

  return { postMutation };
}
