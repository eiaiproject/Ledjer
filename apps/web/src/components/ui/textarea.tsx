import { forwardRef, useId, type CSSProperties, type TextareaHTMLAttributes } from "react";
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
    const generatedId = useId();
    const textareaId = id || label?.toLowerCase().replace(/\s/g, "-") || generatedId;
    const feedbackId = `${textareaId}-feedback`;
    const describedBy = error || helperText ? feedbackId : undefined;

    return (
      <Field label={label} error={error} helperText={helperText} required={required} htmlFor={textareaId} feedbackId={feedbackId} className={containerClassName}>
        <textarea
          ref={ref}
          id={textareaId}
          required={required}
          rows={rows}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
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
            "transition-[background-color,border-color,box-shadow] duration-150 ease-out focus-visible:bg-surface-elevated",
            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wood-500",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            error ? "border-error" : "border-wood-200",
            "min-w-0",
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
