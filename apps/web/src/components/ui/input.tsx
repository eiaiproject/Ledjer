import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";
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
    const numericInputMode = isCurrency || isNumeric ? "numeric" : inputMode;
    // ponytail: number inputs use text+inputmode to prevent scroll increment
    const resolvedType = type === "number" ? "text" : type;

    return (
      <Field label={label} error={error} helperText={helperText} required={required} htmlFor={inputId} feedbackId={feedbackId} className={containerClassName}>
        <div className="relative">
          {resolvedPrefix && (
            <span className="pointer-events-none absolute left-3 top-1/2 flex -translate-y-1/2 items-center text-sm text-wood-500">
              {resolvedPrefix}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            required={required}
            type={resolvedType}
            inputMode={numericInputMode}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            dir={isCurrency ? "rtl" : undefined}
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
            {...props}
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
