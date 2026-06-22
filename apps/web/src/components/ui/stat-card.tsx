import { cn, formatIDR } from "@/lib/utils";
import { TrendingDown, TrendingUp, type LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: number | string;
  icon: LucideIcon;
  tone?: "wood" | "leaf" | "clay" | "sky" | "honey";
  trend?: {
    value: number;
    isPositive: boolean;
    label?: string;
  };
  format?: "currency" | "number" | "text";
  color?: "green" | "wood" | "clay" | "sky" | "honey";
  className?: string;
}

const colorStyles = {
  leaf: { bg: "bg-leaf-100", icon: "text-leaf-600", border: "border-leaf-200" },
  wood: { bg: "bg-wood-100", icon: "text-wood-600", border: "border-wood-200" },
  clay: { bg: "bg-clay-100", icon: "text-clay-600", border: "border-clay-200" },
  sky: { bg: "bg-sky-100", icon: "text-sky-600", border: "border-sky-200" },
  honey: { bg: "bg-honey-100", icon: "text-honey-600", border: "border-honey-200" },
};

function formatValue(value: number | string, format: StatCardProps["format"]) {
  if (format === "text") return String(value);
  if (format === "number") return typeof value === "number" ? new Intl.NumberFormat("id-ID").format(value) : value;
  return typeof value === "number" ? formatIDR(value) : value;
}

export function StatCard({ label, value, icon: Icon, trend, tone, color, format = "currency", className }: StatCardProps) {
  const resolvedTone = tone ?? (color === "green" ? "leaf" : color) ?? "wood";
  const colors = colorStyles[resolvedTone];
  const TrendIcon = trend?.isPositive ? TrendingUp : TrendingDown;

  return (
    <div className={cn("h-full min-h-[112px] rounded-xl border bg-surface-elevated p-5 transition-[border-color,box-shadow] duration-200 ease-out", colors.border, className)}>
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm text-text-secondary">{label}</p>
          <div className="mt-1.5">
            <span className={cn("inline-flex max-w-full items-baseline whitespace-nowrap leading-none tracking-tight text-text-primary", format === "text" ? "font-sans text-xl font-bold sm:text-2xl" : "num-mono text-[clamp(1.25rem,1.6vw,1.5rem)] font-bold tabular-nums sm:text-2xl")}>
              {formatValue(value, format)}
            </span>
          </div>
        </div>
        <div className={cn("ml-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", colors.bg)}>
          <Icon className={cn("h-5 w-5", colors.icon)} />
        </div>
      </div>
      {trend && (
        <div className="mt-3 flex min-w-0 flex-wrap items-center gap-1 text-xs">
          <span className={cn(
            "inline-flex items-center gap-1 font-medium",
            trend.isPositive ? "text-success" : "text-error"
          )}>
            <TrendIcon className="h-3.5 w-3.5" />
            {Math.abs(trend.value)}%
          </span>
          <span className="min-w-0 break-words text-text-tertiary">{trend.label ?? "vs bulan lalu"}</span>
        </div>
      )}
    </div>
  );
}
