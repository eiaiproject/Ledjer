import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import { Logo } from "@/components/ui/logo";
import { TRAKTEER_URL } from "@/lib/external";

/**
 * PublicLayout - minimal chrome for marketing / auth / legal pages.
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
export function PublicLayout({ children }: { readonly children: ReactNode }) {
  return (
    <div className="ledger-page flex min-h-dvh flex-col bg-cream-100">
      {/* Skip to content link - WCAG 2.4.1, pola sama dengan dasbor */}
      <a
        href="#main-content"
        onClick={(e) => {
          e.preventDefault();
          const main = document.getElementById("main-content");
          if (main) {
            main.focus();
            main.scrollIntoView();
          }
        }}
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[var(--z-toast)] focus:rounded-lg focus:bg-cream-50 focus:px-4 focus:py-2.5 focus:text-sm focus:font-semibold focus:text-wood-900 focus:shadow-lg focus:outline-2 focus:outline-offset-2 focus:outline-wood-500"
      >
        Langsung ke konten utama
      </a>
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

      <main id="main-content" tabIndex={-1} className="flex-1 outline-none">
        {children}
      </main>

      <footer
        aria-label="Informasi footer"
        className="border-t border-wood-200 bg-cream-50"
      >
        <p className="mx-auto max-w-6xl px-4 py-6 text-center text-xs text-wood-500 sm:px-6 lg:px-8">
          © {new Date().getFullYear()} Ledjer. Hak cipta dilindungi.
          <span aria-hidden="true" className="mx-2">·</span>
          <a
            href={TRAKTEER_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="underline-offset-2 hover:text-wood-800 hover:underline"
          >
            Dukung kami di Trakteer
          </a>
        </p>
      </footer>
    </div>
  );
}