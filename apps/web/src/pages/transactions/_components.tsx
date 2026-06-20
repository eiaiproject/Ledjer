import {
  forwardRef,
  useCallback,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  Package,
} from "lucide-react";
import type { FieldErrors } from "react-hook-form";
import { cn, formatIDR, formatNumber } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Field } from "@/components/ui/field";
import {
  addRecentTransactionType,
  getRecentTransactionTypes,
  localDate,
  TRANSACTION_GROUPS,
  TRANSACTION_META,
  type PreviewLine,
} from "./_helpers";

/* ------------------------------------------------------------------ */
/*  SectionCard                                                        */
/* ------------------------------------------------------------------ */

interface SectionCardProps {
  title: string;
  step?: number;
  helperText?: string;
  id?: string;
  children: ReactNode;
}

export function SectionCard({ title, step, helperText, id, children }: SectionCardProps) {
  return (
    <div id={id}>
      <Card>
        <CardHeader>
          <h2 className="text-lg font-serif font-semibold text-text-primary">
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

/* eslint-disable @typescript-eslint/no-explicit-any */
interface ErrorSummaryProps {
  errors: FieldErrors<any>;
  formErrorMessage?: string;
}

function flattenErrors(
  errors: FieldErrors<any>,
  prefix = ""
): { field: string; message: string }[] {
  const result: { field: string; message: string }[] = [];
  for (const [key, value] of Object.entries(errors)) {
    const fieldPath = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && "message" in value && value.message) {
      result.push({ field: fieldPath, message: String(value.message) });
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
        className="mb-4 rounded-lg border border-error-border bg-error-bg p-4 focus:outline-none focus:ring-2 focus:ring-error"
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
              <p className="mt-1 text-sm text-error">{formErrorMessage}</p>
            )}
            {fieldErrors.length > 0 && (
              <ul className="mt-2 space-y-1">
                {fieldErrors.map((err) => (
                  <li key={err.field}>
                    <button
                      type="button"
                      onClick={() => scrollToField(err.field)}
                      className="text-left text-sm text-error underline underline-offset-2 hover:text-error/80 focus:outline-none focus:ring-2 focus:ring-error"
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

/* ------------------------------------------------------------------ */
/*  PlanUsageBanner                                                    */
/* ------------------------------------------------------------------ */

interface PlanUsageBannerProps {
  isFreePlan: boolean;
  isAtLimit: boolean;
  usageCount: number;
  usageLimit: number;
}

export function PlanUsageBanner({ isFreePlan, isAtLimit, usageCount, usageLimit }: PlanUsageBannerProps) {
  if (!isFreePlan) return null;

  const usagePercent = Math.min((usageCount / usageLimit) * 100, 100);
  const isWarning = usagePercent >= 80;

  return (
    <Card variant={isAtLimit ? "outline" : "filled"} className="mb-4">
      <CardContent className={isAtLimit ? "text-error" : "text-text-secondary"}>
        {isAtLimit ? (
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-error/10">
              <AlertCircle className="h-5 w-5 text-error" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium">Limit transaksi bulanan tercapai</p>
              <p className="mt-1 text-sm">
                Anda sudah mencapai {usageLimit} dari {usageLimit} transaksi gratis bulan ini.
              </p>
              <Link
                to="/settings/billing"
                className="mt-2 inline-flex items-center gap-1 text-sm font-medium underline underline-offset-2 hover:text-error/80"
              >
                Upgrade ke paket Solo →
              </Link>
            </div>
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between">
              <p className="text-sm">
                Paket Gratis: <span className="font-medium">{usageCount}/{usageLimit}</span> transaksi bulan ini
              </p>
              {isWarning && <Badge variant="warning" dot>Hampir limit</Badge>}
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-wood-200">
              <div
                className={cn(
                  "h-full rounded-full transition-all duration-500",
                  isWarning ? "bg-warning" : "bg-leaf-500"
                )}
                style={{ width: `${usagePercent}%` }}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  TransactionTypeSelector                                            */
/* ------------------------------------------------------------------ */

interface TransactionTypeSelectorProps {
  value: string;
  onChange: (type: string) => void;
  error?: string;
}

export function TransactionTypeSelector({ value, onChange, error }: TransactionTypeSelectorProps) {
  const [recentTypes, setRecentTypes] = useState<string[]>(() => getRecentTransactionTypes());

  const handleSelect = useCallback(
    (type: string) => {
      onChange(type);
      setRecentTypes(addRecentTransactionType(type));
    },
    [onChange]
  );

  const recentMeta = useMemo(
    () => recentTypes.filter((t) => TRANSACTION_META[t]).map((t) => ({ type: t, ...TRANSACTION_META[t] })),
    [recentTypes]
  );

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-text-secondary">Jenis Transaksi</p>
        {error && (
          <p className="flex items-center gap-1 text-xs text-error" role="alert">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {error}
          </p>
        )}
      </div>

      {/* Recently used */}
      {recentMeta.length > 0 && (
        <div className="mb-4">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-normal text-text-tertiary">
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            Sering Digunakan
          </p>
          <div className="flex flex-wrap gap-2">
            {recentMeta.map(({ type, label, icon: Icon }) => (
              <Button
                key={type}
                type="button"
                variant={value === type ? "primary" : "secondary"}
                size="sm"
                onClick={() => handleSelect(type)}
                aria-pressed={value === type}
                className="gap-1.5"
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* All types by group */}
      <div className="space-y-4">
        {TRANSACTION_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-normal text-text-tertiary">
              {group.label}
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {group.types.map((type) => {
                const meta = TRANSACTION_META[type];
                const Icon = meta.icon;
                const selected = value === type;
                return (
                  <button
                    key={type}
                    type="button"
                    role="button"
                    aria-pressed={selected}
                    onClick={() => handleSelect(type)}
                    className={cn(
                      "group flex min-h-[76px] items-start gap-3 rounded-lg border p-3 text-left transition-all duration-150",
                      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wood-500",
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
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-text-primary">
                        {meta.label}
                      </span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-text-tertiary">
                        {meta.description}
                      </span>
                    </span>
                    {selected && (
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-leaf-600" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  PaymentStatusSelector                                              */
/* ------------------------------------------------------------------ */

interface PaymentStatusSelectorProps {
  value: "paid" | "unpaid" | "partial";
  onChange: (status: "paid" | "unpaid" | "partial") => void;
  showDueDate: boolean;
  dueDate: string;
  onDueDateChange: (date: string) => void;
}

const PAYMENT_OPTIONS = [
  { value: "unpaid" as const, label: "Belum Dibayar", description: "Belum ada pembayaran" },
  { value: "partial" as const, label: "Bayar Sebagian", description: "Dibayar sebagian" },
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
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Status pembayaran">
          {PAYMENT_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={value === option.value}
              onClick={() => {
                onChange(option.value);
              }}
              className={cn(
                "flex min-h-[44px] flex-col items-center justify-center gap-0.5 rounded-lg border px-3 py-2 text-center transition-all duration-150",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wood-500",
                value === option.value
                  ? "border-leaf-500 bg-leaf-50 text-leaf-700 shadow-sm ring-1 ring-leaf-500/20"
                  : "border-wood-200 bg-surface text-text-secondary hover:bg-cream-100"
              )}
            >
              <span className="text-sm font-medium">{option.label}</span>
              <span className="hidden text-[11px] text-text-tertiary sm:block">{option.description}</span>
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
            className="h-10 w-full rounded-md border border-wood-200 bg-cream-50 px-3 text-sm text-wood-900 focus:border-wood-500 focus:outline-none focus:ring-2 focus:ring-wood-500"
          />
          <div className="mt-2 flex gap-2">
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
  product: Product;
  isSaleType: boolean;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  stockAfterSale: number | null;
  onQuantityChange: (value: number) => void;
  onUnitPriceChange: (value: number) => void;
  quantityError?: string;
  unitPriceError?: string;
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
  return (
    <div className="space-y-4 rounded-lg border border-wood-100 bg-cream-100 p-4">
      <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
        <Package className="h-4 w-4 text-wood-500" />
        Detail Produk: {product.code} - {product.name}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Kuantitas" error={quantityError} htmlFor="product-quantity">
          <input
            id="product-quantity"
            type="number"
            min="1"
            step="1"
            value={quantity || ""}
            onChange={(e) => onQuantityChange(Number(e.target.value) || 0)}
            className="h-10 w-full rounded-md border border-wood-200 bg-cream-50 px-3 text-sm text-wood-900 num-mono focus:border-wood-500 focus:outline-none focus:ring-2 focus:ring-wood-500"
            aria-invalid={!!quantityError}
            aria-describedby={quantityError ? "product-quantity-error" : undefined}
          />
        </Field>

        <Field label="Harga Satuan" error={unitPriceError} htmlFor="product-unit-price">
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 flex -translate-y-1/2 items-center text-sm text-wood-400">
              Rp
            </span>
            <input
              id="product-unit-price"
              type="text"
              inputMode="numeric"
              value={unitPrice ? formatIDR(unitPrice) : ""}
              onChange={(e) => {
                const raw = e.target.value.replace(/[^0-9]/g, "");
                onUnitPriceChange(Number(raw) || 0);
              }}
              className="h-10 w-full rounded-md border border-wood-200 bg-cream-50 pl-10 pr-3 text-right text-sm text-wood-900 num-mono focus:border-wood-500 focus:outline-none focus:ring-2 focus:ring-wood-500"
              aria-invalid={!!unitPriceError}
              aria-describedby={unitPriceError ? "product-unit-price-error" : undefined}
            />
          </div>
        </Field>
      </div>

      <div className="flex items-center justify-between rounded-md bg-cream-50 px-3 py-2">
        <span className="text-sm text-text-secondary">Subtotal</span>
        <span className="text-sm font-semibold num-mono text-text-primary">{formatIDR(subtotal)}</span>
      </div>

      {isSaleType && stockAfterSale !== null && (
        <div
          className={cn(
            "flex items-center gap-2 rounded-md px-3 py-2 text-sm",
            stockAfterSale < 0
              ? "border border-error-border bg-error-bg text-error"
              : stockAfterSale === 0
              ? "border border-warning-border bg-warning-bg text-warning"
              : "text-text-tertiary"
          )}
          role={stockAfterSale < 0 ? "alert" : undefined}
        >
          {stockAfterSale < 0 && <AlertTriangle className="h-4 w-4 shrink-0" />}
          <span>
            Stok setelah transaksi: <strong>{formatNumber(stockAfterSale)}</strong> {product.unit}
            {stockAfterSale < 0 && (
              <span className="block text-xs mt-0.5">
                ⚠️ Stok akan menjadi negatif. Pastikan data sudah benar.
              </span>
            )}
          </span>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  ReviewPanel (enhanced)                                             */
/* ------------------------------------------------------------------ */

interface ReviewPanelProps {
  debit: PreviewLine[];
  credit: PreviewLine[];
  transactionType: string;
  amount: number;
  paymentStatus: string;
  remainingAmount: number;
  dueDate: string;
  partyName: string;
  productSubtotal: number;
  stockWarning: number | null;
  isAtLimit: boolean;
  usageCount: number;
  usageLimit: number;
  className?: string;
}

export function ReviewPanel({
  debit,
  credit,
  transactionType,
  amount,
  paymentStatus,
  remainingAmount,
  dueDate,
  partyName,
  productSubtotal,
  stockWarning,
  isAtLimit,
  usageCount,
  usageLimit,
  className,
}: ReviewPanelProps) {
  const hasPreview = debit.length > 0 || credit.length > 0;
  const meta = TRANSACTION_META[transactionType];

  return (
    <div className={cn("space-y-5", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-base font-serif font-semibold text-text-primary">Review Transaksi</h3>
        {hasPreview && (
          <Badge variant="info" size="sm">
            Pratinjau Jurnal
          </Badge>
        )}
      </div>

      {/* Transaction summary */}
      {meta && (
        <div className="space-y-2 rounded-lg bg-cream-100 px-3 py-2.5 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-text-secondary">Jenis</span>
            <span className="font-medium text-text-primary">{meta.label}</span>
          </div>
          {amount > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-text-secondary">Nominal</span>
              <span className="font-semibold num-mono text-text-primary">{formatIDR(amount)}</span>
            </div>
          )}
          {partyName && (
            <div className="flex items-center justify-between">
              <span className="text-text-secondary">{partyName.includes("supplier") ? "Supplier" : "Pelanggan"}</span>
              <span className="font-medium text-text-primary">{partyName}</span>
            </div>
          )}
          {paymentStatus && (
            <div className="flex items-center justify-between">
              <span className="text-text-secondary">Status</span>
              <Badge
                variant={paymentStatus === "paid" ? "success" : paymentStatus === "partial" ? "warning" : "neutral"}
                size="sm"
              >
                {paymentStatus === "paid" ? "Lunas" : paymentStatus === "partial" ? "Sebagian" : "Belum Dibayar"}
              </Badge>
            </div>
          )}
          {paymentStatus === "partial" && remainingAmount > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-text-secondary">Sisa Tagihan</span>
              <span className="font-medium num-mono text-warning">{formatIDR(remainingAmount)}</span>
            </div>
          )}
          {dueDate && paymentStatus !== "paid" && (
            <div className="flex items-center justify-between">
              <span className="text-text-secondary">Jatuh Tempo</span>
              <span className={cn(
                "font-medium",
                new Date(dueDate) < new Date() ? "text-error" : "text-text-primary"
              )}>
                {new Date(dueDate).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                {new Date(dueDate) < new Date() && " (sudah lewat)"}
              </span>
            </div>
          )}
          {productSubtotal > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-text-secondary">Subtotal Produk</span>
              <span className="font-medium num-mono text-text-primary">{formatIDR(productSubtotal)}</span>
            </div>
          )}
        </div>
      )}

      {/* Journal preview */}
      <div>
        <h4 className="mb-2 text-sm font-semibold text-text-primary">Pratinjau Jurnal</h4>
        <div className="space-y-2 border-t border-wood-100 pt-3">
          {hasPreview ? (
            <>
              {debit.map((line, index) => (
                <div key={`debit-${index}`} className="flex items-start justify-between gap-3 text-sm">
                  <span className="text-text-secondary">
                    <span className="inline-block w-12 font-medium text-leaf-600">Debet</span>
                    {line.account}
                  </span>
                  <span className="num-mono font-medium text-text-primary">{formatIDR(line.amount)}</span>
                </div>
              ))}
              {credit.map((line, index) => (
                <div key={`credit-${index}`} className="flex items-start justify-between gap-3 text-sm">
                  <span className="text-text-secondary">
                    <span className="inline-block w-12 font-medium text-clay-600">Kredit</span>
                    {line.account}
                  </span>
                  <span className="num-mono font-medium text-text-primary">{formatIDR(line.amount)}</span>
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
          {[...debit, ...credit].map((line, index) => (
            <div key={`impact-${index}`} className="flex items-start justify-between gap-3 text-sm">
              <span className="text-text-secondary">{line.account}</span>
              <span className={cn("num-mono font-medium", line.direction === "increase" ? "text-success" : "text-error")}>
                {line.direction === "increase" ? "+" : "-"}
                {formatIDR(line.amount)}
              </span>
            </div>
          ))}
          {!hasPreview && <p className="text-sm text-text-tertiary">Belum ada dampak saldo.</p>}
        </div>
      </div>

      {/* Warnings */}
      <div className="space-y-2">
        {stockWarning !== null && stockWarning < 0 && (
          <div className="rounded-md border border-error-border bg-error-bg px-3 py-2 text-xs text-error" role="alert">
            ⚠️ Stok produk akan menjadi negatif ({formatNumber(stockWarning)}).
          </div>
        )}
        {isAtLimit && (
          <div className="rounded-md border border-error-border bg-error-bg px-3 py-2 text-xs text-error" role="alert">
            ⚠️ Anda sudah mencapai limit transaksi gratis ({usageCount}/{usageLimit}).
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
  debit: PreviewLine[];
  credit: PreviewLine[];
  transactionType: string;
  amount: number;
  paymentStatus: string;
  remainingAmount: number;
  dueDate: string;
  partyName: string;
  productSubtotal: number;
  stockWarning: number | null;
  isAtLimit: boolean;
  usageCount: number;
  usageLimit: number;
}

export function MobileReviewToggle(props: MobileReviewToggleProps) {
  const [open, setOpen] = useState(false);
  const hasData = props.amount > 0 || props.transactionType !== "";
  const count = props.debit.length + props.credit.length;

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left text-sm font-medium transition-colors",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wood-500",
          open
            ? "border-leaf-500 bg-leaf-50 text-leaf-700"
            : "border-wood-200 bg-surface text-text-primary hover:bg-cream-100"
        )}
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          <span>Review Transaksi</span>
          {hasData && count > 0 && (
            <Badge variant="info" size="sm">{count} jurnal</Badge>
          )}
        </span>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      <div
        className={cn(
          "overflow-hidden transition-all duration-300 ease-in-out",
          open ? "max-h-[600px] opacity-100" : "max-h-0 opacity-0"
        )}
      >
        <div className="border border-t-0 border-wood-200 rounded-b-lg p-4 bg-surface">
          <ReviewPanel {...props} />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  SubmitBar                                                          */
/* ------------------------------------------------------------------ */

interface SubmitBarProps {
  loading: boolean;
  disabled: boolean;
  isAtLimit: boolean;
  successId: string | null;
}

export function SubmitBar({ loading, disabled, isAtLimit, successId }: SubmitBarProps) {
  const buttonLabel = successId
    ? "Transaksi Tersimpan"
    : loading
    ? "Menyimpan..."
    : "Catat Transaksi";

  return (
    <div className="space-y-3 border-t border-wood-100 pt-4">
      {/* Keyboard shortcut hint */}
      <p className="hidden text-center text-xs text-text-tertiary sm:block">
        Tekan <kbd className="rounded border border-wood-200 bg-cream-50 px-1.5 py-0.5 font-mono text-[11px]">Ctrl</kbd> + <kbd className="rounded border border-wood-200 bg-cream-50 px-1.5 py-0.5 font-mono text-[11px]">Enter</kbd> untuk menyimpan
      </p>

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

      {/* Free plan limit message near submit */}
      {isAtLimit && !successId && (
        <p className="text-center text-xs text-error">
          Limit transaksi gratis tercapai.{' '}
          <Link to="/settings/billing" className="underline underline-offset-2 hover:text-error/80">
            Upgrade
          </Link>
        </p>
      )}

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
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

export function UnsavedChangesDialog({ open, onConfirm, onCancel, loading }: UnsavedChangesDialogProps) {
  return (
    <ConfirmDialog
      open={open}
      onClose={onCancel}
      onConfirm={onConfirm}
      title="Tinggalkan halaman?"
      message="Anda memiliki perubahan yang belum disimpan. Jika Anda meninggalkan halaman ini, semua perubahan akan hilang."
      confirmLabel="Ya, Tinggalkan"
      cancelLabel="Tetap di sini"
      variant="danger"
      loading={loading}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  EmptyComboboxMessage                                               */
/* ------------------------------------------------------------------ */

interface EmptyComboboxMessageProps {
  type: "accounts" | "parties" | "products";
}

export function EmptyComboboxMessage({ type }: EmptyComboboxMessageProps) {
  const messages = {
    accounts: {
      title: "Belum ada akun kas/bank",
      description: "Anda perlu membuat akun kas atau bank terlebih dahulu sebelum mencatat transaksi.",
    },
    parties: {
      title: "Belum ada data pihak",
      description: "Ketik nama pelanggan atau supplier untuk membuat data baru secara otomatis.",
    },
    products: {
      title: "Belum ada produk",
      description: "Ketik kode atau nama produk. Produk dapat ditambahkan dari menu Produk.",
    },
  };

  const msg = messages[type];

  return (
    <div className="px-3 py-4 text-center">
      <p className="text-sm font-medium text-text-primary">{msg.title}</p>
      <p className="mt-1 text-xs text-text-tertiary">{msg.description}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  LoadingSkeleton for comboboxes                                     */
/* ------------------------------------------------------------------ */

export function ComboboxLoadingSkeleton() {
  return (
    <div className="space-y-1.5">
      <div className="h-4 w-20 animate-pulse rounded bg-cream-200" />
      <div className="h-10 w-full animate-pulse rounded-md bg-cream-200" />
    </div>
  );
}
