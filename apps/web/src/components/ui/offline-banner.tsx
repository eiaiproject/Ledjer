import { useEffect, useState } from "react";
import { WifiOff } from "reicon-react";
import { cn } from "@/lib/utils";

/**
 * Offline banner that auto-dismisses when the browser regains connectivity.
 * Place once at the app root layout.
 */
export function OfflineBanner() {
  const [offline, setOffline] = useState(() => {
    if (typeof navigator === "undefined") return false;
    return !navigator.onLine;
  });

  useEffect(() => {
    const handleOffline = () => setOffline(true);
    const handleOnline = () => setOffline(false);

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    // Periodic check as a fallback
    const interval = setInterval(() => {
      const isOffline = !navigator.onLine;
      setOffline((prev) => {
        if (prev !== isOffline) return isOffline;
        return prev;
      });
    }, 5000);

    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      clearInterval(interval);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={cn(
        "fixed left-1/2 z-[var(--z-toast)] -translate-x-1/2",
        "bottom-[calc(16px+56px+env(safe-area-inset-bottom,0px))] lg:bottom-6",
        "animate-[ledger-page-in_200ms_var(--ease-out)]",
        "flex items-center gap-2.5 rounded-xl border border-error-border bg-error-bg px-5 py-3 shadow-lg",
      )}
    >
      <WifiOff className="h-5 w-5 shrink-0 text-error" />
      <div>
        <p className="text-sm font-medium text-error">Koneksi terputus</p>
        <p className="text-xs text-error/80">Beberapa fitur mungkin tidak tersedia hingga koneksi pulih.</p>
      </div>
    </div>
  );
}
