import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "reicon-react";
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
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) dialog.showModal();
    else dialog.close();
  }, [open]);

  if (!open) return null;

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
    >
      {title && (
        <div className="flex items-center justify-between border-b border-wood-100 px-5 py-4">
          <h2 id={titleId} className="text-lg font-semibold text-text-primary">
            {title}
          </h2>
          <button             type="button"
            onClick={onClose}
            className="rounded-md p-1 text-wood-500 hover:bg-cream-200 hover:text-wood-600"
            aria-label="Tutup"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}
      {children}
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
