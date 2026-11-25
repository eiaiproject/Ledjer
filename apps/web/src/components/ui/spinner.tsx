import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface SpinnerProps {
  readonly size?: "sm" | "md" | "lg";
  readonly className?: string;
}

const sizeStyles = {
  sm: "h-4 w-4",
  md: "h-6 w-6",
  lg: "h-8 w-8",
};

export function Spinner({ size = "md", className }: SpinnerProps) {
  return (
    <LoaderCircle
      className={cn("text-wood-500 motion-safe:animate-spin", sizeStyles[size], className)}
      aria-hidden="true"
    />
  );
}

export function PageSpinner() {
  return (
    <output aria-live="polite" className="flex items-center justify-center gap-3 py-12">
      <Spinner size="lg" />
      <span className="sr-only">Memuat data</span>
    </output>
  );
}
