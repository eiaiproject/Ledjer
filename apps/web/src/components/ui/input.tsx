import { forwardRef, useId, useRef, useState, type ChangeEvent, type FocusEvent, type InputHTMLAttributes, type ReactNode, type MutableRefObject } from "react";
import { Eye, EyeOff } from "reicon-react";
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
  showPasswordToggle?: boolean;
  containerClassName?: string;
  isCurrency?: boolean;
  isNumeric?: boolean;
  /** Allow fractional values (unit prices only) - displayed with id-ID comma
   *  decimals and a decimal keypad. Whole-money fields must NOT use this, so a
   *  stray decimal is never mistaken for a thousands separator. */
  allowDecimals?: boolean;
  size?: "sm" | "md" | "lg";
}

/** Explicit id wins; otherwise use React's unique id. Never derive from label
 *  text, because repeated labels (product rows, quick-entry preview) would
 *  create duplicate ids and labels that point at the wrong field. */
function resolveInputId(id: string | undefined, generatedId: string): string {
  return id ?? generatedId;
}

function resolveDescribedBy(error: string | undefined, helperText: string | undefined, feedbackId: string): string | undefined {
  if (error || helperText) return feedbackId;
  return undefined;
}

/** isCurrency ? "Rp" | prefix : prefix | leftIcon. */
function resolvePrefix(isCurrency: boolean, prefix: ReactNode, leftIcon: ReactNode): ReactNode {
  if (isCurrency) return prefix ?? "Rp";
  return prefix ?? leftIcon;
}

function resolveInputType(
  type: InputHTMLAttributes<HTMLInputElement>["type"],
  hasPasswordToggle: boolean,
  passwordVisible: boolean,
): InputHTMLAttributes<HTMLInputElement>["type"] {
  if (type === "number") return "text";
  if (hasPasswordToggle && passwordVisible) return "text";
  return type;
}

type InputModeValue = InputHTMLAttributes<HTMLInputElement>["inputMode"];

/** inputMode for numeric fields: decimal keypad for unit prices, numeric for
 *  formatted money, caller's inputMode (or decimal) for plain type="number". */
function resolveInputMode(opts: {
  isNumericInput: boolean;
  hasDecimals: boolean;
  isFormattedInput: boolean;
  inputMode?: InputModeValue;
}): InputModeValue | undefined {
  if (!opts.isNumericInput) return opts.inputMode;
  if (opts.hasDecimals) return "decimal";
  if (opts.isFormattedInput) return "numeric";
  return opts.inputMode ?? "decimal";
}

/** Formatted display value for currency/numeric inputs. */
function resolveNumericDisplay(value: unknown, isFormattedInput: boolean, hasDecimals: boolean): string | undefined {
  if (!isFormattedInput) return undefined;
  if (hasDecimals) return formatDecimalInput(value, true);
  return formatAmountInput(value as number, true);
}

/** Plain decimal field (type="number"): keep digits, a decimal point and an
 *  optional minus; drop everything else. */
function sanitizePlainDecimal(value: string): string {
  return value.replace(/[^\d.-]/g, "");
}

/** Unit-price input: keep digits + a single comma decimal separator (max 4
 *  fraction digits, matches parseUnitPrice). A dot in this field is always a thousands separator. */
function normalizeDecimalInput(value: string): { normalized: string; intPart: string; fracPart: string } {
  const body = value.replace(/[^\d,]/g, "");
  const commaIdx = body.lastIndexOf(",");
  const intPart = commaIdx >= 0 ? body.slice(0, commaIdx).replaceAll(",", "") : body.replaceAll(",", "");
  const fracPart = commaIdx >= 0 ? body.slice(commaIdx + 1).replace(/\D/g, "").slice(0, 4) : "";
  const normalized = intPart + (fracPart ? `,${fracPart}` : "");
  return { normalized, intPart, fracPart };
}

/** Whole-money input: digits + optional single leading minus. */
function normalizeWholeAmount(value: string): { normalized: string; negative: boolean; digits: string } {
  const negative = value.startsWith("-") || value.endsWith("-");
  const digits = value.replace(/\D/g, "");
  const sign = negative ? "-" : "";
  const normalized = digits ? sign + digits : sign;
  return { normalized, negative, digits };
}

function assignRef(
  ref: ((node: HTMLInputElement | null) => void) | MutableRefObject<HTMLInputElement | null> | null | undefined,
  node: HTMLInputElement | null,
  internalRef: MutableRefObject<HTMLInputElement | null>,
): void {
  internalRef.current = node;
  if (typeof ref === "function") {
    ref(node);
  } else if (ref) {
    ref.current = node;
  }
}

function InputTrailing({
  hasPasswordToggle,
  passwordVisible,
  label,
  suffix,
  onToggle,
}: Readonly<{
  hasPasswordToggle: boolean;
  passwordVisible: boolean;
  label?: string;
  suffix?: ReactNode;
  onToggle: () => void;
}>): ReactNode {
  if (hasPasswordToggle) {
    const action = passwordVisible ? "Sembunyikan" : "Tampilkan";
    const fieldName = label ? label.toLocaleLowerCase("id-ID") : "password";
    return (
      <button
        type="button"
        onClick={onToggle}
        aria-label={`${action} ${fieldName}`}
        aria-pressed={passwordVisible}
        className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-md text-wood-600 hover:bg-cream-100 hover:text-wood-800"
      >
        {passwordVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    );
  }
  if (suffix) {
    return (
      <span className="pointer-events-none absolute right-3 top-1/2 flex -translate-y-1/2 items-center text-sm text-wood-500">
        {suffix}
      </span>
    );
  }
  return null;
}

function buildInputClassName(opts: {
  size: "sm" | "md" | "lg";
  hasError: boolean;
  hasPrefix: boolean;
  prefixIsString: boolean;
  hasSuffix: boolean;
  hasPasswordToggle: boolean;
  isCurrency: boolean;
  isNumeric: boolean;
  className?: string;
}): string {
  let prefixClass: string | undefined;
  if (opts.hasPrefix) {
    prefixClass = opts.prefixIsString ? "pl-10" : "pl-9";
  }
  let rightPadding: string | undefined;
  if (opts.hasPasswordToggle) {
    rightPadding = "pr-12";
  } else if (opts.hasSuffix) {
    rightPadding = "pr-8";
  }
  return cn(
    "w-full rounded-md border bg-cream-50 text-wood-900",
    "placeholder:text-text-muted",
    "transition-[background-color,border-color,box-shadow] duration-150 ease-out focus-visible:bg-surface-elevated",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wood-500",
    "disabled:opacity-50 disabled:cursor-not-allowed",
    SIZE_STYLES[opts.size],
    opts.hasError ? "border-error" : "border-wood-400",
    prefixClass,
    rightPadding,
    opts.isCurrency || opts.isNumeric ? "num-mono" : undefined,
    opts.isCurrency ? "text-right" : undefined,
    "min-w-0",
    opts.className,
  );
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
      showPasswordToggle,
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
    const inputId = resolveInputId(id, generatedId);
    const feedbackId = `${inputId}-feedback`;
    const [passwordVisible, setPasswordVisible] = useState(false);
    const describedBy = resolveDescribedBy(error, helperText, feedbackId);
    const resolvedPrefix = resolvePrefix(Boolean(isCurrency), prefix, leftIcon);
    // Formatted numeric inputs (currency/qty-with-separators) strip non-digits
    // and show thousand separators. Plain type="number" inputs become text but
    // keep a numeric keypad (inputMode) and reject stray characters - same
    // scroll-increment/spinner reasons as the formatted path.
    const isFormattedInput = Boolean(isCurrency || isNumeric);
    const isNumericInput = Boolean(isFormattedInput || type === "number");
    // Unit prices (isCurrency + allowDecimals) get a decimal keypad; other
    // formatted money fields stay "numeric" so no decimal can be typed.
    const hasDecimals = Boolean(isCurrency && allowDecimals);
    const numericInputMode = resolveInputMode({ isNumericInput, hasDecimals, isFormattedInput, inputMode });
    // ponytail: number inputs use text+inputmode to prevent scroll increment
    // (native spinners are also removed globally in index.css)
    const hasPasswordToggle = Boolean(showPasswordToggle && type === "password");
    const resolvedType = resolveInputType(type, hasPasswordToggle, passwordVisible);
    const internalRef = useRef<HTMLInputElement | null>(null);
    const setRefs = (node: HTMLInputElement | null) => assignRef(ref, node, internalRef);

    // Currency/numeric inputs show a formatted display so thousands separators
    // appear WHILE typing, not just on blur. When a parent passes a value prop
    // the display is fully controlled and derived from it; when it does not
    // (react-hook-form register never passes value), the formatted string is
    // kept in local state so typing still works - otherwise the controlled
    // empty value would swallow every keystroke.
    const isControlledValue = props.value !== undefined;
    const [internalDisplay, setInternalDisplay] = useState("");
    const numericDisplay = isControlledValue
      ? resolveNumericDisplay(props.value, isFormattedInput, hasDecimals)
      : internalDisplay;

    const handleDecimalChange = (e: ChangeEvent<HTMLInputElement>) => {
      const { normalized, intPart, fracPart } = normalizeDecimalInput(e.target.value);
      if (e.target.value !== normalized) e.target.value = normalized;
      if (!isControlledValue) {
        setInternalDisplay(formatDecimalInput(Number(`${intPart || 0}.${fracPart || 0}`), true));
      }
      props.onChange?.(e);
      const el = internalRef.current;
      if (el) {
        const caretLen = formatDecimalInput(Number(`${intPart || 0}.${fracPart || 0}`), true).length;
        el.setSelectionRange(caretLen, caretLen);
      }
    };

    const handleWholeAmountChange = (e: ChangeEvent<HTMLInputElement>) => {
      // Normalize to digits + optional single leading minus. Separators are a
      // display concern only - parents receive a clean value they can parse.
      const { normalized, negative, digits } = normalizeWholeAmount(e.target.value);
      if (e.target.value !== normalized) e.target.value = normalized;
      if (!isControlledValue) {
        setInternalDisplay(formatAmountInput(Number(digits || 0), true));
      }
      props.onChange?.(e);
      // Keep the caret at the right end (cash-register feel: new digits are
      // appended at the right, aligned with the formatted display).
      const el = internalRef.current;
      if (el) {
        const caretLen = (negative ? 1 : 0) + formatAmountInput(Number(digits || 0), true).length;
        el.setSelectionRange(caretLen, caretLen);
      }
    };

    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
      if (!isNumericInput) {
        props.onChange?.(e);
        return;
      }

      if (!isFormattedInput) {
        // Plain decimal field (type="number"): keep digits, a decimal point and
        // an optional minus; drop everything else (no formatting).
        const cleaned = sanitizePlainDecimal(e.target.value);
        if (e.target.value !== cleaned) e.target.value = cleaned;
        props.onChange?.(e);
        return;
      }

      if (hasDecimals) {
        handleDecimalChange(e);
        return;
      }
      handleWholeAmountChange(e);
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
            aria-required={required || undefined}
            type={resolvedType}
            inputMode={numericInputMode}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            value={isFormattedInput ? numericDisplay : props.value}
            onChange={handleChange}
            onFocus={handleFocus}
            className={buildInputClassName({
              size,
              hasError: Boolean(error),
              hasPrefix: Boolean(resolvedPrefix),
              prefixIsString: typeof resolvedPrefix === "string",
              hasSuffix: Boolean(suffix),
              hasPasswordToggle,
              isCurrency: Boolean(isCurrency),
              isNumeric: Boolean(isNumeric),
              className,
            })}
          />
          <InputTrailing
            hasPasswordToggle={hasPasswordToggle}
            passwordVisible={passwordVisible}
            label={label}
            suffix={suffix}
            onToggle={() => setPasswordVisible((visible) => !visible)}
          />
        </div>
      </Field>
    );
  }
);
Input.displayName = "Input";
