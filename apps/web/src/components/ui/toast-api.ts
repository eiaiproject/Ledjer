import { createContext, useContext } from "react";

export type ToastVariant = "success" | "error" | "warning" | "info";

export interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
}

export interface ToastContextValue {
  toast: {
    success: (message: string) => void;
    error: (message: string) => void;
    warning: (message: string) => void;
    info: (message: string) => void;
  };
}

export const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}

let globalToast: ToastContextValue["toast"] | null = null;

export function setGlobalToast(t: ToastContextValue["toast"]) {
  globalToast = t;
}

export const toast = {
  success: (message: string) => {
    if (!globalToast) throw new Error("ToastProvider not mounted");
    globalToast.success(message);
  },
  error: (message: string) => {
    if (!globalToast) throw new Error("ToastProvider not mounted");
    globalToast.error(message);
  },
  warning: (message: string) => {
    if (!globalToast) throw new Error("ToastProvider not mounted");
    globalToast.warning(message);
  },
  info: (message: string) => {
    if (!globalToast) throw new Error("ToastProvider not mounted");
    globalToast.info(message);
  },
};
