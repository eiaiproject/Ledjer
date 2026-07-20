import { AlertTriangle } from "reicon-react";
import { Button } from "./button";
import { Modal, ModalContent, ModalFooter } from "./modal";

interface ConfirmDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onConfirm: () => void;
  readonly title: string;
  readonly message: string;
  readonly confirmLabel?: string;
  readonly cancelLabel?: string;
  readonly variant?: "danger" | "warning";
  readonly loading?: boolean;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Ya, Lanjutkan",
  cancelLabel = "Batal",
  variant = "danger",
  loading,
}: ConfirmDialogProps) {
  const closeDialog = loading ? () => {} : onClose;

  return (
    <Modal open={open} onClose={closeDialog} size="sm" ariaLabel={title}>
      <ModalContent className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-error/10">
          <AlertTriangle className="h-6 w-6 text-error" />
        </div>
        <h3 className="break-words text-lg font-semibold text-wood-800">{title}</h3>
        <p className="mt-2 break-words text-sm text-wood-600">{message}</p>
      </ModalContent>
      <ModalFooter>
        <Button variant="ghost" onClick={onClose} disabled={loading}>
          {cancelLabel}
        </Button>
        <Button
          variant={variant === "danger" ? "danger" : "primary"}
          onClick={onConfirm}
          loading={loading}
          disabled={loading}
        >
          {confirmLabel}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
