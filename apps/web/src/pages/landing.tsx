import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  FileText,
  Calculator,
  Package,
  BarChart3,
  Shield,
  Lock,
  Eye,
  ChevronRight,
  CheckCircle2,
} from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const features = [
  { icon: Calculator, title: "Jurnal otomatis", desc: "Debit-kredit seimbang tanpa input manual", tone: "leaf" },
  { icon: FileText, title: "Transaksi lengkap", desc: "Kas, kredit, transfer, beban, modal", tone: "wood" },
  { icon: Package, title: "Stok + HPP", desc: "Weighted average otomatis", tone: "honey" },
  { icon: BarChart3, title: "4 laporan utama", desc: "Buku besar, neraca, laba rugi", tone: "sky" },
] as const;

const mockupMetrics = [
  { label: "Saldo Kas", value: "Rp 45.200.000", tone: "leaf" },
  { label: "Laba/Rugi", value: "Rp 95.750.000", tone: "honey" },
] as const;

const mockupTransactions = [
  { desc: "Penjualan Toko Online", amount: "Rp 8.500.000", side: "Debet", tone: "leaf" },
  { desc: "Pembelian Bahan Baku", amount: "Rp 3.200.000", side: "Kredit", tone: "clay" },
] as const;

const trustItems = [
  { icon: Lock, label: "Enkripsi data end-to-end" },
  { icon: Shield, label: "Row-level security" },
  { icon: Eye, label: "Audit log lengkap" },
] as const;

const toneStyles = {
  leaf: "border-leaf-200 bg-leaf-50 text-leaf-700",
  wood: "border-wood-200 bg-wood-50 text-wood-700",
  honey: "border-honey-200 bg-honey-50 text-honey-700",
  sky: "border-sky-200 bg-sky-50 text-sky-700",
  clay: "border-clay-200 bg-clay-50 text-clay-700",
};

function stagger(index: number) {
  return { "--i": index } as CSSProperties;
}

export function LandingPage() {
  return (
    <div className="min-h-screen overflow-x-hidden scroll-smooth motion-reduce:scroll-auto bg-cream-50">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-tooltip focus:rounded-lg focus:bg-wood-500 focus:px-4 focus:py-2 focus:text-sm focus:text-cream-50 focus:shadow-lg"
      >
        Lewati ke konten utama
      </a>

      <header className="sticky top-0 z-sticky border-b border-wood-200 bg-cream-50/95 backdrop-blur-sm">
        <nav aria-label="Navigasi utama" className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <Logo size="sm" variant="full" />

          <div className="hidden items-center gap-1 md:flex">
            <Button as="a" variant="ghost" size="sm" href="#fitur">
              Fitur
            </Button>
            <Button as="a" variant="ghost" size="sm" href="#keamanan">
              Keamanan
            </Button>
          </div>

          <div className="flex items-center gap-3">
            <Button as={Link} to="/login" variant="ghost" size="sm" className="hidden sm:inline-flex">
              Masuk
            </Button>
            <Button as={Link} to="/register" variant="primary" size="sm">
              <span className="sm:hidden">Mulai</span>
              <span className="hidden sm:inline">Mulai Gratis</span>
            </Button>
          </div>
        </nav>
      </header>

      <main id="main-content">
        <section aria-labelledby="hero-heading" className="landing-ledger relative overflow-hidden border-b border-wood-100">
          <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
            <div className="grid min-w-0 grid-cols-1 items-center gap-12 lg:grid-cols-[minmax(0,0.95fr)_minmax(26rem,1.05fr)] lg:gap-16">
              <div className="ledger-hero-copy min-w-0">
                <div
                  className="mb-5 inline-flex max-w-full items-center gap-2 rounded-full border border-leaf-200 bg-leaf-50 px-3 py-1 text-xs font-semibold text-leaf-700"
                  style={stagger(0)}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-leaf-500" aria-hidden="true" />
                  Pembukuan UMKM Indonesia
                </div>

                <h1
                  id="hero-heading"
                  className="max-w-[10ch] text-[clamp(2.75rem,10vw,5.25rem)] font-bold leading-[0.98] tracking-[-0.03em] text-wood-900 sm:max-w-[11ch]"
                  style={stagger(1)}
                >
                  Uang masuk keluar jelas.
                </h1>
                <p
                  className="mt-6 max-w-xl text-base leading-relaxed text-wood-700 sm:text-lg"
                  style={stagger(2)}
                >
                  Catat transaksi harian, biarkan Ledjer membentuk jurnal,
                  stok, dan laporan real-time untuk operasional UMKM.
                </p>

                <div
                  className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4"
                  style={stagger(3)}
                >
                  <Button as={Link} to="/register" variant="primary" size="lg" fullWidth className="sm:w-auto">
                    Mulai Gratis
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                  <a href="#fitur" className="text-sm font-medium text-wood-700 underline-offset-4 transition-colors hover:text-wood-900 hover:underline">
                    Lihat fitur utama
                  </a>
                </div>
              </div>

              <div className="relative min-w-0" role="img" aria-label="Contoh dashboard Ledjer yang menyeimbangkan jurnal otomatis">
                <div className="ledger-mockup w-full min-w-0 max-w-full overflow-hidden rounded-xl bg-wood-800 p-3 text-cream-50 shadow-lg sm:p-4">
                  <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-b border-wood-600 pb-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-cream-50">Live ledger</p>
                      <p className="text-xs text-wood-200">Transaksi berubah menjadi laporan</p>
                    </div>
                    <div className="ledger-balance-stamp inline-flex shrink-0 items-center gap-1.5 rounded-full bg-leaf-100 px-3 py-1.5 text-xs font-semibold text-leaf-700">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Seimbang</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 py-4 sm:grid-cols-2" role="group" aria-label="Metrik dashboard contoh">
                    {mockupMetrics.map((metric, index) => (
                        <div
                          key={metric.label}
                          className={cn("ledger-row min-w-0 rounded-lg border px-3 py-3", toneStyles[metric.tone])}
                          style={stagger(index)}
                        >
                        <span className="block break-words text-[11px] font-semibold">{metric.label}</span>
                        <div className="mt-1 break-words font-mono text-sm font-semibold text-wood-900">{metric.value}</div>
                      </div>
                    ))}
                  </div>

                  <div className="min-w-0 rounded-lg bg-cream-50 p-4 text-wood-900" aria-hidden="true">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-wood-500" />
                        <span className="text-xs font-semibold text-wood-700">Transaksi Terakhir</span>
                      </div>
                      <span className="rounded-full bg-wood-100 px-2 py-0.5 text-[11px] font-medium text-wood-700">
                        Otomatis
                      </span>
                    </div>

                    <div className="space-y-2">
                      {mockupTransactions.map((tx, index) => (
                        <div
                          key={tx.desc}
                          className="ledger-row flex min-w-0 flex-col gap-1 rounded-md bg-cream-100 px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
                          style={stagger(index)}
                        >
                          <span className="block min-w-0">
                            <span className={cn("mr-2 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold", toneStyles[tx.tone])}>
                              {tx.side}
                            </span>
                            <span className="break-words text-xs text-wood-700">{tx.desc}</span>
                          </span>
                          <span className="self-end break-all font-mono text-[11px] font-semibold text-wood-900 sm:self-auto sm:text-xs">{tx.amount}</span>
                        </div>
                      ))}
                    </div>

                    <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                      <div className="ledger-flow-line h-px bg-leaf-300" style={stagger(0)} />
                      <span className="rounded-full bg-leaf-100 px-3 py-1 text-[11px] font-semibold text-leaf-700">
                        Debet = Kredit
                      </span>
                      <div className="ledger-flow-line h-px bg-leaf-300" style={stagger(1)} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="fitur" aria-labelledby="features-heading" className="bg-cream-50 py-16 sm:py-24">
          <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-4 sm:px-6 lg:grid-cols-[0.85fr_1.15fr] lg:px-8">
            <div>
              <h2 id="features-heading" className="text-2xl font-bold text-wood-900 sm:text-3xl">
                Yang dikerjakan manual, sekarang tersambung.
              </h2>
              <p className="mt-4 max-w-md text-base leading-relaxed text-wood-600">
                Satu transaksi menggerakkan jurnal, stok, dan laporan tanpa
                membuat pemilik bisnis memeriksa rumus spreadsheet.
              </p>
            </div>

            <div className="ledger-stagger overflow-hidden rounded-xl border border-wood-200 bg-surface-elevated">
              {features.map((feature, index) => (
                <div
                  key={feature.title}
                  className="grid gap-3 border-b border-wood-100 p-4 last:border-b-0 sm:grid-cols-[2.75rem_1fr_auto] sm:items-center sm:p-5"
                  style={stagger(index)}
                >
                  <div className={cn("flex h-11 w-11 items-center justify-center rounded-lg border", toneStyles[feature.tone])}>
                    <feature.icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="break-words text-sm font-semibold text-wood-900">{feature.title}</p>
                    <p className="mt-1 break-words text-sm text-wood-600">{feature.desc}</p>
                  </div>
                  <CheckCircle2 className="hidden h-5 w-5 text-leaf-600 sm:block" aria-hidden="true" />
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="keamanan" aria-label="Keamanan data" className="border-y border-wood-200 bg-cream-100 py-10">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="ledger-stagger grid grid-cols-1 gap-4 sm:grid-cols-3">
              {trustItems.map((item, index) => (
                <div key={item.label} className="flex items-center gap-3 rounded-lg bg-cream-50 px-4 py-3" style={stagger(index)}>
                  <item.icon className="h-5 w-5 shrink-0 text-leaf-600" />
                  <span className="break-words text-sm font-medium text-wood-700">{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section aria-label="Mulai gratis" className="bg-wood-800 py-16 sm:py-24">
          <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
            <div className="mx-auto mb-5 inline-flex items-center gap-2 rounded-full bg-leaf-100 px-3 py-1.5 text-xs font-semibold text-leaf-700">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Siap dari transaksi pertama
            </div>
            <h2 className="text-2xl font-bold text-cream-50 sm:text-3xl">
              Mulai dengan catatan yang bisa dipercaya.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-wood-200">
              Gratis. Tanpa kartu kredit. Bisa siap dalam 5 menit.
            </p>
            <div className="mt-8 flex justify-center">
              <Button as={Link} to="/register" variant="primary" size="lg" fullWidth className="sm:w-auto">
                Mulai Gratis
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer aria-label="Informasi footer" className="border-t border-wood-200 bg-cream-50">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start sm:justify-between">
            <Logo size="sm" variant="full" />
            <p className="break-words text-center text-xs text-wood-500 sm:text-right">
              &copy; {new Date().getFullYear()} Ledjer. Pembukuan UMKM Indonesia.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
