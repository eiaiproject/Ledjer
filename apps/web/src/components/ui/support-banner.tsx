import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { SupportLink } from "@/components/ui/support-link";
import { X } from "reicon-react";
import { isBannerDismissed, persistDismissal } from "./support-banner-utils";

/* ───── Props ───── */

interface SupportBannerProps {
  /** Tambahan class CSS */
  className?: string;
  /** Jika true, cooldown diabaikan (dipaksa tampil) */
  forceShow?: boolean;
  /** Callback saat banner ditutup */
  onDismiss?: () => void;
  /** Callback saat CTA diklik */
  onSupportClick?: () => void;
}

/**
 * Value-moment banner untuk dukungan Trakteer.
 *
 * - Non-intrusif, dapat ditutup dengan tombol atau keyboard (Esc).
 * - Menyimpan dismiss state di localStorage dengan cooldown 7 hari.
 * - Tidak muncul jika sudah ditutup dalam 7 hari.
 * - Tidak menggunakan blocking modal.
 * - Aksesibilitas: role="status", aria-live="polite", tombol close memiliki label.
 */
export function SupportBanner({
  className,
  forceShow = false,
  onDismiss,
  onSupportClick,
}: SupportBannerProps) {
  const [userDismissed, setUserDismissed] = useState(() => isBannerDismissed());

  // Derive dismissed state: forceShow overrides user dismissal
  const dismissed = !forceShow && userDismissed;

  const handleDismiss = useCallback(() => {
    setUserDismissed(true);
    persistDismissal();
    onDismiss?.();
  }, [onDismiss]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        handleDismiss();
      }
    },
    [handleDismiss]
  );

  if (dismissed) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      onKeyDown={handleKeyDown}
      className={cn(
        "relative overflow-hidden rounded-xl border border-honey-200 bg-honey-50 p-4 pr-10 shadow-sm",
        "animate-[ledger-page-in_300ms_var(--ease-out)]",
        "motion-reduce:animate-none",
        "@container",
        className,
      )}
    >
      {/* Decorative accent */}
      <div
        className="absolute left-0 top-0 h-full w-1 rounded-l-xl bg-honey-400"
        aria-hidden="true"
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-semibold text-wood-800">
            Ledjer membantu pekerjaan Anda?
          </p>
          <p className="text-xs leading-relaxed text-wood-600">
            Dukungan sukarela melalui Trakteer membantu kami menjaga Ledjer
            tetap berjalan dan terus berkembang.
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <SupportLink
            variant="outline"
            placement="value_moment"
            className="px-3.5 py-2 text-xs"
            onClick={onSupportClick}
          />
          <button
            type="button"
            onClick={handleDismiss}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-wood-500 transition-colors hover:bg-honey-100 hover:text-wood-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wood-500 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0"
            aria-label="Tutup pemberitahuan dukungan"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}


