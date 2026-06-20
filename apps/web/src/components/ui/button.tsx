import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { Spinner } from "./spinner";

type ButtonVariant = "primary" | "secondary" | "success" | "danger" | "ghost" | "outline" | "link";
type ButtonSize = "xs" | "sm" | "md" | "lg" | "icon";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: "bg-wood-500 text-text-on-primary hover:bg-wood-600 active:bg-wood-700 shadow-sm",
  secondary: "bg-cream-50 text-wood-700 border border-wood-200 hover:bg-cream-100 active:bg-cream-200",
  success: "bg-leaf-500 text-text-on-success hover:bg-leaf-600 active:bg-leaf-700 shadow-sm",
  danger: "bg-error text-text-on-primary hover:opacity-90 active:opacity-80 shadow-sm",
  ghost: "text-wood-600 hover:bg-cream-100 active:bg-cream-200",
  outline: "border border-wood-300 text-wood-700 hover:bg-cream-100 active:bg-cream-200",
  link: "text-wood-600 underline-offset-4 hover:underline p-0 h-auto",
};

const sizeStyles: Record<ButtonSize, string> = {
  xs: "h-7 px-2.5 text-xs gap-1 rounded-md",
  sm: "h-8 px-3 text-sm gap-1.5 rounded-md",
  md: "h-10 px-4 text-sm gap-2 rounded-md",
  lg: "h-12 px-6 text-base gap-2 rounded-lg",
  icon: "h-10 w-10 p-0 justify-center rounded-md min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", loading, fullWidth, disabled, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        className={cn(
          "inline-flex items-center justify-center font-medium transition-colors",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wood-500",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          sizeStyles[size],
          variantStyles[variant],
          fullWidth && "w-full",
          className
        )}
        {...props}
      >
        {loading && <Spinner size="sm" className="text-current" />}
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";
