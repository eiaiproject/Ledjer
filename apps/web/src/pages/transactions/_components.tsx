import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  AlertCircle,
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  Package,
} from "reicon-react";
import type { FieldErrors } from "react-hook-form";
import { cn, formatAmountInput, formatIDR, formatNumber, parseAmountInput } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field } from "@/components/ui/field";
import {
  addRecentTransactionType,
  localDate,
  MOBILE_PRIORITY_TYPES,
  TRANSACTION_GROUPS,
  TRANSACTION_META,
  type PreviewLine,
} from "./_helpers";

/* ------------------------------------------------------------------ */
/*  SectionCard                                                        */
/* ------------------------------------------------------------------ */

interface SectionCardProps {
  readonly title: string;
  readonly step?: number;
  readonly helperText?: string;
  readonly id?: string;
  readonly children: ReactNode;
}

export function SectionCard({ title, step, helperText, id, children }: SectionCardProps) {
  return (
    <div id={id}>
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-text-primary">
            {step != null && (
              <span className="mr-1.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-leaf-100 text-xs font-bold text-leaf-700">
                {step}
              </span>
            )}
            {title}
          </h2>
          {helperText && (
            <p className="mt-1 text-sm text-text-tertiary">{helperText}</p>
          )}
        </CardHeader>
        <CardContent className="space-y-4">{children}</CardContent>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  ErrorSummary                                                       */
/* ------------------------------------------------------------------ */

/* eslint-disable @typescript-eslint/no-explicit-any -- generic error display component */
interface ErrorSummaryProps {
  readonly errors: FieldErrors<any>;
  readonly formErrorMessage?: string;
}

function flattenErrors(
  errors: FieldErrors<any>,
  prefix = ""
): { field: string; message: string }[] {
  const result: { field: string; message: string }[] = [];
  for (const [key, value] of Object.entries(errors)) {
    const fieldPath = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && "message" in value && value.message) {
      const msg =
        typeof value.message === "string" ? value.message : JSON.stringify(value.message);
      result.push({ field: fieldPath, message: msg });
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      result.push(...flattenErrors(value as FieldErrors<any>, fieldPath));
    }
  }
  return result;
}

export const ErrorSummary = forwardRef<HTMLDivElement, ErrorSummaryProps>(
  ({ errors, formErrorMessage }, ref) => {
    const fieldErrors = useMemo(() => flattenErrors(errors), [errors]);
    const hasErrors = fieldErrors.length > 0 || !!formErrorMessage;

    if (!hasErrors) return null;

    const scrollToField = (fieldName: string) => {
      // react-hook-form registers with the field name as the input id or name
      const el =
        document.getElementById(fieldName) ||
        document.querySelector(`[name="${fieldName}"]`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        if (el instanceof HTMLElement) el.focus();
      }
    };

    return (
      <div
        ref={ref}
        tabIndex={-1}
        role="alert"
        aria-label="Ringkasan kesalahan"
        className="mb-4 rounded-lg border border-error-border bg-error-bg p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-error"
      >
        <div className="flex items-start gap-2">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-error" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-error">
              {fieldErrors.length > 0
                ? `Ada ${fieldErrors.length} bidang yang perlu diperbaiki:`
                : "Terjadi kesalahan:"}
            </p>
            {formErrorMessage && (
              <p className="mt-1 break-words text-sm text-error">{formErrorMessage}</p>
            )}
            {fieldErrors.length > 0 && (
              <ul className="mt-2 space-y-1">
                {fieldErrors.map((err) => (
                  <li key={err.field}>
                    <button type="button"
                      type="button"
                      onClick={() => scrollToField(err.field)}
                      className="break-words text-left text-sm text-error underline underline-offset-2 hover:text-error/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-error"
                    >
                      {err.message}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    );
  }
);
ErrorSummary.displayName = "ErrorSummary";

interface TransactionTypeSelectorProps {
  readonly value: string;
  readonly onChange: (type: string) => void;
  readonly error?: string;
}

export function TransactionTypeSelector({ value, onChange, error }: TransactionTypeSelectorProps) {
  const [showAll, setShowAll] = useState(false);
  const fieldId = useId();
  const errorId = `${fieldId}-error`;
  const listboxId = `${fieldId}-options`;
  const additionalId = `${fieldId}-additional`;

  const handleSelect = useCallback(
    (type: string) => {
      onChange(type);
      addRecentTransactionType(type);
    },
    [onChange]
  );

  // Unified list: priority types first, then remaining grouped
  const priorityTypes = MOBILE_PRIORITY_TYPES;
  const additionalGroups = useMemo(
    () => TRANSACTION_GROUPS.map((g) => ({
      ...g,
      types: g.types.filter((t) => !priorityTypes.includes(t)),
    })).filter((g) => g.types.length > 0),
    [priorityTypes]
  );
  const hasAdditional = additionalGroups.length > 0;

  // Auto-expand if a hidden type is selected
  const selectedInAdditional = value && additionalGroups.some((g) => g.types.includes(value));
  const shouldShowAdditional = showAll || selectedInAdditional;

  const renderTypeCard = (type: string) => {
    const meta = TRANSACTION_META[type];
    if (!meta) return null;
    const Icon = meta.icon;
    const selected = value === type;
    const inputId = `tx-type-${type}`;
    return (
      <div key={type} className="relative">
        <input
          type="radio"
          id={inputId}
          name="transactionType"
          value={type}
          checked={selected}
          onChange={() => handleSelect(type)}
          className="peer sr-only"
          aria-describedby={`${inputId}-desc`}
        />
        <label
          htmlFor={inputId}
          className={cn(
            "ledger-interactive group flex min-h-[76px] cursor-pointer items-start gap-3 rounded-lg border p-3 text-left",
            "focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-wood-500",
            selected
              ? "border-leaf-500 bg-leaf-50 shadow-sm ring-1 ring-leaf-500/20"
              : "border-wood-200 bg-surface hover:border-wood-300 hover:bg-cream-100"
          )}
        >
          <div
            className={cn(
              "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md transition-colors",
              selected ? "bg-leaf-100 text-leaf-600" : "bg-cream-200 text-wood-500 group-hover:bg-cream-300"
            )}
            aria-hidden="true"
          >
            <Icon className="h-4 w-4" />
          </div>
          <span className="min-w-0 flex-1">
            <span className="block break-words text-sm font-medium text-text-primary">
              {meta.label}
            </span>
            <span id={`${inputId}-desc`} className="mt-0.5 block break-words text-xs leading-relaxed text-text-tertiary">
              {meta.description}
            </span>
          </span>
          {selected && (
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-leaf-600" aria-hidden="true" />
          )}
        </label>
      </div>
    );
  };

  return (
    <fieldset className="border-0 p-0 m-0">
      <legend className="sr-only">Jenis transaksi</legend>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-text-secondary">Jenis Transaksi</p>
        {error && (
          <p className="flex items-center gap-1 text-xs text-error" role="alert" id={errorId}>
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {error}
          </p>
        )}
      </div>

      {/* Unified type grid — priority types always visible */}
      <div id={listboxId} className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Jenis transaksi" aria-invalid={error ? true : undefined} aria-describedby={error ? errorId : undefined}>
        {priorityTypes.map((type) => renderTypeCard(type))}
      </div>

      {/* Expandable: other types */}
      {hasAdditional && !shouldShowAdditional && (
        <button type="button"
          type="button"
          onClick={() => setShowAll(true)}
          aria-expanded="false"
          aria-controls={additionalId}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-wood-300 bg-cream-50 py-2.5 text-sm font-medium text-wood-600 hover:bg-cream-100 hover:text-wood-700 min-h-[44px]"
        >
          Lihat jenis transaksi lainnya
          <ChevronDown className="h-4 w-4" aria-hidden="true" />
        </button>
      )}

      {hasAdditional && shouldShowAdditional && (
        <div id={additionalId} className="mt-4 space-y-4 border-t border-wood-100 pt-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-normal text-text-tertiary">Semua Jenis</p>
            <button type="button"
              type="button"
              onClick={() => { if (!selectedInAdditional) setShowAll(false); }}
              aria-expanded="true"
              aria-controls={additionalId}
              className="text-xs font-medium text-wood-500 hover:text-wood-700 min-h-[44px] min-w-[44px] flex items-center justify-center"
            >
              Sembunyikan jenis transaksi lainnya
            </button>
          </div>
          {additionalGroups.map((group) => (
            <div key={group.label}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-normal text-text-tertiary">
                {group.label}
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {group.types.map((type) => renderTypeCard(type))}
              </div>
            </div>
          ))}
        </div>
      )}
    </fieldset>
  );
}

/* ------------------------------------------------------------------ */
/*  PaymentStatusSelector                                              */
/* ------------------------------------------------------------------ */

interface PaymentStatusSelectorProps {
  readonly value: "unpaid" | "partial";
  readonly onChange: (status: "unpaid" | "partial") => void;
  readonly showDueDate: boolean;
  readonly dueDate: string;
  readonly onDueDateChange: (date: string) => void;
}

const PAYMENT_OPTIONS = [
  { value: "unpaid" as const, label: "Belum Dibayar" },
  { value: "partial" as const, label: "Bayar Sebagian" },
];

export function PaymentStatusSelector({
  value,
  onChange,
  showDueDate,
  dueDate,
  onDueDateChange,
}: PaymentStatusSelectorProps) {
  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-sm font-medium text-text-secondary">Status Pembayaran</p>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Status pembayaran">
          {PAYMENT_OPTIONS.map((option) => (
            <button type="button"
              key={option.value}
              type="button"
              role="radio"
              aria-checked={value === option.value}
              onClick={() => {
                onChange(option.value);
              }}
              className={cn(
                "ledger-interactive flex min-h-[44px] flex-col items-center justify-center gap-0.5 rounded-lg border px-3 py-2 text-center",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wood-500",
                value === option.value
                  ? "border-leaf-500 bg-leaf-50 text-leaf-700 shadow-sm ring-1 ring-leaf-500/20"
                  : "border-wood-200 bg-surface text-text-secondary hover:bg-cream-100"
              )}
            >
              <span className="break-words text-sm font-medium">{option.label}</span>
            </button>
          ))}
        </div>
      </div>

      {showDueDate && (
        <div>
          <label htmlFor="dueDate" className="mb-1 block text-sm font-medium text-text-secondary">
            Jatuh Tempo
          </label>
          <input
            id="dueDate"
            type="date"
            value={dueDate}
            onChange={(e) => onDueDateChange(e.target.value)}
            className="min-h-[44px] h-10 w-full rounded-md border border-wood-200 bg-cream-50 px-3 text-sm text-wood-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wood-500 sm:min-h-0"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="xs" onClick={() => onDueDateChange(localDate())}>
              Hari ini
            </Button>
            <Button type="button" variant="secondary" size="xs" onClick={() => onDueDateChange(localDate(7))}>
              +7 hari
            </Button>
            <Button type="button" variant="secondary" size="xs" onClick={() => onDueDateChange(localDate(30))}>
              +30 hari
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  ProductDetailFields                                                */
/* ------------------------------------------------------------------ */

interface Product {
  id: string;
  code: string;
  name: string;
  unit: string | null;
  purchase_price: number | null;
  selling_price: number | null;
  current_stock: number | null;
}

interface ProductDetailFieldsProps {
  readonly product: Product;
  readonly isSaleType: boolean;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly subtotal: number;
  readonly stockAfterSale: number | null;
  readonly onQuantityChange: (value: number) => void;
  readonly onUnitPriceChange: (value: number) => void;
  readonly quantityError?: string;
  readonly unitPriceError?: string;
}

export function ProductDetailFields({
  product,
  isSaleType,
  quantity,
  unitPrice,
  subtotal,
  stockAfterSale,
  onQuantityChange,
  onUnitPriceChange,
  quantityError,
  unitPriceError,
}: ProductDetailFieldsProps) {
  let stockBadgeClass = "text-text-tertiary";
  if (stockAfterSale !== null && stockAfterSale < 0) {
    stockBadgeClass = "border border-error-border bg-error-bg text-error";
  } else if (stockAfterSale === 0) {
    stockBadgeClass = "border border-warning-border bg-warning-bg text-warning";
  }

  const qtyRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const el = qtyRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => e.preventDefault();
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  return (
    <div className="min-w-0 space-y-4 rounded-lg border border-wood-100 bg-cream-100 p-4">
      <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-text-primary">
        <Package className="h-4 w-4 text-wood-500" />
        <span className="min-w-0 break-words">Detail Produk: {product.code} - {product.name}</span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Kuantitas" error={quantityError} htmlFor="product-quantity" feedbackId="product-quantity-feedback">
          <input
            ref={qtyRef}
            id="product-quantity"
            type="number"
            min="1"
            step="1"
            value={quantity || ""}
            onChange={(e) => onQuantityChange(Number(e.target.value) || 0)}
            className={cn(
              "min-h-[44px] h-10 w-full min-w-0 rounded-md border bg-cream-50 px-3 text-sm text-wood-900 num-mono focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wood-500",
              quantityError ? "border-error" : "border-wood-200",
              "sm:min-h-0"
            )}
            aria-invalid={quantityError ? true : undefined}
            aria-describedby={quantityError ? "product-quantity-feedback" : undefined}
          />
        </Field>

        <Field label="Harga Satuan" error={unitPriceError} htmlFor="product-unit-price" feedbackId="product-unit-price-feedback">
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 flex -translate-y-1/2 items-center text-sm text-wood-400">
              Rp
            </span>
            <input
              id="product-unit-price"
              type="text"
              inputMode="numeric"
              value={formatAmountInput(unitPrice)}
              onChange={(e) => onUnitPriceChange(parseAmountInput(e.target.value, 0) ?? 0)}
              className={cn(
                "min-h-[44px] h-10 w-full rounded-md border bg-surface pl-10 pr-3 text-right text-sm num-mono focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wood-500 sm:min-h-0",
                unitPriceError ? "border-error" : "border-wood-200"
              )}
              aria-invalid={unitPriceError ? true : undefined}
              aria-describedby={unitPriceError ? "product-unit-price-feedback" : undefined}
            />
          </div>
        </Field>
      </div>

      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-md bg-cream-50 px-3 py-2">
        <span className="text-sm text-text-secondary">Subtotal</span>
        <span className="min-w-0 break-words text-sm font-semibold num-mono text-text-primary">{formatIDR(subtotal)}</span>
      </div>

      {isSaleType && stockAfterSale !== null && (
        <div
          className={cn(
            "flex min-w-0 items-start gap-2 rounded-md px-3 py-2 text-sm",
            stockBadgeClass
          )}
          role={stockAfterSale < 0 ? "alert" : undefined}
        >
          {stockAfterSale < 0 && <AlertTriangle className="h-4 w-4 shrink-0" />}
          <span className="min-w-0 break-words">
            Stok setelah transaksi: <strong>{formatNumber(stockAfterSale)}</strong> {product.unit}
            {stockAfterSale < 0 && (
              <span className="block text-xs mt-0.5">
                Stok akan menjadi negatif. Pastikan data sudah benar.
              </span>
            )}
          </span>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  ReviewPanel (seller-first summary)                                 */
/* ------------------------------------------------------------------ */

interface ReviewPanelProps {
  readonly debit: PreviewLine[];
  readonly credit: PreviewLine[];
  readonly stockWarning: number | null;
  readonly className?: string;
  /** Seller-first summary props */
  readonly transactionType?: string;
  readonly amount?: number;
  readonly cashAccountLabel?: string;
  readonly productName?: string;
}

export function ReviewPanel({
  debit,
  credit,
  stockWarning,
  className,
  transactionType,
  amount = 0,
  cashAccountLabel,
  productName,
}: ReviewPanelProps) {
  const hasPreview = debit.length > 0 || credit.length > 0;
  const isSale = transactionType === "cash_sale" || transactionType === "credit_sale";
  const isPurchase = transactionType === "cash_purchase" || transactionType === "credit_purchase";
  const [journalOpen, setJournalOpen] = useState(false);

  // Seller-first summary for sale/purchase types
  const showSellerSummary = isSale || isPurchase;

  return (
    <div className={cn("min-w-0 space-y-5", className)}>
      {/* Header */}
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <h3 className="min-w-0 break-words text-base font-semibold text-text-primary">Ringkasan Transaksi</h3>
        {hasPreview && (
          <Badge variant="info" size="sm">
            {debit.length + credit.length} jurnal
          </Badge>
        )}
      </div>

      {/* Seller-first summary */}
      {showSellerSummary && (
        <div className="space-y-3 border-t border-wood-100 pt-3">
          {isSale && (
            <>
              <div className="flex min-w-0 items-start justify-between gap-3 text-sm">
                <span className="text-text-secondary">Total penjualan</span>
                <span className="shrink-0 text-right num-mono font-semibold text-text-primary">{formatIDR(amount)}</span>
              </div>
              <div className="flex min-w-0 items-start justify-between gap-3 text-sm">
                <span className="text-text-secondary">Diterima di</span>
                <span className="shrink-0 right text-text-primary">{cashAccountLabel || "Kas / Bank"}</span>
              </div>
              <div className="flex min-w-0 items-start justify-between gap-3 text-sm">
                <span className="text-text-secondary">Pendapatan bertambah</span>
                <span className="shrink-0 text-right num-mono font-medium text-success">+{formatIDR(amount)}</span>
              </div>
              {stockWarning !== null && (
                <div className="flex min-w-0 items-start justify-between gap-3 text-sm">
                  <span className="text-text-secondary">Stok berkurang</span>
                  <span className={cn("shrink-0 text-right num-mono font-medium", stockWarning < 0 ? "text-error" : "text-text-primary")}>
                    {productName || "Produk"}: {formatNumber(stockWarning)}
                  </span>
                </div>
              )}
            </>
          )}
          {isPurchase && (
            <>
              <div className="flex min-w-0 items-start justify-between gap-3 text-sm">
                <span className="text-text-secondary">Total pembelian</span>
                <span className="shrink-0 text-right num-mono font-semibold text-text-primary">{formatIDR(amount)}</span>
              </div>
              <div className="flex min-w-0 items-start justify-between gap-3 text-sm">
                <span className="text-text-secondary">Dibayar dari</span>
                <span className="shrink-0 text-right text-text-primary">{cashAccountLabel || "Kas / Bank"}</span>
              </div>
              <div className="flex min-w-0 items-start justify-between gap-3 text-sm">
                <span className="text-text-secondary">Beban bertambah</span>
                <span className="shrink-0 text-right num-mono font-medium text-error">+{formatIDR(amount)}</span>
              </div>
              {stockWarning !== null && (
                <div className="flex min-w-0 items-start justify-between gap-3 text-sm">
                  <span className="text-text-secondary">Stok bertambah</span>
                  <span className="shrink-0 text-right num-mono font-medium text-text-primary">
                    {productName || "Produk"}: +{formatNumber(stockWarning)}
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Collapsible journal preview */}
      {hasPreview && (
        <div className="border-t border-wood-100 pt-3">
          <button type="button"
            type="button"
            onClick={() => setJournalOpen(!journalOpen)}
            className="flex w-full items-center justify-between gap-2 text-sm font-medium text-text-secondary hover:text-text-primary"
            aria-expanded={journalOpen}
          >
            <span>Lihat jurnal</span>
            {journalOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {journalOpen && (
            <div className="mt-3 space-y-2">
              {debit.map((line) => (
                <div key={`${line.account}-${line.amount}-${line.direction}`} className="flex min-w-0 items-start justify-between gap-3 text-sm">
                  <span className="min-w-0 break-words text-text-secondary">
                    <span className="inline-block w-12 font-medium text-leaf-600">Debet</span>
                    {line.account}
                  </span>
                  <span className="shrink-0 text-right num-mono font-medium text-text-primary">{formatIDR(line.amount)}</span>
                </div>
              ))}
              {credit.map((line) => (
                <div key={`${line.account}-${line.amount}-${line.direction}`} className="flex min-w-0 items-start justify-between gap-3 text-sm">
                  <span className="min-w-0 break-words text-text-secondary">
                    <span className="inline-block w-12 font-medium text-clay-600">Kredit</span>
                    {line.account}
                  </span>
                  <span className="shrink-0 text-right num-mono font-medium text-text-primary">{formatIDR(line.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Fallback: no seller summary (non-sale/purchase types) */}
      {!showSellerSummary && (
        <>
          {/* Journal preview */}
          <div>
            <h4 className="mb-2 text-sm font-semibold text-text-primary">Pratinjau Jurnal</h4>
            <div className="space-y-2 border-t border-wood-100 pt-3">
              {hasPreview ? (
                <>
                  {debit.map((line) => (
                    <div key={`${line.account}-${line.amount}-${line.direction}`} className="flex min-w-0 items-start justify-between gap-3 text-sm">
                      <span className="min-w-0 break-words text-text-secondary">
                        <span className="inline-block w-12 font-medium text-leaf-600">Debet</span>
                        {line.account}
                      </span>
                      <span className="shrink-0 text-right num-mono font-medium text-text-primary">{formatIDR(line.amount)}</span>
                    </div>
                  ))}
                  {credit.map((line) => (
                    <div key={`${line.account}-${line.amount}-${line.direction}`} className="flex min-w-0 items-start justify-between gap-3 text-sm">
                      <span className="min-w-0 break-words text-text-secondary">
                        <span className="inline-block w-12 font-medium text-clay-600">Kredit</span>
                        {line.account}
                      </span>
                      <span className="shrink-0 text-right num-mono font-medium text-text-primary">{formatIDR(line.amount)}</span>
                    </div>
                  ))}
                </>
              ) : (
                <p className="text-sm text-text-tertiary">
                  Pilih jenis transaksi dan isi nominal untuk melihat pratinjau jurnal.
                </p>
              )}
            </div>
          </div>

          {/* Balance impact */}
          <div>
            <h4 className="mb-2 text-sm font-semibold text-text-primary">Pengaruh Saldo</h4>
            <div className="space-y-2 border-t border-wood-100 pt-3">
              {[...debit, ...credit].map((line) => (
                <div key={`${line.account}-${line.amount}-${line.direction}`} className="flex min-w-0 items-start justify-between gap-3 text-sm">
                  <span className="min-w-0 break-words text-text-secondary">{line.account}</span>
                  <span className={cn("shrink-0 text-right num-mono font-medium", line.direction === "increase" ? "text-success" : "text-error")}>
                    {line.direction === "increase" ? "+" : "-"}
                    {formatIDR(line.amount)}
                  </span>
                </div>
              ))}
              {!hasPreview && <p className="text-sm text-text-tertiary">Belum ada dampak saldo.</p>}
            </div>
          </div>
        </>
      )}

      {/* Warnings */}
      <div className="space-y-2">
        {stockWarning !== null && stockWarning < 0 && (
          <div className="flex min-w-0 items-start gap-2 rounded-md border border-error-border bg-error-bg px-3 py-2 text-xs text-error" role="alert">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="min-w-0 break-words">Stok produk akan menjadi negatif ({formatNumber(stockWarning)}).</span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  MobileReviewToggle                                                 */
/* ------------------------------------------------------------------ */

interface MobileReviewToggleProps {
  readonly debit: PreviewLine[];
  readonly credit: PreviewLine[];
  readonly transactionType: string;
  readonly amount: number;
  readonly stockWarning: number | null;
  readonly cashAccountLabel?: string;
  readonly productName?: string;
}

const REVIEW_HINT_KEY = "ledjer:mobile-review-hint-seen";

export function MobileReviewToggle(props: MobileReviewToggleProps) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [showHint, setShowHint] = useState(() => {
    try { return !localStorage.getItem(REVIEW_HINT_KEY); } catch { return false; }
  });
  const handleToggle = () => {
    setOpen(!open);
    if (showHint) {
      setShowHint(false);
      try {
        localStorage.setItem(REVIEW_HINT_KEY, "1");
      } catch {
        // Ignore storage errors.
      }
    }
  };

  return (
    <div className="relative min-w-0 lg:hidden">
      <button type="button"
        type="button"
        onClick={handleToggle}
        className={cn(
          "ledger-interactive flex w-full min-w-0 items-center justify-between gap-3 rounded-lg border px-4 py-3 text-left text-sm font-medium",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wood-500",
          open
            ? "border-leaf-500 bg-leaf-50 text-leaf-700"
            : "border-wood-200 bg-surface text-text-primary hover:bg-cream-100"
        )}
        aria-expanded={open}
        aria-controls={panelId}
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 break-words">Ringkasan Transaksi</span>
        </span>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {/* First-use hint */}
      {showHint && !open && (
        <div className="absolute -top-10 left-0 right-0 rounded-lg bg-wood-800 px-3 py-2 text-xs text-cream-50 shadow-lg" role="note">
          <span className="break-words">Ketuk untuk melihat preview jurnal sebelum menyimpan</span>
          <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 h-3 w-3 rotate-45 bg-wood-800" />
        </div>
      )}
      <div
        id={panelId}
        aria-hidden={!open}
        className={cn(
          "overflow-hidden transition-all duration-300 ease-in-out",
          open ? "max-h-[600px] opacity-100" : "max-h-0 opacity-0"
        )}
      >
        <div className="rounded-b-lg border border-t-0 border-wood-200 bg-surface p-4">
          <ReviewPanel
            debit={props.debit}
            credit={props.credit}
            stockWarning={props.stockWarning}
            transactionType={props.transactionType}
            amount={props.amount}
            cashAccountLabel={props.cashAccountLabel}
            productName={props.productName}
          />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  SubmitBar                                                          */
/* ------------------------------------------------------------------ */

type SubmitBarProps = Readonly<{
  loading: boolean;
  disabled: boolean;
  successId: string | null;
  label?: string;
}>;

export function SubmitBar({ loading, disabled, successId, label }: SubmitBarProps) {
  let buttonLabel = label || "Catat Transaksi";
  if (loading) {
    buttonLabel = "Menyimpan...";
  }
  if (successId) {
    buttonLabel = "Transaksi Tersimpan";
  }

  return (
    <div className="space-y-3 border-t border-wood-100 pt-4">
      {/* Submit button */}
      <Button
        type="submit"
        fullWidth
        loading={loading}
        disabled={disabled || !!successId}
        variant={successId ? "success" : "primary"}
        className="min-h-[48px] text-base"
        aria-busy={loading || undefined}
      >
        {successId && <Check className="h-5 w-5" />}
        {buttonLabel}
      </Button>

      {/* Success state */}
      {successId && (
        <p className="text-center text-sm text-success">
          Transaksi tersimpan. Membuka detail...
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  UnsavedChangesDialog                                               */
/* ------------------------------------------------------------------ */

interface UnsavedChangesDialogProps {
  readonly open: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
  readonly loading?: boolean;
}

export function UnsavedChangesDialog({ open, onConfirm, onCancel, loading }: UnsavedChangesDialogProps) {
  return (
    <ConfirmDialog
      open={open}
      onClose={onCancel}
      onConfirm={onConfirm}
      title="Batalkan transaksi?"
      message="Perubahan yang belum disimpan akan hilang."
      confirmLabel="Batalkan transaksi"
      cancelLabel="Tetap mengisi"
      variant="danger"
      loading={loading}
    />
  );
}
