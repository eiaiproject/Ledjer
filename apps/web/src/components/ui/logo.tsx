import { cn } from "@/lib/utils";

interface LogoProps {
  size?: "xs" | "sm" | "md" | "lg";
  variant?: "icon" | "full";
  color?: "dark" | "white";
  className?: string;
}

const iconSizeStyles = {
  xs: "h-4 w-4",
  sm: "h-5 w-5",
  md: "h-6 w-6",
  lg: "h-10 w-10",
};

const horizontalSizeStyles = {
  xs: "h-4",
  sm: "h-5",
  md: "h-6",
  lg: "h-10",
};

export function Logo({ size = "sm", variant = "full", color = "dark", className }: LogoProps) {
  if (variant === "full") {
    return (
      <img
        src={color === "white" ? "/logo-horizontal-white.svg" : "/logo-horizontal.svg"}
        alt="Ledjer"
        className={cn("w-auto", horizontalSizeStyles[size], className)}
      />
    );
  }

  return <img src="/logo-icon.svg" alt="Ledjer icon" className={cn(iconSizeStyles[size], className)} />;
}
