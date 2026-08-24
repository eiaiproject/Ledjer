/**
 * Analytics abstraction for Ledjer.
 *
 * Uses Sentry captureMessage as the backend (already configured in instrument.ts).
 * Platform: Sentry (error monitoring & basic event tracking)
 *
 * Events MUST NOT contain:
 * - Nominal dukungan Trakteer
 * - Isi transaksi Trakteer
 * - Email Trakteer
 * - Identitas pembayaran
 * - Data keuangan Ledjer
 * - Informasi sensitif pengguna
 * - Query params atau hash dari URL
 */

import * as Sentry from "@sentry/react";

/** Nilai placement yang diperbolehkan untuk event support_link_clicked */
type SupportPlacement = "landing" | "footer" | "app_menu" | "value_moment";

interface SupportClickEvent {
  placement: SupportPlacement;
  route: string;
  authenticated: boolean;
}

/**
 * Mencatat klik pada link dukungan Trakteer.
 *
 * Aman digunakan dari mana saja - tidak menangkap data sensitif.
 * Tidak menghalangi navigasi (fire-and-forget).
 */
export function trackSupportClick(placement: SupportPlacement): void {
  try {      const event: SupportClickEvent = {
      placement,
      route: window.location.pathname,
      // Pathname-based: authenticated routes start with /dashboard, /transactions, etc.
      // Public routes are /, /login, /register, /forgot-password, /reset-password,
      // /privacy, /terms, /contact, /security, /refund
      authenticated: !/^\/($|login|register|forgot-password|reset-password|privacy|terms|contact|security|refund)/.test(
        window.location.pathname,
      ),
    };

    Sentry.captureMessage("support_link_clicked", {
      level: "info",
      tags: {
        placement: event.placement,
        route: event.route,
        authenticated: String(event.authenticated),
      },
      extra: {
        // Hanya metadata yang aman - lihat larangan di atas
        placement: event.placement,
        route: event.route,
        authenticated: event.authenticated,
      },
    });
  } catch {
    // Analytics tidak boleh merusak UX - gagal diam
  }
}

export type { SupportPlacement };
