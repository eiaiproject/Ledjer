import { type ComponentType, type ReactNode } from "react";
import { AlertTriangle, CheckCircle, InfoCircle, XCircle } from "reicon-react";
import { cn } from "@/lib/utils";

export type CalloutVariant = "info" | "success" | "warning" | "error";

const VARIANT_STYLES: Record<CalloutVariant, string> = {
  success: "bg-success-bg border-success-border text-success",
  error: "bg-error-bg border-error-border text-error",
  warning: "bg-warning-bg border-warning-border text-warning",
  info: "bg-info-bg border-info-border text-info",
};

const ICONS: Record<CalloutVariant, ComponentType<{ className?: string }>> = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: InfoCircle,
};

interface CalloutProps {
  /** Info/success/warning/error — maps to semantic token backgrounds. */
  readonly variant?: CalloutVariant;
  /** Optional bold title shown above the body. */
  readonly title?: string;
  /** Override the variant icon; pass `null` to hide the icon entirely. */
  readonly icon?: ReactNode;
  readonly className?: string;
  /** Screen-reader role; defaults to "alert" for error variant. */
  readonly role?: string;
  readonly children: ReactNode;
}

/**
 * Standard status callout box. Mirrors the toast recipe: semantic token
 * background/border/text plus a per-variant icon.
 */
export function Callout({ variant = "info", title, icon, className, role, children }: CalloutProps) {
  const Icon = ICONS[variant];
  return (
    <div
      role={role ?? (variant === "error" ? "alert" : undefined)}
      className={cn(
        "flex items-start gap-3 rounded-lg border px-4 py-3 text-sm",
        VARIANT_STYLES[variant],
        className
      )}
    >
      {icon !== null && (icon ?? <Icon className="mt-0.5 h-5 w-5 shrink-0" />)}
      <div className="min-w-0 flex-1">
        {title && <p className="font-medium">{title}</p>}
        <div className={title ? "mt-0.5" : undefined}>{children}</div>
      </div>
    </div>
  );
}
