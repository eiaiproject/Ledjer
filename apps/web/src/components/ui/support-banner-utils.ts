/* ───── Cooldown key ───── */

const DISMISS_KEY = "ledjer:support_banner_dismissed_at";
const COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 hari

/* ───── Helpers ───── */

function isBannerDismissed(): boolean {
  try {
    const stored = localStorage.getItem(DISMISS_KEY);
    if (!stored) return false;
    const dismissedAt = Number(stored);
    if (!Number.isFinite(dismissedAt)) return false;
    return Date.now() - dismissedAt < COOLDOWN_MS;
  } catch {
    return false;
  }
}

function persistDismissal(): void {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    // Storage penuh atau tidak tersedia — abaikan
  }
}

function clearDismissal(): void {
  try {
    localStorage.removeItem(DISMISS_KEY);
  } catch {
    // abaikan
  }
}

/** Hapus dismiss state (untuk testing / debug) */
export function resetSupportBannerDismiss(): void {
  clearDismissal();
}

export { isBannerDismissed, persistDismissal };
