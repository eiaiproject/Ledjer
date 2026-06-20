import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

const sizeStyles = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function Modal({ open, onClose, title, children, size = "md", className }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;

    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }

      if (e.key !== "Tab" || !contentRef.current) return;

      const focusable = Array.from(contentRef.current.querySelectorAll<HTMLElement>(focusableSelector))
        .filter((element) => !element.hasAttribute("disabled") && element.tabIndex !== -1);
      if (focusable.length === 0) {
        e.preventDefault();
        contentRef.current.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    window.setTimeout(() => {
      const firstFocusable = contentRef.current?.querySelector<HTMLElement>(focusableSelector);
      (firstFocusable ?? contentRef.current)?.focus();
    }, 0);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
      previousFocusRef.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      ref={overlayRef}
      className="fixed inset-0 z-modal flex items-center justify-center bg-wood-900/50 p-4 backdrop-blur-[1px] [animation:modal-overlay-in_var(--duration-base)_var(--ease-out)]"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div
        ref={contentRef}
        className={cn(
          "w-full rounded-xl bg-surface shadow-xl outline-none [animation:modal-content-in_var(--duration-base)_var(--ease-out)]",
          sizeStyles[size],
          className
        )}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
      >
        {title && (
          <div className="flex items-center justify-between px-5 py-4 border-b border-wood-100">
            <h2 id={titleId} className="text-lg font-serif font-semibold text-text-primary">
              {title}
            </h2>
            <button
              onClick={onClose}
              className="p-1 rounded-md text-wood-400 hover:text-wood-600 hover:bg-cream-200"
              aria-label="Tutup"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body
  );
}

export function ModalContent({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("p-5", className)}>{children}</div>;
}

export function ModalFooter({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex justify-end gap-2 p-5 border-t border-wood-100", className)}>
      {children}
    </div>
  );
}
