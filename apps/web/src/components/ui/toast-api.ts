export type ToastVariant = "success" | "error" | "warning" | "info";

export interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
}

export interface ToastActions {
  success: (message: string) => void;
  error: (message: string) => void;
  warning: (message: string) => void;
  info: (message: string) => void;
}

let globalToast: ToastActions | null = null;

export function setGlobalToast(t: ToastActions) {
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
