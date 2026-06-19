import { cn } from "@/lib/utils";

type BadgeVariant = "success" | "warning" | "error" | "info" | "neutral";

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
  dot?: boolean;
}

const variantStyles: Record<BadgeVariant, string> = {
  success: "bg-leaf-100 text-leaf-700 border-leaf-200",
  warning: "bg-clay-400/10 text-clay-600 border-clay-400/30",
  error: "bg-error/10 text-error border-error/30",
  info: "bg-sky-500/10 text-sky-600 border-sky-400/30",
  neutral: "bg-wood-100 text-wood-700 border-wood-200",
};

export function Badge({ variant = "neutral", children, className, dot }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        variantStyles[variant],
        className
      )}
    >
      {dot && (
        <span className={cn(
          "h-1.5 w-1.5 rounded-full",
          variant === "success" && "bg-leaf-500",
          variant === "warning" && "bg-clay-500",
          variant === "error" && "bg-error",
          variant === "info" && "bg-sky-500",
          variant === "neutral" && "bg-wood-400",
        )} />
      )}
      {children}
    </span>
  );
}
