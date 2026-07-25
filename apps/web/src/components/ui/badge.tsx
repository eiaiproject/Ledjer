import { cn } from "@/lib/utils";

type BadgeVariant = "success" | "warning" | "error" | "info" | "neutral" | "premium" | "secondary";
type BadgeSize = "sm" | "md" | "lg";

interface BadgeProps {
  readonly variant?: BadgeVariant;
  readonly size?: BadgeSize;
  readonly children: React.ReactNode;
  readonly className?: string;
  readonly dot?: boolean;
}

const variantStyles: Record<BadgeVariant, string> = {
  success: "bg-success-bg text-success border-success-border",
  warning: "bg-warning-bg text-warning border-warning-border",
  error: "bg-error-bg text-error border-error-border",
  info: "bg-info-bg text-info border-info-border",
  neutral: "bg-wood-100 text-wood-700 border-wood-200",
  premium: "bg-honey-50 text-honey-700 border-honey-200",
  secondary: "bg-cream-50 text-wood-600 border-wood-200",
};

const sizeStyles: Record<BadgeSize, string> = {
  sm: "px-2 py-0.5 text-xs",
  md: "px-2.5 py-1 text-xs",
  lg: "px-3 py-1.5 text-sm",
};

const dotStyles: Record<BadgeVariant, string> = {
  success: "bg-success",
  warning: "bg-warning",
  error: "bg-error",
  info: "bg-info",
  neutral: "bg-wood-400",
  premium: "bg-honey-500",
  secondary: "bg-wood-400",
};

export function Badge({ variant = "neutral", size = "sm", children, className, dot }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-medium",
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
    >
      {dot && (
        <span className={cn("h-1.5 w-1.5 rounded-full", dotStyles[variant])} />
      )}
      {children}
    </span>
  );
}
