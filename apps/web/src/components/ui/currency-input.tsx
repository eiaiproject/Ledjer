import { forwardRef } from "react";
import { cn } from "@/lib/utils";
import { formatAmountInput, parseAmountInput } from "@/lib/utils";

export interface CurrencyInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange"> {
  value: number | undefined | null;
  onValueChange: (value: number) => void;
  blankWhenZero?: boolean;
  showPrefix?: boolean;
  error?: boolean;
  label?: string;
}

/**
 * CurrencyInput - Input for Indonesian Rupiah amounts with thousand separators.
 *
 * Features:
 * - Displays thousand separators (1.000.000) while typing
 * - Stores value as number in state
 * - Optional "Rp" prefix (visual only)
 * - Uses formatAmountInput/parseAmountInput helpers
 */
export const CurrencyInput = forwardRef<HTMLInputElement, CurrencyInputProps>(
  (
    {
      value,
      onValueChange,
      blankWhenZero = false,
      showPrefix = true,
      error,
      label,
      className,
      disabled,
      readOnly,
      placeholder = "0",
      id,
      "aria-label": ariaLabel,
      "aria-describedby": ariaDescribedBy,
      "aria-invalid": ariaInvalid,
      ...props
    },
    ref
  ) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const parsed = parseAmountInput(e.target.value, 0);
      onValueChange(parsed ?? 0);
    };

    const displayValue = formatAmountInput(value, blankWhenZero);

    return (
      <div>
        {label && (
          <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-text-secondary">
            {label}
          </label>
        )}
        <div className="relative">
          {showPrefix && (
            <span className="pointer-events-none absolute left-3 top-1/2 flex -translate-y-1/2 items-center text-sm text-wood-400">
              Rp
            </span>
          )}
          <input
            ref={ref}
            id={id}
            type="text"
            inputMode="numeric"
            value={displayValue}
            onChange={handleChange}
            placeholder={placeholder}
            disabled={disabled}
            readOnly={readOnly}
            aria-label={ariaLabel}
            aria-describedby={ariaDescribedBy}
            aria-invalid={ariaInvalid}
            className={cn(
              "min-h-[44px] h-10 w-full rounded-md border bg-surface text-sm num-mono focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wood-500 sm:min-h-0",
              showPrefix ? "pl-10" : "pl-3",
              "pr-3 text-right",
              error ? "border-error" : "border-wood-200",
              disabled && "bg-cream-100 text-text-tertiary",
              readOnly && "bg-cream-100 text-text-tertiary",
              className
            )}
            {...props}
          />
        </div>
      </div>
    );
  }
);

CurrencyInput.displayName = "CurrencyInput";
