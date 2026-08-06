import { forwardRef, useId, useRef, type ChangeEvent, type FocusEvent, type InputHTMLAttributes, type ReactNode, type MutableRefObject } from "react";
import { cn, formatAmountInput, formatDecimalInput } from "@/lib/utils";
import { Field } from "./field";
import { SIZE_STYLES } from "./size-styles";

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "prefix" | "size"> {
  label?: string;
  error?: string;
  helperText?: string;
  prefix?: ReactNode;
  suffix?: ReactNode;
  leftIcon?: ReactNode;
  containerClassName?: string;
  isCurrency?: boolean;
  isNumeric?: boolean;
  /** Allow fractional values (unit prices only) — displayed with id-ID comma
   *  decimals and a decimal keypad. Whole-money fields must NOT use this, so a
   *  stray decimal is never mistaken for a thousands separator. */
  allowDecimals?: boolean;
  size?: "sm" | "md" | "lg";
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      label,
      error,
      helperText,
      prefix,
      suffix,
      leftIcon,
      containerClassName,
      isCurrency,
      isNumeric,
      allowDecimals,
      size = "md",
      id,
      required,
      inputMode,
      type,
      ...props
    },
    ref
  ) => {
    const generatedId = useId();
    const inputId = id || label?.toLowerCase().replace(/\s/g, "-") || generatedId;
    const feedbackId = `${inputId}-feedback`;
    const describedBy = error || helperText ? feedbackId : undefined;
    const resolvedPrefix = isCurrency ? (prefix ?? "Rp") : (prefix ?? leftIcon);
    // Formatted numeric inputs (currency/qty-with-separators) strip non-digits
    // and show thousand separators. Plain type="number" inputs become text but
    // keep a numeric keypad (inputMode) and reject stray characters — same
    // scroll-increment/spinner reasons as the formatted path.
    const isFormattedInput = isCurrency || isNumeric;
    const isNumericInput = isFormattedInput || type === "number";
    // Unit prices (isCurrency + allowDecimals) get a decimal keypad; other
    // formatted money fields stay "numeric" so no decimal can be typed.
    const hasDecimals = Boolean(isCurrency && allowDecimals);
    const numericInputMode = isNumericInput
      ? (hasDecimals ? "decimal" : isFormattedInput ? "numeric" : inputMode ?? "decimal")
      : inputMode;
    // ponytail: number inputs use text+inputmode to prevent scroll increment
    // (native spinners are also removed globally in index.css)
    const resolvedType = type === "number" ? "text" : type;
    const internalRef = useRef<HTMLInputElement | null>(null);
    const setRefs = (node: HTMLInputElement | null) => {
      internalRef.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) (ref as MutableRefObject<HTMLInputElement | null>).current = node;
    };

    // Currency/numeric inputs are fully controlled with a formatted display so
    // thousands separators appear WHILE typing, not just on blur.
    const numericDisplay = isFormattedInput
      ? (hasDecimals ? formatDecimalInput(props.value, true) : formatAmountInput(props.value as number, true))
      : undefined;

    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
      if (!isNumericInput) {
        props.onChange?.(e);
        return;
      }
      if (!isFormattedInput) {
        // Plain decimal field (type="number"): keep digits, a decimal point and
        // an optional minus; drop everything else (no formatting).
        const cleaned = e.target.value.replace(/[^\d.-]/g, "");
        if (e.target.value !== cleaned) e.target.value = cleaned;
        props.onChange?.(e);
        return;
      }
      if (hasDecimals) {
        // Unit-price input: keep digits + a single comma decimal separator
        // (Indonesian convention; a dot in this field is always a thousands
        // separator and is stripped). Max 3 fraction digits.
        const body = e.target.value.replace(/[^\d,]/g, "");
        const commaIdx = body.lastIndexOf(",");
        const intPart = commaIdx >= 0
          ? body.slice(0, commaIdx).replace(/,/g, "")
          : body.replace(/,/g, "");
        const fracPart = commaIdx >= 0 ? body.slice(commaIdx + 1).replace(/\D/g, "").slice(0, 3) : "";
        const normalized = intPart + (fracPart ? `,${fracPart}` : "");
        if (e.target.value !== normalized) e.target.value = normalized;
        props.onChange?.(e);
        const el = internalRef.current;
        if (el) {
          const caretLen = formatDecimalInput(Number(`${intPart || 0}.${fracPart || 0}`), true).length;
          el.setSelectionRange(caretLen, caretLen);
        }
        return;
      }
      // Normalize to digits + optional single leading minus. Separators are a
      // display concern only — parents receive a clean value they can parse.
      const raw = e.target.value;
      const negative = raw.startsWith("-") || raw.endsWith("-");
      const digits = raw.replace(/\D/g, "");
      const normalized = digits ? (negative ? "-" : "") + digits : (negative ? "-" : "");
      if (e.target.value !== normalized) e.target.value = normalized;
      props.onChange?.(e);
      // Keep the caret at the right end (cash-register feel: new digits are
      // appended at the right, aligned with the formatted display).
      const el = internalRef.current;
      if (el) {
        const caretLen = (negative ? 1 : 0) + formatAmountInput(Number(digits || 0), true).length;
        el.setSelectionRange(caretLen, caretLen);
      }
    };

    const handleFocus = (e: FocusEvent<HTMLInputElement>) => {
      props.onFocus?.(e);
      if (isNumericInput) {
        const el = internalRef.current;
        if (el) el.setSelectionRange(el.value.length, el.value.length);
      }
    };

    return (
      <Field label={label} error={error} helperText={helperText} required={required} htmlFor={inputId} feedbackId={feedbackId} className={containerClassName}>
        <div className="relative">
          {resolvedPrefix && (
            <span className="pointer-events-none absolute left-3 top-1/2 flex -translate-y-1/2 items-center text-sm text-wood-500">
              {resolvedPrefix}
            </span>
          )}
          <input
            {...props}
            ref={setRefs}
            id={inputId}
            required={required}
            type={resolvedType}
            inputMode={numericInputMode}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            value={isFormattedInput ? numericDisplay : props.value}
            onChange={handleChange}
            onFocus={handleFocus}
            className={cn(
              "w-full rounded-md border bg-cream-50 text-wood-900",
              "placeholder:text-text-muted",
              "transition-[background-color,border-color,box-shadow] duration-150 ease-out focus-visible:bg-surface-elevated",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wood-500",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              SIZE_STYLES[size],
              error ? "border-error" : "border-wood-200",
              resolvedPrefix && (typeof resolvedPrefix === "string" ? "pl-10" : "pl-9"),
              suffix && "pr-8",
              (isCurrency || isNumeric) && "num-mono",
              isCurrency && "text-right",
              "min-w-0",
              className
            )}
          />
          {suffix && (
            <span className="pointer-events-none absolute right-3 top-1/2 flex -translate-y-1/2 items-center text-sm text-wood-500">
              {suffix}
            </span>
          )}
        </div>
      </Field>
    );
  }
);
Input.displayName = "Input";
