import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

type CardVariant = "default" | "elevated" | "outline" | "filled";
type CardPadding = "none" | "sm" | "md" | "lg";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  variant?: CardVariant;
  padding?: CardPadding;
}

const variantStyles: Record<CardVariant, string> = {
  default: "bg-surface border border-wood-200",
  elevated: "bg-surface-elevated border border-wood-100 shadow-sm",
  outline: "bg-transparent border border-wood-200",
  filled: "bg-cream-100 border border-wood-100",
};

const paddingStyles: Record<CardPadding, string> = {
  none: "0",
  sm: "1rem",
  md: "1.25rem",
  lg: "1.5rem",
};

export function Card({ children, className, variant = "default", padding = "md" }: CardProps) {
  const style = { "--card-padding": paddingStyles[padding] } as CSSProperties;
  return (
    <div className={cn("rounded-lg min-w-0", variantStyles[variant], className)} style={style}>
      {children}
    </div>
  );
}

export function CardHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("border-b border-wood-100 p-[var(--card-padding)]", className)}>
      {children}
    </div>
  );
}

export function CardContent({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("p-[var(--card-padding)]", className)}>
      {children}
    </div>
  );
}

