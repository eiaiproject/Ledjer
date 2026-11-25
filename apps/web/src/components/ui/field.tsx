import type { ReactNode } from "react";
import { CircleExclamationPoint } from "lucide-react";
import { cn } from "@/lib/utils";

interface FieldProps {
  readonly label?: string;
  readonly error?: string;
  readonly helperText?: string;
  readonly required?: boolean;
  readonly htmlFor?: string;
  readonly feedbackId?: string;
  readonly children: ReactNode;
  readonly className?: string;
}

export function Field({ label, error, helperText, required, htmlFor, feedbackId, children, className }: FieldProps) {
  return (
    <div className={cn("w-full min-w-0", className)}>
      {label && (
        <div className="mb-1 flex items-center gap-1">
          <label htmlFor={htmlFor} className="block text-sm font-medium text-text-secondary">
            {label}
          </label>
          {required && <span className="text-error" aria-hidden="true">*</span>}
        </div>
      )}
      {children}
      {error && (
        <p id={feedbackId} className="mt-1 flex items-start gap-1 break-words text-xs text-error" role="alert">
          <CircleExclamationPoint className="h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0">{error}</span>
        </p>
      )}
      {!error && helperText && (
        <p id={feedbackId} className="mt-1 break-words text-xs text-text-tertiary">{helperText}</p>
      )}
    </div>
  );
}
