import { useEffect, type RefObject } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type=\"hidden\"])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex=\"-1\"])",
].join(",");

function focusableIn(dialog: HTMLDialogElement): HTMLElement[] {
  return Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.tabIndex >= 0 && el.getClientRects().length > 0,
  );
}

/**
 * Native <dialog> marks the page inert, but Chromium can still move focus to
 * <body> after the last tab stop. Keep Tab and Shift+Tab inside the open
 * dialog so keyboard focus never disappears behind the backdrop.
 */
export function useDialogFocusTrap(
  open: boolean,
  dialogRef: RefObject<HTMLDialogElement | null>,
) {
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || event.ctrlKey || event.metaKey || event.altKey) return;

      const dialog = dialogRef.current;
      if (!dialog?.open) return;

      const items = focusableIn(dialog);
      if (items.length === 0) return;

      const active = document.activeElement;
      const index = items.indexOf(active as HTMLElement);
      // Drive the cycle ourselves: WebKit does not always tab through every
      // link/button in a native dialog, and can drop focus onto <body>.
      const nextIndex = index === -1
        ? (event.shiftKey ? items.length - 1 : 0)
        : (index + (event.shiftKey ? -1 : 1) + items.length) % items.length;

      event.preventDefault();
      items[nextIndex].focus();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, dialogRef]);
}
