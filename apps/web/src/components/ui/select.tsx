import { forwardRef, useId, type ReactNode, type SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import { Field } from "./field";
import { SIZE_STYLES } from "./size-styles";

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> {
  label?: string;
  error?: string;
  helperText?: string;
  options: { value: string; label: string; disabled?: boolean }[];
  placeholder?: string;
  size?: "sm" | "md" | "lg";
  leftIcon?: ReactNode;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, helperText, options, placeholder, size = "md", leftIcon, id, required, ...props }, ref) => {
    const generatedId = useId();
    const selectId = id || label?.toLowerCase().replace(/\s/g, "-") || generatedId;
    const feedbackId = `${selectId}-feedback`;
    const describedBy = error || helperText ? feedbackId : undefined;

    return (
      <Field label={label} error={error} helperText={helperText} required={required} htmlFor={selectId} feedbackId={feedbackId}>
        <div className="relative">
          {leftIcon && (
            <span className="pointer-events-none absolute left-3 top-1/2 flex -translate-y-1/2 items-center text-wood-400">
              {leftIcon}
            </span>
          )}
          <select
            ref={ref}
            id={selectId}
            required={required}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            className={cn(
              "w-full appearance-none rounded-md border bg-cream-50 pr-9 text-wood-900",
              "transition-[background-color,border-color,box-shadow] duration-150 ease-out focus-visible:bg-surface-elevated",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wood-500",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              SIZE_STYLES[size],
              error ? "border-error" : "border-wood-200",
              leftIcon && "pl-9",
              "min-w-0",
              className
            )}
            {...props}
          >
            {placeholder && (
              <option value="">{placeholder}</option>
            )}
            {options.map((opt) => (
              <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                {opt.label}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-wood-400" />
        </div>
      </Field>
    );
  }
);
Select.displayName = "Select";
