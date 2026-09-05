import { Link } from "react-router-dom";
import { Logo } from "@/components/ui/logo";
import { Button } from "@/components/ui/button";
import { TRAKTEER_URL } from "@/lib/external";

export function LandingPage() {
  return (
    <div className="ledger-page ledger-min-dvh flex flex-col bg-cream-100">
      <header className="ledger-safe-top sticky top-0 z-sticky border-b border-wood-200 bg-cream-50/95 backdrop-blur-sm">
        <nav
          aria-label="Navigasi utama"
          className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8"
        >
          <Link to="/" aria-label="Ledjer beranda" className="flex min-h-[44px] items-center">
            <Logo size="sm" variant="full" />
          </Link>
          <div className="flex items-center gap-2">
            <Link
              to="/login"
              className="flex min-h-[44px] items-center rounded-md px-3 py-2 text-sm font-medium text-wood-700 hover:bg-cream-100"
            >
              Masuk
            </Link>
            <Link to="/register">
              <Button size="sm">Daftar Gratis</Button>
            </Link>
          </div>
        </nav>
      </header>

      <main id="main-content" className="flex-1">
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold text-leaf-700">Pembukuan double-entry untuk UMKM Indonesia</p>
            <h1 className="mt-4 text-4xl font-bold tracking-tight text-wood-900 sm:text-5xl">
              Catat uang masuk & keluar, tanpa spreadsheet.
            </h1>
            <p className="mt-4 text-lg leading-relaxed text-wood-600">
              Ledjer mencatat setiap transaksi sebagai jurnal debit-kredit yang otomatis seimbang,
              lalu menyajikan saldo kas, laba rugi, dan neraca yang bisa Anda percaya.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link to="/register">
                <Button size="lg">Mulai Gratis</Button>
              </Link>
              <Link to="/login">
                <Button size="lg" variant="secondary">
                  Masuk
                </Button>
              </Link>
            </div>
          </div>

          <div className="mx-auto mt-16 grid max-w-4xl gap-4 sm:grid-cols-3">
            {[
              { title: "5 jenis transaksi", description: "Uang masuk, uang keluar, transfer, modal masuk, dan pengambilan pemilik." },
              { title: "Laporan otomatis", description: "Laba rugi dan neraca tersusun sendiri dari jurnal yang seimbang." },
              { title: "Data milik Anda", description: "Ekspor CSV kapan saja. Tidak ada iklan, tidak ada penjualan data." },
            ].map((feature) => (
              <div key={feature.title} className="rounded-xl border border-wood-200 bg-surface p-6">
                <h2 className="text-base font-semibold text-wood-900">{feature.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-wood-600">{feature.description}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer aria-label="Informasi footer" className="border-t border-wood-200 bg-cream-50">
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