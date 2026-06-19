import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { ToastContext, setGlobalToast, type Toast, type ToastVariant } from "./toast-api";

let toastId = 0;
function nextId() {
  return String(++toastId);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const removeToast = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (message: string, variant: ToastVariant) => {
      const id = nextId();
      setToasts((prev) => [...prev.slice(-4), { id, message, variant }]); // max 5 toasts
      const timer = setTimeout(() => removeToast(id), 5000);
      timersRef.current.set(id, timer);
    },
    [removeToast]
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

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </ToastContext.Provider>
  );
}

const VARIANT_STYLES: Record<ToastVariant, string> = {
  success: "bg-leaf-50 border-leaf-200 text-leaf-800",
  error: "bg-error-bg border-error/30 text-error",
  warning: "bg-warning-bg border-clay-400/30 text-clay-600",
  info: "bg-info-bg border-sky-400/30 text-sky-600",
};

const ICONS: Record<ToastVariant, string> = {
  success: "✓",
  error: "✕",
  warning: "⚠",
  info: "ℹ",
};

function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-label="Notifikasi"
      className="fixed right-4 top-4 z-[1400] flex flex-col gap-2 sm:right-4 sm:top-4"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-sm shadow-md transition-all ${VARIANT_STYLES[t.variant]}`}
        >
          <span className="text-lg leading-none">{ICONS[t.variant]}</span>
          <span className="flex-1">{t.message}</span>
          <button
            onClick={() => onDismiss(t.id)}
            className="ml-2 text-current opacity-60 hover:opacity-100"
            aria-label="Tutup"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
