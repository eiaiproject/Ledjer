import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Field } from "./field";

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
  size?: "sm" | "md" | "lg";
}

const sizeStyles = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-3 text-sm",
  lg: "h-12 px-4 text-base",
};

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
      size = "md",
      id,
      required,
      inputMode,
      ...props
    },
    ref
  ) => {
    const inputId = id || label?.toLowerCase().replace(/\s/g, "-");
    const resolvedPrefix = isCurrency ? (prefix ?? "Rp") : (prefix ?? leftIcon);
    const numericInputMode = isCurrency || isNumeric ? "numeric" : inputMode;

    return (
      <Field label={label} error={error} helperText={helperText} required={required} htmlFor={inputId} className={containerClassName}>
        <div className="relative">
          {resolvedPrefix && (
            <span className="pointer-events-none absolute left-3 top-1/2 flex -translate-y-1/2 items-center text-sm text-wood-400">
              {resolvedPrefix}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            required={required}
            inputMode={numericInputMode}
            className={cn(
              "w-full rounded-md border bg-cream-50 text-wood-900",
              "placeholder:text-text-muted",
              "focus:outline-none focus:ring-2 focus:ring-wood-500 focus:border-wood-500",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              sizeStyles[size],
              error ? "border-error" : "border-wood-200",
              resolvedPrefix && (typeof resolvedPrefix === "string" ? "pl-10" : "pl-9"),
              suffix && "pr-8",
              (isCurrency || isNumeric) && "num-mono",
              isCurrency && "text-right",
              className
            )}
            {...props}
          />
          {suffix && (
            <span className="pointer-events-none absolute right-3 top-1/2 flex -translate-y-1/2 items-center text-sm text-wood-400">
              {suffix}
            </span>
          )}
        </div>
      </Field>
    );
  }
);
Input.displayName = "Input";
