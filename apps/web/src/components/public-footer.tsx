import { Link } from "react-router-dom";
import { TRAKTEER_URL } from "@/lib/external";

export function PublicFooter() {
  return (
    <footer aria-label="Informasi footer" className="border-t border-wood-200 bg-cream-50">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <nav aria-label="Informasi legal" className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs text-wood-600">
          <Link to="/privacy" className="inline-flex min-h-11 items-center px-2 underline-offset-2 hover:text-wood-900 hover:underline">Privasi</Link>
          <Link to="/terms" className="inline-flex min-h-11 items-center px-2 underline-offset-2 hover:text-wood-900 hover:underline">Syarat</Link>
          <Link to="/refund" className="inline-flex min-h-11 items-center px-2 underline-offset-2 hover:text-wood-900 hover:underline">Pengembalian dana</Link>
          <Link to="/security" className="inline-flex min-h-11 items-center px-2 underline-offset-2 hover:text-wood-900 hover:underline">Keamanan</Link>
          <Link to="/contact" className="inline-flex min-h-11 items-center px-2 underline-offset-2 hover:text-wood-900 hover:underline">Kontak</Link>
        </nav>
        <p className="mt-3 text-center text-xs text-wood-500">
          © {new Date().getFullYear()} Ledjer.
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
      </div>
    </footer>
  );
}
