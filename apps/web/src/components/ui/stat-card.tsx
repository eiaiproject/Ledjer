import { cn, formatIDR } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: number;
  icon: LucideIcon;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  color?: "green" | "wood" | "clay" | "sky" | "honey";
  className?: string;
}

const colorStyles = {
  green: { bg: "bg-leaf-100", icon: "text-leaf-600" },
  wood: { bg: "bg-wood-100", icon: "text-wood-600" },
  clay: { bg: "bg-clay-400/10", icon: "text-clay-600" },
  sky: { bg: "bg-sky-500/10", icon: "text-sky-600" },
  honey: { bg: "bg-honey-400/10", icon: "text-honey-600" },
};

export function StatCard({ label, value, icon: Icon, trend, color = "wood", className }: StatCardProps) {
  const colors = colorStyles[color];

  return (
    <div className={cn("bg-cream-50 border border-wood-200 rounded-xl p-5 h-full", className)}>
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-wood-500 truncate">{label}</p>
          <p className="mt-1.5 text-2xl font-bold text-wood-900 tabular-nums">
            {formatIDR(value)}
          </p>
        </div>
        <div className={cn("ml-3 shrink-0 p-2.5 rounded-xl", colors.bg)}>
          <Icon className={cn("h-5 w-5", colors.icon)} />
        </div>
      </div>
      {trend && (
        <div className="mt-3 flex items-center gap-1 text-xs">
          <span className={cn(
            "font-medium",
            trend.isPositive ? "text-leaf-600" : "text-error"
          )}>
            {trend.isPositive ? "↑" : "↓"} {Math.abs(trend.value)}%
          </span>
          <span className="text-wood-400">vs bulan lalu</span>
        </div>
      )}
    </div>
  );
}
