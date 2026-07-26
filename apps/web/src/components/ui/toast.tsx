import { useState, useEffect, useCallback, useMemo, useRef, type ComponentType } from "react";
import { AlertTriangle, CheckCircle, InfoCircle, X, XCircle } from "reicon-react";
import { cn } from "@/lib/utils";
import { setGlobalToast, type Toast, type ToastVariant } from "@/components/ui/toast-api";

// Re-export for backward compatibility — existing imports from toast.tsx still work.
// eslint-disable-next-line react-refresh/only-export-components
export { toast, type ToastActions } from "@/components/ui/toast-api";

type ActiveToast = Toast & { duration: number };

let toastId = 0;
function nextId() {
  return String(++toastId);
}

function getToastDuration(variant: ToastVariant) {
  return variant === "warning" || variant === "error" ? 8000 : 5000;
}

export function ToastProvider({ children }: { readonly children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ActiveToast[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const removeToast = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const startTimer = useCallback((id: string, duration: number) => {
    const existingTimer = timersRef.current.get(id);
    if (existingTimer) clearTimeout(existingTimer);
    const timer = setTimeout(() => removeToast(id), duration);
    timersRef.current.set(id, timer);
  }, [removeToast]);

  const pauseTimer = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (!timer) return;
    clearTimeout(timer);
    timersRef.current.delete(id);
  }, []);

  const resumeTimer = useCallback((id: string, duration: number) => {
    startTimer(id, duration);
  }, [startTimer]);

  const addToast = useCallback(
    (message: string, variant: ToastVariant) => {
      const id = nextId();
      const duration = getToastDuration(variant);
      setToasts((prev) => [...prev.slice(-4), { id, message, variant, duration }]);
      startTimer(id, duration);
    },
    [startTimer]
  );

  const toast = useMemo(() => ({
    success: (message: string) => addToast(message, "success"),
    error: (message: string) => addToast(message, "error"),
    warning: (message: string) => addToast(message, "warning"),
    info: (message: string) => addToast(message, "info"),
  }), [addToast]);

  // Set global toast on mount
  useEffect(() => {
    setGlobalToast(toast);
  }, [toast]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    };
  }, []);

  return (
    <>
      {children}
      <ToastContainer toasts={toasts} onDismiss={removeToast} onPause={pauseTimer} onResume={resumeTimer} />
    </>
  );
}

const VARIANT_STYLES: Record<ToastVariant, string> = {
  success: "bg-success-bg border-success-border text-success",
  error: "bg-error-bg border-error-border text-error",
  warning: "bg-warning-bg border-warning-border text-warning",
  info: "bg-info-bg border-info-border text-info",
};

const ICONS: Record<ToastVariant, ComponentType<{ className?: string }>> = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: InfoCircle,
};

function ToastContainer({
  toasts,
  onDismiss,
  onPause,
  onResume,
}: Readonly<{
  toasts: ActiveToast[];
  onDismiss: (id: string) => void;
  onPause: (id: string) => void;
  onResume: (id: string, duration: number) => void;
}>) {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-label="Notifikasi"
      className="fixed top-[72px] right-3 left-3 z-toast flex flex-col gap-2 sm:top-4 sm:right-4 sm:left-auto sm:max-w-sm"
    >
      {toasts.map((t) => {
        const Icon = ICONS[t.variant];
        return (
          <output
            key={t.id}
            role={t.variant === "error" ? "alert" : undefined}
            aria-live={t.variant === "error" ? "assertive" : "polite"}
            onMouseEnter={() => onPause(t.id)}
            onMouseLeave={() => onResume(t.id, t.duration)}
            className={cn(
              "flex items-start gap-3 rounded-lg border px-4 py-3 text-sm shadow-md transition-all",
              VARIANT_STYLES[t.variant]
            )}
          >
            <Icon className="mt-0.5 h-5 w-5 shrink-0" />
            <span className="flex-1">{t.message}</span>
            <button               type="button"
              onClick={() => onDismiss(t.id)}
              className="ml-2 rounded-sm text-current opacity-60 hover:opacity-100 focus-visible:outline-wood-500"
              aria-label="Tutup"
            >
              <X className="h-4 w-4" />
            </button>
          </output>
        );
      })}
    </div>
  );
}
