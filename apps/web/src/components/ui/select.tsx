import { forwardRef, type ReactNode, type SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import { Field } from "./field";

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> {
  label?: string;
  error?: string;
  helperText?: string;
  options: { value: string; label: string; disabled?: boolean }[];
  placeholder?: string;
  size?: "sm" | "md" | "lg";
  leftIcon?: ReactNode;
}

const sizeStyles = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-3 text-sm",
  lg: "h-12 px-4 text-base",
};

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, helperText, options, placeholder, size = "md", leftIcon, id, required, ...props }, ref) => {
    const selectId = id || label?.toLowerCase().replace(/\s/g, "-");

    return (
      <Field label={label} error={error} helperText={helperText} required={required} htmlFor={selectId}>
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
            className={cn(
              "w-full appearance-none rounded-md border bg-cream-50 pr-9 text-wood-900",
              "focus:outline-none focus:ring-2 focus:ring-wood-500 focus:border-wood-500",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              sizeStyles[size],
              error ? "border-error" : "border-wood-200",
              leftIcon && "pl-9",
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
