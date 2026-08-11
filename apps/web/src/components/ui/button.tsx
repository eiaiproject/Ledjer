import { type ElementType, type ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";
import { Spinner } from "./spinner";
import { SIZE_STYLES } from "./size-styles";

type ButtonVariant = "primary" | "secondary" | "success" | "danger" | "ghost" | "outline" | "link" | "destructive";
type ButtonSize = "xs" | "sm" | "md" | "lg" | "icon";

type AsProp<C extends ElementType> = { as?: C };
type ButtonBaseProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
};
type ButtonProps<C extends ElementType = "button"> = ButtonBaseProps &
  AsProp<C> &
  Omit<ComponentPropsWithoutRef<C>, keyof ButtonBaseProps>;

const variantStyles: Record<ButtonVariant, string> = {
  primary: "bg-wood-500 text-text-on-primary hover:bg-wood-600 active:bg-wood-700 shadow-sm",
  secondary: "bg-cream-50 text-wood-700 border border-wood-200 hover:bg-cream-100 active:bg-cream-200",
  success: "bg-leaf-500 text-text-on-success hover:bg-leaf-600 active:bg-leaf-700 shadow-sm",
  danger: "bg-error text-text-on-primary hover:opacity-90 active:opacity-80 shadow-sm",
  ghost: "text-wood-600 hover:bg-cream-100 active:bg-cream-200",
  outline: "border border-wood-300 text-wood-700 hover:bg-cream-100 active:bg-cream-200",
  link: "text-wood-600 underline-offset-4 hover:underline p-0 h-auto",
  destructive: "bg-error text-white hover:bg-error/90 active:bg-error/80 shadow-sm",
};


export function Button<C extends ElementType = "button">({
  as,
  className,
  variant = "primary",
  size = "md",
  loading,
  fullWidth,
  disabled,
  children,
  ...props
}: ButtonProps<C>) {
  const Component = as ?? "button";
  return (
    <Component
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "ledger-pressable inline-flex items-center justify-center font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wood-500",
        "disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-50",
        size === "xs" && "min-h-[44px] h-7 px-2.5 text-xs gap-1 rounded-md sm:h-7 sm:min-h-0",
        size === "icon" && "h-10 w-10 p-0 justify-center rounded-md min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0",
        size === "sm" && "gap-1.5 rounded-md",
        size === "md" && "gap-2 rounded-md",
        size === "lg" && "gap-2 rounded-lg",
        (size !== "xs" && size !== "icon") && SIZE_STYLES[size],
        variantStyles[variant],
        fullWidth && "w-full",
        className
      )}
      {...props}
    >
      {loading && <Spinner size="sm" className="text-current" />}
      {children}
    </Component>
  );
}
