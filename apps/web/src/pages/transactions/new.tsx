import { useRef, useState } from "react";
import { createClientToken, formatNumber } from "@/lib/utils";
import { useOrganization, useOrgPermissions } from "@/hooks/useOrganization";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { Textarea } from "@/components/ui/textarea";
import { PageGuide } from "@/components/ui/page-guide";
import {
  TransactionTypeSection,
  ProductFieldsSection,
  PartyAccountSection,
  ReviewPanel,
  MobileReviewToggle,
  SubmitBar,
  ErrorSummary,
  UnsavedChangesDialog,
  SectionCard,
} from "./_components";
import {
  buildPreview,
  SECTION_LABELS,
  getSubmitLabel,
} from "./_helpers";
import {
  type TransactionForm,
  useTransactionForm,
  useTransactionLookups,
  useTransactionDerived,
  useTransactionEffects,
  useTransactionMutation,
  useReplacementPrefill,
} from "./_hooks";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function transactionHint(type: string | null): string {
  if (type === "cash_sale") return "Catat penjualan yang langsung dibayar.";
  if (type === "credit_sale") return "Catat penjualan yang belum dibayar.";
  if (type === "cash_purchase") return "Catat pembelian yang langsung dibayar.";
  if (type === "credit_purchase") return "Catat pembelian dengan utang.";
  return "Catat transaksi bisnis Anda dengan memilih jenis transaksi terlebih dahulu.";
}

function validatePartyField(showParty: boolean, partyName: string | null | undefined): { field: string; message: string } | null {
  if (showParty && !partyName?.trim()) {
    return { field: "partyName", message: "Isi nama pihak" };
  }
  return null;
}

function validateAccountFields(
  formState: ReturnType<typeof useTransactionForm>,
  data: TransactionForm,
): { field: string; message: string } | null {
  const needsCashAccount = formState.showCashAccount || (formState.showPaymentStatus && data.paymentStatus !== "unpaid");
  if (needsCashAccount && !data.cashAccountId) {
    return { field: "cashAccountId", message: "Pilih akun kas/bank" };
  }
  if (formState.showDestinationAccount && !data.destinationCashAccountId) {
    return { field: "destinationCashAccountId", message: "Pilih akun tujuan" };
  }
  if (formState.showCategory && !data.productId && !data.productName && !data.debitAccountId) {
    return { field: "debitAccountId", message: "Pilih akun CoA" };
  }
  if (data.transactionType === "cash_transfer" && data.cashAccountId === data.destinationCashAccountId) {
    return { field: "destinationCashAccountId", message: "Akun tujuan harus berbeda dari sumber" };
  }
  return null;
}

function validatePaymentFields(
  formState: ReturnType<typeof useTransactionForm>,
  data: TransactionForm,
): { field: string; message: string } | null {
  if (formState.showPaymentStatus && data.paymentStatus === "partial" && (!data.partialAmount || data.partialAmount <= 0)) {
    return { field: "partialAmount", message: "Isi jumlah pembayaran sebagian" };
  }
  if (formState.showPaymentStatus && data.paymentStatus === "partial" && (data.partialAmount ?? 0) >= data.amount) {
    return { field: "partialAmount", message: "Jumlah pembayaran sebagian harus lebih kecil dari nominal transaksi" };
  }
  return null;
}

function validateProductFields(
  data: TransactionForm,
  formState: ReturnType<typeof useTransactionForm>,
  selectedProduct: { current_stock?: number } | undefined,
  stockAfterSale: number | null,
): { field: string; message: string } | null {
  const hasProduct = Boolean(data.productId || data.productName?.trim());
  if (hasProduct && (!data.quantity || data.quantity <= 0)) {
    return { field: "quantity", message: "Isi kuantitas produk (minimal 1)" };
  }
  if (hasProduct && formState.isSaleType && (data.unitPrice === undefined || data.unitPrice < 0)) {
    return { field: "unitPrice", message: "Isi harga satuan produk" };
  }
  if (data.productId && formState.isSaleType && stockAfterSale !== null && stockAfterSale < 0) {
    return {
      field: "quantity",
      message: "Stok tidak mencukupi. Stok tersisa: " + formatNumber(selectedProduct?.current_stock ?? 0),
    };
  }
  return null;
}

function buildSubmission(
  data: TransactionForm,
  clientToken: string,
  replaceTransactionId: string | null,
): import("./_hooks").TransactionSubmission & { originalTransactionId?: string } {
  const submission = { ...data, clientToken } as import("./_hooks").TransactionSubmission & { originalTransactionId?: string };
  if (replaceTransactionId) {
    submission.originalTransactionId = replaceTransactionId;
  }
  return submission;
}

function getTransactionFormError(
  data: TransactionForm,
  formState: ReturnType<typeof useTransactionForm>,
  selectedProduct: { current_stock?: number } | undefined,
  stockAfterSale: number | null,
): { field: string; message: string } | null {
  return validatePartyField(formState.showParty, data.partyName)
    ?? validateAccountFields(formState, data)
    ?? validatePaymentFields(formState, data)
    ?? validateProductFields(data, formState, selectedProduct, stockAfterSale);
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export function NewTransactionPage() {
  const { data: orgData } = useOrganization();
  const { canCreateTransaction } = useOrgPermissions();
  const [manualAmount, setManualAmount] = useState(false);
  const [clientToken, setClientToken] = useState(createClientToken);
  const [isTypeSelectorExpanded, setIsTypeSelectorExpanded] = useState(true);

  // Replace transaction: read from URL search params after void
  const urlParams = new URLSearchParams(window.location.search);
  const replaceTransactionId = urlParams.get("replace");
  const replaceType = urlParams.get("type");
  const replaceAmount = urlParams.get("amount");
  const replaceDesc = urlParams.get("desc");
  const errorSummaryRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const activeFieldsRef = useRef<HTMLDivElement>(null);
  const previousTypeRef = useRef<string>("");
  const submitInFlightRef = useRef(false);

  /* -- Hooks -- */
  const formState = useTransactionForm();
  const {
    form,
    control,
    errors,
    blocker,
    successTransactionId,
    setSuccessTransactionId,
    selectedType,
    selectedPaymentStatus,
    selectedAmount,
    selectedProductId,
    selectedProductName,
    selectedUnit,
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
    isPurchaseType,
    isSaleType,
  } = formState;

  const lookups = useTransactionLookups(orgData?.organization?.id);
  const {
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
  } = lookups;

  const derived = useTransactionDerived({
    selectedType,
    selectedAmount,
    selectedProductId,
    selectedProductName,
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
  });
  const {
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
  } = derived;

  useTransactionEffects({
    form,
    selectedType,
    selectedProductId,
    selectedProductName,
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
  });

  // P0.5: Pre-fill form from replacement URL params after void
  useReplacementPrefill(form, {
    replaceType,
    replaceAmount,
    replaceDesc,
    setIsTypeSelectorExpanded,
  });

  const { postMutation } = useTransactionMutation({
    orgId: orgData?.organization?.id,
    expenseCogsAccounts,
    setSuccessTransactionId,
    setClientToken,
    submitInFlightRef,
  });

  /* -- Derived -- */
  const preview = buildPreview({
    transactionType: selectedType,
    amount: selectedAmount,
    partialAmount: selectedPartialAmount,
    paymentStatus: selectedPaymentStatus,
    cashAccountLabel: selectedCashAccountOption?.label || "Kas / Bank",
    destinationAccountLabel: selectedDestinationCashAccountOption?.label || "Akun tujuan",
    categoryName: debitAccountName,
    productName: selectedProduct?.name || selectedProductName,
  });

  const showUnsavedDialog = blocker.state === "blocked" && form.formState.isDirty && !successTransactionId;

  /* -- Submit handler -- */
  const onSubmit = (data: TransactionForm) => {
    if (submitInFlightRef.current || successTransactionId) return;

    const formError = getTransactionFormError(data, formState, selectedProduct, stockAfterSale);
    if (formError) {
      formState.setError(formError.field as Parameters<typeof formState.setError>[0], { type: "manual", message: formError.message });
      scrollToError();
      return;
    }

    submitInFlightRef.current = true;
    postMutation.mutate(buildSubmission(data, clientToken, replaceTransactionId));
  };

  const scrollToError = () => {
    requestAnimationFrame(() => {
      errorSummaryRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      errorSummaryRef.current?.focus();
    });
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
    <div className="ledger-page mx-auto max-w-6xl py-6 sm:py-8">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Transaksi Baru</h1>
          <p className="mt-1 text-sm text-text-secondary">
            {transactionHint(selectedType)}
          </p>
        </div>
        {successTransactionId && <Badge variant="success">Tersimpan, membuka detail...</Badge>}
      </div>

      {/* Panduan halaman */}
      <PageGuide guideKey="transactions/new" />

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
              form.handleSubmit(onSubmit)(event).catch((err) => console.error("submit failed", err));
            }}
            className="min-w-0 space-y-4"
            noValidate
          >
          {/* Section 1: Pilih jenis transaksi */}
          <TransactionTypeSection
            selectedType={selectedType}
            selectedTypeLabel={selectedTypeLabel}
            isTypeSelectorExpanded={isTypeSelectorExpanded}
            error={errors.transactionType?.message}
            onTypeChange={(type) => {
              form.setValue("transactionType", type, { shouldDirty: true, shouldValidate: true });
              form.clearErrors("transactionType");
              // Reset product selection when switching type: a typed product
              // name is only valid for the purchase flow that created it.
              form.setValue("productId", "", { shouldDirty: true });
              form.setValue("productName", "", { shouldDirty: true });
              form.setValue("quantity", undefined, { shouldDirty: true });
              form.setValue("unitPrice", undefined, { shouldDirty: true });
            }}
            onExpand={() => setIsTypeSelectorExpanded(true)}
          />

          {selectedType && (
            <div ref={activeFieldsRef}>
              <ProductFieldsSection
                isProductType={isProductType}
                isPurchaseType={isPurchaseType}
                isSaleType={isSaleType}
                form={form}
                control={control}
                errors={errors}
                products={products}
                productsLoading={productsLoading}
                selectedProductId={selectedProductId}
                selectedProductName={selectedProductName}
                selectedProduct={selectedProduct}
                selectedUnit={selectedUnit}
                selectedQuantity={selectedQuantity}
                selectedUnitPrice={selectedUnitPrice}
                manualAmount={manualAmount}
                setManualAmount={setManualAmount}
                productSubtotal={productSubtotal}
                stockAfterSale={stockAfterSale}
                remainingAmount={remainingAmount}
                descriptionPlaceholder={descriptionPlaceholder}
                showPaymentStatus={showPaymentStatus}
                selectedPaymentStatus={selectedPaymentStatus}
                selectedDueDate={selectedDueDate}
                showDueDate={showDueDate}
              />
            </div>
          )}

          {/* Section 2: Pihak, akun, dan detail tambahan */}
          {selectedType && (
            <SectionCard
              id="section-details"
              title={SECTION_LABELS[selectedType]?.payment || "Pihak, akun, dan detail tambahan"}
              step={2}
            >
              <PartyAccountSection
                showParty={showParty}
                showCashAccount={showCashAccount}
                showBankNameField={showBankNameField}
                showDestinationAccount={showDestinationAccount}
                showCategory={showCategory}
                selectedProductId={selectedProductId}
                selectedProductName={selectedProductName}
                form={form}
                errors={errors}
                partyCopy={partyCopy}
                parties={parties?.customers ?? parties?.suppliers}
                partiesLoading={partiesLoading}
                selectedPartyName={selectedPartyName}
                cashAccountLabel={cashAccountLabel}
                cashAccountOptions={cashAccountOptions}
                accountsLoading={accountsLoading}
                selectedCashAccountId={selectedCashAccountId}
                selectedType={selectedType}
                selectedDestinationCashAccountId={selectedDestinationCashAccountId}
                categoryLabel={categoryLabel}
                debitAccountOptions={debitAccountOptions}
                expenseAccountsLoading={expenseAccountsLoading}
                selectedDebitAccountId={selectedDebitAccountId}
              />
            </SectionCard>
          )}

          {/* Section 3: Catatan */}
          {selectedType && (
            <SectionCard id="section-notes" title={SECTION_LABELS[selectedType]?.notes || "Catatan"} step={3}>
              <Textarea
                label="Catatan (opsional)"
                {...form.register("notes")}
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
              cashAccountLabel={selectedCashAccountOption?.label || "Kas / Bank"}
              productName={selectedProduct?.name || selectedProductName}
            />
          )}

            {/* Disabled submit explanation */}
            {!selectedType && !postMutation.isPending && !successTransactionId && (
              <p className="text-center text-sm text-text-tertiary">
                Pilih jenis transaksi untuk melanjutkan.
              </p>
            )}

            {/* Submit bar */}
            <div className="sticky bottom-0 z-[var(--z-sticky)] -mx-4 border-t border-wood-100 bg-surface p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 sm:pb-0">
              <SubmitBar
                loading={postMutation.isPending}
                disabled={postMutation.isPending || !selectedType}
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
                    transactionType={selectedType}
                    amount={selectedAmount}
                    cashAccountLabel={selectedCashAccountOption?.label || "Kas / Bank"}
                    productName={selectedProduct?.name || selectedProductName}
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
        onConfirm={() => blocker.proceed?.()}
        onCancel={() => blocker.reset?.()}
      />
    </div>
  );
}
