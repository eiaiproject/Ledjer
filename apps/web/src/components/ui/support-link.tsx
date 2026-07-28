import { type AnchorHTMLAttributes, useCallback } from "react";
import { cn, SUPPORT_URL } from "@/lib/utils";
import { trackSupportClick } from "@/lib/analytics";

type SupportPlacement = "landing" | "footer" | "app_menu" | "value_moment";

interface SupportLinkProps
  extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "target" | "rel" | "children"> {
  /** Visual variant */
  variant?: "primary" | "secondary" | "outline" | "ghost" | "link";
  /** Placement identifier for analytics */
  placement?: SupportPlacement;
  /** Label teks — default berbeda per placement */
  label?: string;
  /** Sembunyikan ikon external-link */
  hideIcon?: boolean;
  /** Kelas tambahan */
  className?: string;
}

const DEFAULT_LABELS: Record<SupportPlacement, string> = {
  landing: "Dukung Ledjer di Trakteer",
  footer: "Dukung pengembangan Ledjer",
  app_menu: "Traktir pengembang",
  value_moment: "Dukung Ledjer",
};

const VARIANT_CLASSES: Record<string, string> = {
  primary:
    "bg-wood-500 text-text-on-primary hover:bg-wood-600 active:bg-wood-700 shadow-sm",
  secondary:
    "bg-cream-50 text-wood-700 border border-wood-200 hover:bg-cream-100 active:bg-cream-200",
  outline:
    "border border-wood-300 text-wood-700 hover:bg-cream-100 active:bg-cream-200",
  ghost:
    "text-wood-600 hover:bg-cream-100 active:bg-cream-200",
  link:
    "text-wood-600 underline-offset-4 hover:underline p-0 h-auto inline-flex items-center",
};

/**
 * External link ke Trakteer dengan keamanan dan aksesibilitas bawaan.
 *
 * - href selalu SUPPORT_URL
 * - target="_blank" + rel="noopener noreferrer"
 * - Accessible label yang menjelaskan bahwa link dibuka di tab baru
 * - Indikator ikon external-link (opsional)
 * - placement identifier untuk analytics
 * - focus-visible state
 */
export function SupportLink({
  variant = "link",
  placement = "footer",
  label,
  hideIcon = false,
  className,
  ...props
}: SupportLinkProps) {
  const displayLabel = label ?? DEFAULT_LABELS[placement];
  const accessibleLabel = `${displayLabel} — terbuka di tab baru`;

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      // Fire-and-forget analytics — tidak menghalangi navigasi
      trackSupportClick(placement);
      // Props onClick jika ada dari parent
      props.onClick?.(e);
    },
    [placement, props.onClick],
  );

  return (
    <a
      href={SUPPORT_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={accessibleLabel}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg font-medium transition-[background-color,border-color,color,box-shadow] duration-150 ease-out",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wood-500",
        VARIANT_CLASSES[variant],
        className,
      )}
      data-placement={placement}
      {...props}
      onClick={handleClick}
    >
      {displayLabel}
      {!hideIcon && (
        <svg className="h-3.5 w-3.5 shrink-0" aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 9v3a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h3" />
          <path d="M9 1h6v6" />
          <path d="M15 1 7 9" />
        </svg>
      )}
    </a>
  );
}
