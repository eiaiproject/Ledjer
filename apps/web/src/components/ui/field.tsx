import type { ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface FieldProps {
  label?: string;
  error?: string;
  helperText?: string;
  required?: boolean;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}

export function Field({ label, error, helperText, required, htmlFor, children, className }: FieldProps) {
  return (
    <div className={cn("w-full", className)}>
      {label && (
        <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium text-text-secondary">
          {label}
          {required && <span className="ml-1 text-error">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="mt-1 flex items-center gap-1 text-xs text-error">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      ) : helperText ? (
        <p className="mt-1 text-xs text-text-tertiary">{helperText}</p>
      ) : null}
    </div>
  );
}
