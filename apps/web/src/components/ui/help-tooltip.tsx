import { useState, useRef, useEffect } from "react";
import { HELP, type HelpContent } from "@/lib/help-content";
import { MentionCircle, X } from "reicon-react";

interface HelpTooltipProps {
  /** Key into the HELP content map */
  readonly topic: string;
  /** Optional custom title override */
  readonly title?: string;
  /** Position of the popover relative to the trigger */
  readonly position?: "top" | "bottom" | "left" | "right";
  /** Small variant for inline usage */
  readonly size?: "sm" | "md";
}

export function HelpTooltip({
  topic,
  title,
  position = "bottom",
  size = "sm",
}: HelpTooltipProps) {
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const content: HelpContent | undefined = HELP[topic];

  // Close on click outside or Escape
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    function handleKeydown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) {
      document.addEventListener("mousedown", handleClick);
      document.addEventListener("keydown", handleKeydown);
    }
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKeydown);
    };
  }, [open]);

  if (!content) return null;

  const positionClasses: Record<string, string> = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
  };

  return (
    <span className="relative inline-flex items-center">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(!open)}
        className={`inline-flex items-center justify-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-ink/20 ${
          size === "sm"
            ? "h-4 w-4 text-wood-400 hover:text-wood-600 hover:bg-wood-100"
            : "h-5 w-5 text-wood-400 hover:text-wood-600 hover:bg-wood-100"
        }`}
        aria-label={`Bantuan: ${title ?? content.title}`}
        aria-expanded={open}
      >
        <MentionCircle className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} aria-hidden="true" />
      </button>

      {open && (
        <div
          ref={popoverRef}
          className={`absolute z-[var(--z-tooltip)] w-72 sm:w-80 ${positionClasses[position]}`}
          role="dialog"
          aria-label={title ?? content.title}>
          <div className="rounded-xl border border-wood-200 bg-surface p-4 shadow-lg">
            {/* Header */}
            <div className="flex items-start justify-between gap-2">
              <h4 className="text-sm font-semibold text-text-primary">
                {title ?? content.title}
              </h4>
              <button                 type="button"
                onClick={() => setOpen(false)}
                className="shrink-0 rounded p-0.5 text-wood-400 hover:bg-wood-100 hover:text-wood-600"
                aria-label="Tutup"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Content */}
            <p className="mt-2 text-xs leading-relaxed text-text-secondary">
              {content.explanation}
            </p>

            {/* Example */}
            {content.example && (
              <div className="mt-3 rounded-lg bg-wood-50 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-wood-500">
                  Contoh
                </p>
                <p className="mt-1 text-xs leading-relaxed text-wood-700">
                  {content.example}
                </p>
              </div>
            )}

            {/* Related topics */}
            {content.related && content.related.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1">
                {content.related.map((r) => {
                  const relatedContent = HELP[r];
                  if (!relatedContent) return null;
                  return (
                    <button type="button"
                      key={r}
                      onClick={() => {
                        /* Could expand or navigate in future */
                      }}
                      className="rounded-full bg-wood-100 px-2 py-0.5 text-[10px] text-wood-600 transition-colors hover:bg-wood-200"
                      title={relatedContent.explanation}
                    >
                      {relatedContent.title}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </span>
  );
}

/**
 * Inline help text shown below a form field or section.
 * Renders a small info icon that reveals explanation in a popover.
 */
export function FieldHelp({ topic, label }: { readonly topic: string; readonly label?: string }) {
  const content = HELP[topic];
  if (!content) return null;

  return (
    <span className="inline-flex items-center gap-1 text-xs text-wood-500">
      <HelpTooltip topic={topic} size="sm" />
      {label && <span>{label}</span>}
    </span>
  );
}

/**
 * Help section panel for dedicated help blocks in the UI.
 * Shows a collapsible card with a full accounting explanation.
 */
export function HelpSection({ topic, defaultOpen = false }: { readonly topic: string; readonly defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const content = HELP[topic];
  if (!content) return null;

  return (
    <div className="rounded-xl border border-wood-200 bg-surface">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-wood-50"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2">
          <MentionCircle className="h-4 w-4 text-wood-400" aria-hidden="true" />
          <span className="text-sm font-medium text-text-primary">{content.title}</span>
        </div>
        <svg
          className={`h-4 w-4 text-wood-400 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="border-t border-wood-100 px-4 py-3">
          <p className="text-xs leading-relaxed text-text-secondary">{content.explanation}</p>
          {content.example && (
            <div className="mt-3 rounded-lg bg-wood-50 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-wood-500">Contoh</p>
              <p className="mt-1 text-xs leading-relaxed text-wood-700">{content.example}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
