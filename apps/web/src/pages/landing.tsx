import { Link } from "react-router-dom";
import { ChartColumn, ChevronRight, Download, Package, Receipt } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { Button } from "@/components/ui/button";
import { PublicFooter } from "@/components/public-footer";

export function LandingPage() {
  return (
    <div className="ledger-page ledger-min-dvh flex flex-col bg-cream-100">
      {/* Skip to content link - WCAG 2.4.1, pola sama dengan dashboard */}
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
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[var(--z-toast)] focus:min-h-11 focus:rounded-lg focus:bg-cream-50 focus:px-4 focus:py-3 focus:text-sm focus:font-semibold focus:text-wood-900 focus:shadow-lg focus:outline-2 focus:outline-offset-2 focus:outline-wood-500"
      >
        Langsung ke konten utama
      </a>
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
            <Button as={Link} to="/register" size="sm">
              Mulai Gratis
            </Button>
          </div>
        </nav>
      </header>

      <main id="main-content" tabIndex={-1} className="flex-1 focus:outline-2 focus:outline-offset-[-2px] focus:outline-wood-500">
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold text-leaf-700">Pembukuan double-entry untuk UMKM Indonesia</p>
            <h1 className="mt-4 text-4xl font-bold tracking-tight text-wood-900 sm:text-5xl">
              Uang dan barang tercatat rapi, tanpa spreadsheet.
            </h1>
            <p className="mt-4 text-lg leading-relaxed text-wood-600">
              Ketik transaksi seperti chat, periksa pratinjaunya, lalu catat. Ledjer menyusun jurnal
              debit-kredit yang otomatis seimbang, mengikuti stok dan HPP, lalu menyajikan saldo kas,
              laba rugi, dan neraca. Tanpa perlu paham akuntansi.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Button as={Link} to="/register" size="lg">
                Mulai Gratis
              </Button>
              <Button as={Link} to="/login" size="lg" variant="secondary">
                Masuk
              </Button>
            </div>
          </div>

          {/* Contoh cara pakai: ketikan menjadi hasil. Panah tunggal menandai sebab-akibat. */}
          <div className="mx-auto mt-12 max-w-2xl rounded-xl border border-wood-200 bg-surface p-5">
            <p className="mb-3 text-xs font-semibold text-wood-500">Contoh</p>
            <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
              <p className="flex-1 rounded-lg bg-cream-100 px-4 py-3 text-sm text-wood-900">
                jual kopi 10 butir 50rb
              </p>
              <ChevronRight className="h-5 w-5 rotate-90 self-center text-wood-500 sm:rotate-0" aria-hidden="true" />
              <p className="flex-1 rounded-lg bg-cream-100 px-4 py-3 text-sm text-wood-900">
                Kas <span className="num-mono font-semibold tabular-nums">+Rp50.000</span> · Stok kopi −10 · HPP tercatat
              </p>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-wood-500">
              Diketik biasa, diparse otomatis tanpa AI. Pratinjau selalu bisa diperiksa sebelum dicatat.
            </p>
          </div>

          {/* Hasil bisnis dulu (laporan), lalu cara dan jaminan. Unggulan melebar, pendukung sejajar. */}
          <div className="mx-auto mt-12 grid max-w-4xl gap-4">
            <div className="rounded-xl border border-wood-200 bg-surface p-6 sm:flex sm:items-start sm:gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-leaf-100">
                <ChartColumn className="h-5 w-5 text-leaf-600" aria-hidden="true" />
              </div>
              <div className="mt-3 sm:mt-0">
                <h2 className="text-base font-semibold text-wood-900">Laporan keuangan otomatis</h2>
                <p className="mt-2 text-sm leading-relaxed text-wood-600">Laba rugi, neraca, dan buku besar tersusun sendiri dari jurnal yang seimbang.</p>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-wood-200 bg-surface p-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-wood-100">
                  <Receipt className="h-5 w-5 text-wood-600" aria-hidden="true" />
                </div>
                <h2 className="mt-3 text-base font-semibold text-wood-900">7 jenis transaksi</h2>
                <p className="mt-2 text-sm leading-relaxed text-wood-600">Uang masuk, uang keluar, transfer, modal masuk, pengambilan pemilik, pembelian barang, hingga susut stok.</p>
              </div>
              <div className="rounded-xl border border-wood-200 bg-surface p-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-wood-100">
                  <Package className="h-5 w-5 text-wood-600" aria-hidden="true" />
                </div>
                <h2 className="mt-3 text-base font-semibold text-wood-900">Stok dan HPP otomatis</h2>
                <p className="mt-2 text-sm leading-relaxed text-wood-600">Jual dan beli barang menambah atau mengurangi stok sendiri, lengkap dengan harga pokoknya. Stok minus ditolak.</p>
              </div>
              <div className="rounded-xl border border-wood-200 bg-surface p-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-wood-100">
                  <Download className="h-5 w-5 text-wood-600" aria-hidden="true" />
                </div>
                <h2 className="mt-3 text-base font-semibold text-wood-900">Data milik Anda</h2>
                <p className="mt-2 text-sm leading-relaxed text-wood-600">Ekspor CSV kapan saja. Tidak ada iklan, tidak ada penjualan data.</p>
              </div>
            </div>
          </div>

          <p className="mx-auto mt-12 flex max-w-3xl flex-wrap items-center justify-center gap-x-2 text-center text-sm leading-relaxed text-wood-600">
            <span>Salah catat bisa dibatalkan berjejak</span>
            <span aria-hidden="true">·</span>
            <span>Kirim ulang tidak dobel</span>
            <span aria-hidden="true">·</span>
            <span>Tetap mencatat saat offline</span>
            <span aria-hidden="true">·</span>
            <span>Saldo kas terpantau di dashboard</span>
          </p>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}