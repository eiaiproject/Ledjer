import { useState, useCallback, useEffect, useRef } from "react";
import { PAGE_GUIDES } from "@/lib/help-content";
import { MentionCircle, X, ChevronDown, ChevronUp, CheckCircle } from "reicon-react";
import { cn } from "@/lib/utils";

/* ───── Dismiss state (per halaman) ───── */

const GUIDE_SEEN_PREFIX = "ledjer:page_guide_seen:";

function isGuideSeen(guideKey: string): boolean {
  try {
    return localStorage.getItem(GUIDE_SEEN_PREFIX + guideKey) === "1";
  } catch {
    return false;
  }
}

function persistGuideSeen(guideKey: string): void {
  try {
    localStorage.setItem(GUIDE_SEEN_PREFIX + guideKey, "1");
  } catch {
    // Storage penuh atau tidak tersedia — abaikan
  }
}

/* ───── Props ───── */

interface PageGuideProps {
  /** Key ke PAGE_GUIDES di help-content.ts */
  readonly guideKey: string;
  /** Tambahan class CSS */
  readonly className?: string;
}

/**
 * Panduan langkah-demi-langkah per halaman.
 *
 * - Tampil otomatis saat halaman dibuka pertama kali (ingatan per-halaman di localStorage).
 * - Bisa ditutup (X / Escape) — penutupan diingat, tidak muncul lagi otomatis.
 * - Bisa dibuka kembali lewat tombol "Panduan halaman".
 * - Kolapsibel: header selalu terlihat, isi bisa dibuka/tutup.
 * - Non-intrusif: panel biasa, bukan modal.
 * - Aksesibilitas: role="region", tombol berlabel, animasi dihormati reduced-motion.
 */
export function PageGuide({ guideKey, className }: PageGuideProps) {
  const guide = PAGE_GUIDES[guideKey];
  const [dismissed, setDismissed] = useState(() => isGuideSeen(guideKey));
  const [expanded, setExpanded] = useState(true);
  const sectionRef = useRef<HTMLElement>(null);

  const handleDismiss = useCallback(() => {
    persistGuideSeen(guideKey);
    setDismissed(true);
  }, [guideKey]);

  // Escape menutup panduan (dan menandai sudah dilihat) — hanya jika fokus
  // berada di dalam panduan, agar tidak bentrok dengan Escape milik modal
  // atau komponen lain di halaman.
  useEffect(() => {
    if (dismissed) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const active = document.activeElement;
      if (sectionRef.current && (!active || !sectionRef.current.contains(active))) return;
      handleDismiss();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [dismissed, handleDismiss]);

  if (!guide) return null;

  // Sudah ditutup sebelumnya → tombol kecil untuk membuka kembali
  if (dismissed) {
    return (
      <button
        type="button"
        onClick={() => setDismissed(false)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border border-wood-200 bg-surface px-3 py-1.5 text-xs font-medium text-wood-600 shadow-sm transition-colors hover:border-wood-300 hover:bg-wood-50 hover:text-wood-700",
          "min-h-[44px] sm:min-h-[36px]",
          className,
        )}
        aria-label={`Buka panduan: ${guide.title}`}
      >
        <MentionCircle className="h-3.5 w-3.5" aria-hidden="true" />
        Panduan halaman
      </button>
    );
  }

  return (
    <section
      ref={sectionRef}
      aria-label={`Panduan: ${guide.title}`}
      className={cn(
        "relative overflow-hidden rounded-xl border border-sky-200 bg-sky-50 shadow-sm",
        "animate-[ledger-page-in_300ms_var(--ease-out)]",
        "motion-reduce:animate-none",
        className,
      )}
    >
      {/* Decorative accent */}
      <div className="absolute left-0 top-0 h-full w-1 rounded-l-xl bg-sky-400" aria-hidden="true" />

      {/* Header */}
      <div className="relative flex items-center gap-2 px-4 py-3">
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
          <MentionCircle className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-sky-600">
            Panduan halaman
          </p>
          <h2 className="truncate text-sm font-semibold text-text-primary">{guide.title}</h2>
        </div>

        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-wood-500 transition-colors hover:bg-sky-100 hover:text-wood-600 sm:h-9 sm:w-9"
          aria-expanded={expanded}
          aria-label={expanded ? "Ciutkan panduan" : "Perluas panduan"}
        >
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>

        <button
          type="button"
          onClick={handleDismiss}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-wood-500 transition-colors hover:bg-sky-100 hover:text-wood-600 sm:h-9 sm:w-9"
          aria-label="Tutup panduan"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Body */}
      {expanded && (
        <div className="relative border-t border-sky-100 px-4 pb-4 pt-3">
          <p className="text-sm leading-relaxed text-text-secondary">{guide.summary}</p>

          <ol className="mt-3 space-y-2">
            {guide.steps.map((step, index) => (
              <li key={step} className="flex items-start gap-2.5 text-sm text-text-primary">
                <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-600 text-[10px] font-bold text-white">
                  {index + 1}
                </span>
                <span className="leading-relaxed">{step}</span>
              </li>
            ))}
          </ol>

          {guide.tip && (
            <div className="mt-3 flex items-start gap-2 rounded-lg bg-sky-100/60 p-3">
              <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" aria-hidden="true" />
              <p className="text-xs leading-relaxed text-sky-800">{guide.tip}</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
