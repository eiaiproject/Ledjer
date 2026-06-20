import { BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";

interface LogoProps {
  size?: "xs" | "sm" | "md" | "lg";
  variant?: "icon" | "full";
  tone?: "light" | "dark";
}

const markSizeStyles = {
  xs: "h-7 w-7 rounded-md",
  sm: "h-8 w-8 rounded-lg",
  md: "h-12 w-12 rounded-xl",
  lg: "h-20 w-20 rounded-2xl",
};

const iconSizeStyles = {
  xs: "text-sm font-bold",
  sm: "text-base font-bold",
  md: "h-6 w-6",
  lg: "h-10 w-10",
};

const gapStyles = {
  xs: "gap-2",
  sm: "gap-2",
  md: "gap-3",
  lg: "gap-4",
};

export function Logo({ size = "sm", variant = "full", tone = "dark" }: LogoProps) {
  const isLetterMark = size === "xs" || size === "sm";

  return (
    <div className={cn("inline-flex items-center", gapStyles[size])} aria-label="Ledjer">
      <div className={cn("flex shrink-0 items-center justify-center bg-leaf-500 text-cream-50", markSizeStyles[size])}>
        {isLetterMark ? (
          <span className={iconSizeStyles[size]}>L</span>
        ) : (
          <BookOpen className={iconSizeStyles[size]} />
        )}
      </div>
      {variant === "full" && (
        <span className={cn("font-serif text-2xl font-bold leading-none", tone === "light" ? "text-cream-50" : "text-wood-800")}>
          Ledjer
        </span>
      )}
    </div>
  );
}
