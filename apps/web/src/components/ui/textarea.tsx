import { forwardRef, type CSSProperties, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { Field } from "./field";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  helperText?: string;
  error?: string;
  containerClassName?: string;
  size?: "sm" | "md" | "lg";
}

const sizeStyles = {
  sm: "px-3 py-2 text-sm",
  md: "px-3 py-2.5 text-sm",
  lg: "px-4 py-3 text-base",
};

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, containerClassName, label, helperText, error, id, required, rows = 3, size = "md", onInput, style, ...props }, ref) => {
    const textareaId = id || label?.toLowerCase().replace(/\s/g, "-");

    return (
      <Field label={label} error={error} helperText={helperText} required={required} htmlFor={textareaId} className={containerClassName}>
        <textarea
          ref={ref}
          id={textareaId}
          required={required}
          rows={rows}
          onInput={(event) => {
            const target = event.currentTarget;
            target.style.height = "auto";
            target.style.height = `${target.scrollHeight}px`;
            onInput?.(event);
          }}
          style={{ ...style, fieldSizing: "content" } as CSSProperties}
          className={cn(
            "w-full resize-y rounded-md border bg-cream-50 text-wood-900",
            "placeholder:text-text-muted",
            "focus:outline-none focus:ring-2 focus:ring-wood-500 focus:border-wood-500",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            error ? "border-error" : "border-wood-200",
            sizeStyles[size],
            className
          )}
          {...props}
        />
      </Field>
    );
  }
);
Textarea.displayName = "Textarea";
