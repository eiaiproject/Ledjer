import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const THRESHOLD_PX = 60; // pull distance (px) that triggers the refresh
const MAX_PULL_PX = 96; // how far the indicator can travel
const RESISTANCE = 0.5; // finger travel → indicator travel ratio

interface PullToRefreshProps {
  /** Re-fetches the page data. Shown until the returned promise settles. */
  readonly onRefresh: () => Promise<unknown>;
  readonly children: ReactNode;
  readonly className?: string;
  /** Screen-reader / indicator text while refreshing (e.g. "Memperbarui"). */
  readonly label?: string;
}

/**
 * Mobile pull-to-refresh gesture.
 *
 * The dashboard layout disables the native browser overscroll
 * (`.ledger-app-scroll { overscroll-behavior-y: none }`), so this component
 * re-implements the gesture: pull down while the window is scrolled to the
 * top, release past the threshold to trigger `onRefresh`.
 *
 * Touch-only — desktop keeps the browser refresh / auto-refresh intervals.
 * Listeners are attached to `document` so the gesture works no matter which
 * element the touch starts on.
 */
export function PullToRefresh({ onRefresh, children, className, label = "Memperbarui" }: PullToRefreshProps) {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startYRef = useRef<number | null>(null);
  const pullingRef = useRef(false);
  const distanceRef = useRef(0);
  const refreshingRef = useRef(false);
  const onRefreshRef = useRef(onRefresh);

  useEffect(() => {
    onRefreshRef.current = onRefresh;
  });

  useEffect(() => {
    if (!window.matchMedia?.("(pointer: coarse)").matches) return;

    const setDistance = (px: number) => {
      distanceRef.current = px;
      setPullDistance(px);
    };

    const onTouchStart = (e: TouchEvent) => {
      if (refreshingRef.current) return;
      if (window.scrollY > 0) {
        startYRef.current = null;
        return;
      }
      const y = e.touches[0]?.clientY ?? null;
      startYRef.current = y;
      pullingRef.current = y != null;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!pullingRef.current || refreshingRef.current || startYRef.current == null) return;
      const y = e.touches[0]?.clientY ?? startYRef.current;
      const delta = y - startYRef.current;
      // Only intercept the gesture at the top of the page; otherwise let the
      // browser scroll normally. Known edge case: a downward drag from the very
      // top also prevents scroll inside an inner scrollable region (e.g. a
      // horizontally-scrolling table) — the document must be re-scrolled first.
      if (delta > 0 && window.scrollY <= 0) {
        e.preventDefault();
        setDistance(Math.min(delta * RESISTANCE, MAX_PULL_PX));
      } else if (delta <= 0) {
        setDistance(0);
      }
    };

    const finishPull = () => {
      if (!pullingRef.current) return;
      pullingRef.current = false;
      startYRef.current = null;
      if (distanceRef.current >= THRESHOLD_PX && !refreshingRef.current) {
        refreshingRef.current = true;
        setRefreshing(true);
        void onRefreshRef.current().finally(() => {
          refreshingRef.current = false;
          setRefreshing(false);
          setDistance(0);
        });
      } else {
        setDistance(0);
      }
    };

    const cancelPull = () => {
      pullingRef.current = false;
      startYRef.current = null;
      setDistance(0);
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", finishPull, { passive: true });
    document.addEventListener("touchcancel", cancelPull, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", finishPull);
      document.removeEventListener("touchcancel", cancelPull);
    };
  }, []);

  const showIndicator = pullDistance > 0 || refreshing;

  // Indicator text depends on the pull state — kept in an if/else chain so
  // the three-way status never becomes a nested ternary.
  let statusText = "Tarik ke bawah untuk memperbarui";
  if (refreshing) {
    statusText = `${label}...`;
  } else if (pullDistance >= THRESHOLD_PX) {
    statusText = "Lepaskan untuk memperbarui";
  }

  return (
    <div className={cn("relative", className)}>
      {/* Pull indicator */}
      <div
        aria-hidden={!showIndicator}
        className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center"
      >
        <div
          className={cn(
            "mt-3 flex items-center gap-2 rounded-full border border-wood-200 bg-surface-elevated px-4 py-2 text-xs font-medium text-text-secondary shadow-md transition-all duration-200 motion-reduce:transition-none",
            showIndicator ? "translate-y-0 opacity-100" : "-translate-y-16 opacity-0",
          )}
        >
          {refreshing ? (
            <>
              <span
                className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-wood-300 border-t-wood-600"
                aria-hidden="true"
              />
              <output>{statusText}</output>
            </>
          ) : (
            <span>{statusText}</span>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}
