import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import { Logo } from "@/components/ui/logo";

/**
 * PublicLayout — minimal chrome for marketing / auth / legal pages.
 *
 * Provides:
 *  - Sticky top header with logo + conditional back link
 *  - <main id="main-content"> landmark
 *  - Footer with legal nav links
 *
 * The landing page (/) renders its own bespoke hero/header inside its own
 * tree and is excluded via index-route. All other public routes mount this.
 *
 * ponytail: minimum viable chrome. No mega-nav, no language switcher, no
 * marketing CTAs. Add those when public-page authed funnel needs them.
 */
export function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="ledger-page flex min-h-dvh flex-col bg-cream-100">
      <header className="ledger-safe-top sticky top-0 z-sticky border-b border-wood-200 bg-cream-50/95 backdrop-blur-sm">
        <nav
          aria-label="Navigasi utama"
          className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8"
        >
          <Link
            to="/"
            aria-label="Ledjer beranda"
            className="flex items-center min-h-[44px]"
          >
            <Logo size="sm" variant="full" />
          </Link>
          <div className="flex items-center gap-2">
            <Link
              to="/login"
              className="rounded-md px-3 py-2 text-sm font-medium text-wood-700 hover:bg-cream-100 min-h-[44px] flex items-center"
            >
              Masuk
            </Link>
          </div>
        </nav>
      </header>

      <main id="main-content" className="flex-1">
        {children}
      </main>

      <footer
        aria-label="Informasi footer"
        className="border-t border-wood-200 bg-cream-50"
      >
        <nav
          aria-label="Tautan legal"
          className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-6 gap-y-2 px-4 py-6 text-sm text-wood-600 sm:px-6 lg:px-8"
        >
          <Link to="/privacy" className="hover:text-wood-800 min-h-[44px] flex items-center">
            Kebijakan Privasi
          </Link>
          <Link to="/terms" className="hover:text-wood-800 min-h-[44px] flex items-center">
            Syarat &amp; Ketentuan
          </Link>
          <Link to="/security" className="hover:text-wood-800 min-h-[44px] flex items-center">
            Keamanan
          </Link>
          <Link to="/contact" className="hover:text-wood-800 min-h-[44px] flex items-center">
            Kontak
          </Link>
        </nav>
        <p className="mx-auto max-w-6xl px-4 pb-6 text-center text-xs text-wood-500 sm:px-6 lg:px-8">
          © {new Date().getFullYear()} Ledjer. Hak cipta dilindungi.
        </p>
      </footer>
    </div>
  );
}