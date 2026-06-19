import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  prefix?: string;
  suffix?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, helperText, prefix, suffix, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s/g, "-");

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={inputId} className="block text-sm font-medium text-wood-700 mb-1">
            {label}
          </label>
        )}
        <div className="relative">
          {prefix && (
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-wood-400">
              {prefix}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            className={cn(
              "w-full rounded-md border bg-cream-50 px-3 py-2 text-sm text-wood-900",
              "placeholder:text-wood-400",
              "focus:outline-none focus:ring-2 focus:ring-wood-500 focus:border-wood-500",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              error ? "border-error" : "border-wood-200",
              prefix && "pl-8",
              suffix && "pr-8",
              className
            )}
            {...props}
          />
          {suffix && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-wood-400">
              {suffix}
            </span>
          )}
        </div>
        {error && <p className="mt-1 text-xs text-error">{error}</p>}
        {helperText && !error && <p className="mt-1 text-xs text-wood-400">{helperText}</p>}
      </div>
    );
  }
);
Input.displayName = "Input";
