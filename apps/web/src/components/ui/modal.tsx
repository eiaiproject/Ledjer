import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { X } from "reicon-react";
import { useDialogFocusTrap } from "@/hooks/useDialogFocusTrap";
import { cn } from "@/lib/utils";

type ModalProps = Readonly<{
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  ariaLabel?: string;
}>;

const sizeStyles = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

export function Modal({ open, onClose, title, children, size = "md", className, ariaLabel }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const [rendered, setRendered] = useState(open);
  if (open && !rendered) setRendered(true);
  useDialogFocusTrap(open, dialogRef);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    let frame = 0;

    if (open) {
      if (!dialog.open) {
        const active = document.activeElement;
        if (active instanceof HTMLElement && active !== dialog) {
          returnFocusRef.current = active;
        }
        dialog.showModal();
      }
      // Native showModal() focuses the first focusable control, which is the
      // close button in a titled dialog. Prefer the first real field so the
      // form is immediately usable; fall back to a safe action.
      frame = window.requestAnimationFrame(() => {
        if (!dialog.open) return;
        const field = dialog.querySelector<HTMLElement>(
          'input:not([type="hidden"]), select, textarea',
        );
        const fallback = dialog.querySelector<HTMLElement>(
          '[data-modal-initial-focus], button',
        );
        (field ?? fallback)?.focus();
      });
    } else {
      if (dialog.open) dialog.close();
      // Native focus return is inconsistent across browsers (WebKit leaves
      // focus on the page), so restore the opener explicitly.
      const target = returnFocusRef.current;
      returnFocusRef.current = null;
      if (target?.isConnected) target.focus();
    }

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [open]);

  // Keep the dialog mounted so .close() can run before React removes it. This
  // preserves native focus return and avoids focusing <body> after a modal.
  useEffect(() => {
    const dialog = dialogRef.current;
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className={cn(
        "m-auto max-h-[90dvh] w-[calc(100%-2rem)] overflow-y-auto rounded-xl bg-surface p-0 text-left shadow-xl outline-none backdrop:bg-wood-900/50 backdrop:backdrop-blur-[1px] [animation:modal-content-in_var(--duration-base)_var(--ease-out)]",
        sizeStyles[size],
        className
      )}
      aria-labelledby={title ? titleId : undefined}
      aria-label={!title ? ariaLabel : undefined}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={() => setRendered(false)}
    >
      {(open || rendered) && (
        <>
          {title && (
            <div className="flex items-center justify-between border-b border-wood-100 px-5 py-4">
              <h2 id={titleId} className="text-lg font-semibold text-text-primary">
                {title}
              </h2>
              <button
                type="button"
                onClick={onClose}
                className="flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-wood-500 hover:bg-cream-200 hover:text-wood-600"
                aria-label="Tutup"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          )}
          {children}
        </>
      )}
    </dialog>
  );
}

export function ModalContent({ children, className, title }: Readonly<{ children: ReactNode; className?: string; title?: string }>) {
  return (
    <div className={cn("p-5", className)}>
      {title && <h2 className="text-lg font-bold text-text-primary mb-4">{title}</h2>}
      {children}
    </div>
  );
}

export function ModalFooter({ children, className }: Readonly<{ children: ReactNode; className?: string }>) {
  return (
    <div className={cn("flex justify-end gap-2 p-5 border-t border-wood-100", className)}>
      {children}
    </div>
  );
}
