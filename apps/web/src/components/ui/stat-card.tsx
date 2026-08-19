import { type ComponentType } from "react";
import { cn, formatIDR } from "@/lib/utils";
import { Link } from "react-router-dom";
import { ChevronRight } from "reicon-react";

interface StatCardProps {
  label: string;
  /** null | undefined = loading skeleton, 'error' = unavailable */
  value: number | string | null | undefined;
  icon: ComponentType<{ className?: string }>;
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

// Hero card fills sit one step darker than the default tones so the cream
// text (label + bold value) clears WCAG AA (4.5:1) at the mobile clamp floor
// of 16px. leaf/wood/clay/sky-600 and honey-700 (honey-600 alone is 4.41:1).
const heroStyles = {
  leaf: "bg-leaf-600",
  wood: "bg-wood-600",
  clay: "bg-clay-600",
  sky: "bg-sky-600",
  honey: "bg-honey-700",
};

function formatValue(value: number | string | null | undefined, format: StatCardProps["format"]) {
  if (value === null || value === undefined) return null;
  if (format === "text") return String(value);
  if (format === "number") return typeof value === "number" ? new Intl.NumberFormat("id-ID").format(value) : value;
  return typeof value === "number" ? formatIDR(value) : value;
}

/** Size tiers for the currency value: hero cards keep the big size on mobile,
 * compact 2-col cards shrink long values so the whole number stays on one
 * line instead of breaking mid-digit. */
function currencySizeClass(hero: boolean, length: number): string {
  if (hero) return "text-[clamp(1rem,3.5vw,1.5rem)] sm:text-2xl";
  if (length <= 12) return "text-[clamp(0.9375rem,4vw,1.5rem)] sm:text-2xl";
  if (length <= 15) return "text-[clamp(0.8125rem,3.5vw,1.25rem)] sm:text-xl";
  return "text-[clamp(0.75rem,3vw,1.125rem)] sm:text-lg";
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

  const statusText = (() => {
    if (isLoading) return "sedang dimuat";
    if (isError) return "data belum tersedia";
    return null;
  })();
  const accessibleLabel = [label, ariaDescription, displayValue, statusText].filter(Boolean).join(", ");

  const valueContent = (() => {
    if (isLoading) return <div className="h-6 w-32 animate-pulse rounded bg-white/15" />;
    // opacity-85 keeps the 12-14px edge-state text above WCAG AA (4.5:1) on
    // both white cards and the darker hero fills
    if (isError) return <span className="text-sm italic text-current opacity-85">Data belum tersedia</span>;
    // Length-aware size tiers for compact 2-col cards: long currency values
    // shrink so the whole number stays on one line instead of breaking
    // mid-digit (hero cards are full-width on mobile and keep the big size).
    const len = (displayValue ?? "").length;
    const currencySize = currencySizeClass(hero, len);
    // formatIDR joins "Rp" and the digits with a non-breaking space; a regular
    // space lets the prefix wrap onto its own line when tight, so digits never
    // break mid-number (currency only — text values keep their spacing intact).
    const displayText = isCurrency ? displayValue?.replaceAll("\u00A0", " ") : displayValue;
    return (
      <span
        className={cn(
          "inline-flex max-w-full items-baseline leading-none tracking-tight break-words",
          isCurrency ? cn("num-mono font-bold tabular-nums", currencySize) : "font-sans text-xl font-bold sm:text-2xl",
          hero ? "" : "text-text-primary",
        )}
      >
        {displayText}
      </span>
    );
  })();

  const inner = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className={cn("min-w-0 break-words text-sm", hero ? "" : "text-text-secondary")}>{label}</p>
        <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", hero ? "bg-white/15" : colors.bg)}>
          <Icon className={cn("h-5 w-5", hero ? "" : colors.icon)} />
        </div>
      </div>
      <div className="mt-1.5">
        {valueContent}
      </div>
      {isZero && zeroLabel && !isLoading && !isError && (
        <p className="mt-1 text-xs text-current opacity-85">{zeroLabel}</p>
      )}
      {href && (
        <ChevronRight
          className={cn(
            "mt-3 h-4 w-4 shrink-0 text-right transition-transform duration-200 group-hover:translate-x-0.5",
            hero ? "opacity-80" : "text-wood-500",
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

  const loadingAttrs = isLoading ? { role: "status" as const, "aria-live": "polite" as const } : {};

  if (href) {
    return (
      <Link to={href} className={base} aria-label={accessibleLabel} style={heroStyle} {...loadingAttrs}>
        {inner}
      </Link>
    );
  }

  return (
    <section className={base} aria-label={accessibleLabel} style={heroStyle} {...loadingAttrs}>
      {inner}
    </section>
  );
}
