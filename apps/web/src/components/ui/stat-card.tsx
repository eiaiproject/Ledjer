import { cn, formatIDR } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";

interface StatCardProps {
  label: string;
  /** null | undefined = loading skeleton, 'error' = unavailable */
  value: number | string | null | undefined;
  icon: LucideIcon;
  tone?: "wood" | "leaf" | "clay" | "sky" | "honey";
  format?: "currency" | "number" | "text";
  className?: string;
  /** When set, the whole card becomes a link with a chevron + tap feedback. */
  href?: string;
  /** Filled, high-emphasis treatment for primary metrics (Saldo, Laba/Rugi). */
  hero?: boolean;
  /** Explicit zero label — shown when value is 0. */
  zeroLabel?: string;
  /** Accessible description appended to the accessible name. */
  ariaDescription?: string;
}

const colorStyles = {
  leaf: { bg: "bg-leaf-100", icon: "text-leaf-600", border: "border-leaf-200" },
  wood: { bg: "bg-wood-100", icon: "text-wood-600", border: "border-wood-200" },
  clay: { bg: "bg-clay-100", icon: "text-clay-600", border: "border-clay-200" },
  sky: { bg: "bg-sky-100", icon: "text-sky-600", border: "border-sky-200" },
  honey: { bg: "bg-honey-100", icon: "text-honey-600", border: "border-honey-200" },
};

const heroStyles = {
  leaf: "bg-leaf-500",
  wood: "bg-wood-500",
  clay: "bg-clay-500",
  sky: "bg-sky-500",
  honey: "bg-honey-500",
};

function formatValue(value: number | string | null | undefined, format: StatCardProps["format"]) {
  if (value === null || value === undefined) return null;
  if (format === "text") return String(value);
  if (format === "number") return typeof value === "number" ? new Intl.NumberFormat("id-ID").format(value) : value;
  return typeof value === "number" ? formatIDR(value) : value;
}


export function StatCard({
  label,
  value,
  icon: Icon,
  tone = "wood",
  format = "currency",
  className,
  href,
  hero = false,
  zeroLabel,
  ariaDescription,
}: Readonly<StatCardProps>) {
  const colors = colorStyles[tone];
  const isCurrency = format !== "text";
  const isLoading = value === null || value === undefined;
  const isError = value === "error";
  const displayValue = isError ? null : formatValue(value, format);
  const isZero = typeof value === "number" && value === 0;

  const accessibleLabel = [
    label,
    ariaDescription,
    isLoading ? "sedang dimuat" : isError ? "data belum tersedia" : null,
  ].filter(Boolean).join(", ");

  const inner = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className={cn("break-words text-sm", hero ? "opacity-85" : "text-text-secondary")}>{label}</p>
          <div className="mt-1.5">
            {isLoading ? (
              <div className="h-6 w-32 animate-pulse rounded bg-white/15" />
            ) : isError ? (
              <span className="text-sm italic text-current opacity-70">Data belum tersedia</span>
            ) : (
              <span
                className={cn(
                  "inline-flex max-w-full items-baseline leading-none tracking-tight break-all",
                  isCurrency ? "num-mono text-[clamp(1rem,3.5vw,1.5rem)] font-bold tabular-nums sm:text-2xl" : "font-sans text-xl font-bold sm:text-2xl",
                  hero ? "" : "text-text-primary",
                )}
              >
                {displayValue}
              </span>
            )}
          </div>
          {isZero && zeroLabel && !isLoading && !isError && (
            <p className="mt-1 text-xs text-current opacity-60">{zeroLabel}</p>
          )}
        </div>
        <div className={cn("ml-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", hero ? "bg-white/15" : colors.bg)}>
          <Icon className={cn("h-5 w-5", hero ? "" : colors.icon)} />
        </div>
      </div>
      {href && (
        <ChevronRight
          className={cn(
            "mt-3 h-4 w-4 shrink-0 text-right transition-transform duration-200 group-hover:translate-x-0.5",
            hero ? "opacity-80" : "text-wood-400",
          )}
          aria-hidden="true"
        />
      )}
    </>
  );

  const base = cn(
    "relative block h-full min-h-[104px] rounded-xl border p-3 sm:p-4 transition-[border-color,box-shadow,transform] duration-200 ease-out sm:min-h-[112px]",
    hero ? heroStyles[tone] : cn("bg-surface-elevated", colors.border),
    href && "group cursor-pointer hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wood-500 active:scale-[0.98]",
    className,
  );

  // ponytail: twMerge strips text-text-on-primary from heroStyles;
  // apply via style to bypass the merge. Upgrade: fix twMerge config.
  const heroStyle: React.CSSProperties | undefined = hero ? { color: "var(--color-text-on-primary)" } : undefined;

  if (href) {
    return (
      <Link to={href} className={base} aria-label={accessibleLabel} style={heroStyle}>
        {inner}
      </Link>
    );
  }

  return (
    <div className={base} role="group" aria-label={accessibleLabel} style={heroStyle}>
      {inner}
    </div>
  );
}
