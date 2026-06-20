import { createContext, useContext } from "react";
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
  none: "",
  sm: "p-4",
  md: "p-5",
  lg: "p-6",
};

const CardPaddingContext = createContext<CardPadding>("md");

export function Card({ children, className, variant = "default", padding = "md" }: CardProps) {
  return (
    <CardPaddingContext.Provider value={padding}>
      <div className={cn("rounded-lg", variantStyles[variant], className)}>
        {children}
      </div>
    </CardPaddingContext.Provider>
  );
}

export function CardHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  const padding = useContext(CardPaddingContext);
  return (
    <div className={cn(paddingStyles[padding], "border-b border-wood-100", className)}>
      {children}
    </div>
  );
}

export function CardContent({ children, className }: { children: React.ReactNode; className?: string }) {
  const padding = useContext(CardPaddingContext);
  return (
    <div className={cn(paddingStyles[padding], className)}>
      {children}
    </div>
  );
}

export function CardFooter({ children, className }: { children: React.ReactNode; className?: string }) {
  const padding = useContext(CardPaddingContext);
  return (
    <div className={cn(paddingStyles[padding], "border-t border-wood-100", className)}>
      {children}
    </div>
  );
}
