import { useRef, useState } from "react";
import { Controller } from "react-hook-form";
import { createClientToken, formatAmountInput, formatNumber, parseAmountInput } from "@/lib/utils";
import { useOrganization, useOrgPermissions } from "@/hooks/useOrganization";
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
  SubmitBar,
  ErrorSummary,
  UnsavedChangesDialog,
  SectionCard,
} from "./_components";
import {
  buildPreview,
  CASH_ACCOUNT_PLACEHOLDERS,
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
} from "./_hooks";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function transactionHint(type: string | null): string {
  if (type === "cash_sale") return "Catat penjualan yang langsung dibayar.";
  if (type === "credit_sale") return "Catat penjualan yang belum dibayar.";
  if (type === "cash_purchase") return "Catat pembelian yang langsung dibayar.";
  if (type === "credit_purchase") return "Catat pembelian dengan utang.";
  return "Catat transaksi bisnis Anda. Isi dari atas ke bawah.";
}

function amountLabel(isSale: boolean, isProduct: boolean): string {
  if (isSale) return "Total Penjualan";
  if (isProduct) return "Total Pembelian";
  return "Nominal";
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
    productName: selectedProduct?.name || "",
  });

  const showUnsavedDialog = blocker.state === "blocked" && form.formState.isDirty && !successTransactionId;

  /* -- Submit handler -- */
  const onSubmit = (data: TransactionForm) => {
    if (submitInFlightRef.current || successTransactionId) return;

    if (formState.showParty && !data.partyName?.trim()) {
      formState.setError("partyName", { type: "manual", message: "Isi nama pihak" });
      scrollToError();
      return;
    }

    const needsCashAccount = formState.showCashAccount || (formState.showPaymentStatus && data.paymentStatus !== "unpaid");
    if (needsCashAccount && !data.cashAccountId) {
      formState.setError("cashAccountId", { type: "manual", message: "Pilih akun kas/bank" });
      scrollToError();
      return;
    }

    if (formState.showDestinationAccount && !data.destinationCashAccountId) {
      formState.setError("destinationCashAccountId", { type: "manual", message: "Pilih akun tujuan" });
      scrollToError();
      return;
    }

    // Validate debit account for expense/purchase types (when no product selected)
    if (formState.showCategory && !data.productId && !data.debitAccountId) {
      formState.setError("debitAccountId", { type: "manual", message: "Pilih akun CoA" });
      scrollToError();
      return;
    }

    if (data.transactionType === "cash_transfer" && data.cashAccountId === data.destinationCashAccountId) {
      formState.setError("destinationCashAccountId", { type: "manual", message: "Akun tujuan harus berbeda dari sumber" });
      scrollToError();
      return;
    }

    if (formState.showPaymentStatus && data.paymentStatus === "partial") {
      if (!data.partialAmount || data.partialAmount <= 0) {
        formState.setError("partialAmount", { type: "manual", message: "Isi jumlah pembayaran sebagian" });
        scrollToError();
        return;
      }
      if (data.partialAmount >= data.amount) {
        formState.setError("partialAmount", { type: "manual", message: "Jumlah pembayaran sebagian harus lebih kecil dari nominal transaksi" });
        scrollToError();
        return;
      }
    }

    if (data.productId) {
      if (!data.quantity || data.quantity <= 0) {
        formState.setError("quantity", { type: "manual", message: "Isi kuantitas produk (minimal 1)" });
        scrollToError();
        return;
      }
      if (data.unitPrice === undefined || data.unitPrice < 0) {
        formState.setError("unitPrice", { type: "manual", message: "Isi harga satuan produk" });
        scrollToError();
        return;
      }
      // Block sale if stock insufficient
      if (formState.isSaleType && stockAfterSale !== null && stockAfterSale < 0) {
        formState.setError("quantity", { type: "manual", message: "Stok tidak mencukupi. Stok tersisa: " + formatNumber(selectedProduct?.current_stock ?? 0) });
        scrollToError();
        return;
      }
    }

    submitInFlightRef.current = true;
    postMutation.mutate({ ...data, clientToken } as import("./_hooks").TransactionSubmission);
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
    <div className="ledger-page mx-auto max-w-6xl px-4 py-6 sm:py-8">
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
                  form.setValue("transactionType", type, { shouldDirty: true, shouldValidate: true });
                  form.clearErrors("transactionType");
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
                        form.setValue("productId", value, { shouldDirty: true, shouldValidate: true });
                        form.clearErrors("productId");
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
                        onQuantityChange={(value) => form.setValue("quantity", value, { shouldDirty: true, shouldValidate: true })}
                        onUnitPriceChange={(value) => form.setValue("unitPrice", value, { shouldDirty: true, shouldValidate: true })}
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
                      label={amountLabel(isSaleType, isProductType)}
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
                  {...form.register("description")}
                  placeholder={descriptionPlaceholder}
                  error={errors.description?.message}
                />

                {/* Payment status */}
                {showPaymentStatus && (
                  <PaymentStatusSelector
                    value={selectedPaymentStatus as "unpaid" | "partial"}
                    onChange={(status) => {
                      form.setValue("paymentStatus", status, { shouldDirty: true, shouldValidate: true });
                      if (status !== "partial") form.setValue("partialAmount", undefined);
                    }}
                    showDueDate={showDueDate}
                    dueDate={selectedDueDate || ""}
                    onDueDateChange={(date) => form.setValue("dueDate", date, { shouldDirty: true })}
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
                    form.setValue("partyName", value, { shouldDirty: true, shouldValidate: true });
                    form.clearErrors("partyName");
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
                      form.setValue("cashAccountId", value, { shouldDirty: true, shouldValidate: true });
                      form.clearErrors("cashAccountId");
                    }}
                    options={cashAccountOptions}
                    placeholder={CASH_ACCOUNT_PLACEHOLDERS[selectedType] || "Pilih akun kas/bank..."}
                    loading={accountsLoading}
                    error={errors.cashAccountId?.message}
                  />
                  {showBankNameField && (
                    <Input
                      label="Nama Bank (opsional)"
                      {...form.register("bankName")}
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
                    form.setValue("destinationCashAccountId", value, { shouldDirty: true, shouldValidate: true });
                    form.clearErrors("destinationCashAccountId");
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
                    form.setValue("debitAccountId", value, { shouldDirty: true, shouldValidate: true });
                    form.clearErrors("debitAccountId");
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
              productName={selectedProduct?.name}
            />
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
        onConfirm={() => blocker.proceed?.()}
        onCancel={() => blocker.reset?.()}
      />
    </div>
  );
}
