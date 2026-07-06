import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Calculator,
  Package,
  BarChart3,
  Shield,
  Eye,
  ChevronRight,
  CheckCircle2,
  Users,
  FileText,
  Wallet,
  Sparkles,
  BookOpen,
  Scale,
  TrendingUp,
  Building2,
  Database,
  ScrollText,
  Lock,
} from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Tone = "leaf" | "wood" | "honey" | "sky" | "clay";

const toneStyles: Record<Tone, string> = {
  leaf: "border-leaf-200 bg-leaf-50 text-leaf-700",
  wood: "border-wood-200 bg-wood-50 text-wood-700",
  honey: "border-honey-200 bg-honey-50 text-honey-700",
  sky: "border-sky-200 bg-sky-50 text-sky-700",
  clay: "border-clay-200 bg-clay-50 text-clay-700",
};

const features = [
  {
    icon: Calculator,
    title: "Jurnal otomatis",
    desc: "Debit-kredit seimbang dari setiap transaksi",
    tone: "leaf" as Tone,
  },
  {
    icon: FileText,
    title: "Transaksi harian",
    desc: "Penjualan, pembelian, transfer, beban, modal, dan prive",
    tone: "wood" as Tone,
  },
  {
    icon: Wallet,
    title: "Piutang & utang",
    desc: "Pantau pelanggan belum bayar dan tagihan pemasok",
    tone: "honey" as Tone,
  },
  {
    icon: Package,
    title: "Stok + HPP",
    desc: "Stok bergerak otomatis dengan HPP rata-rata tertimbang",
    tone: "sky" as Tone,
  },
  {
    icon: BarChart3,
    title: "Laporan keuangan",
    desc: "Buku besar, neraca saldo, laba rugi, dan neraca",
    tone: "clay" as Tone,
  },
  {
    icon: Users,
    title: "Akses pemilik & staf",
    desc: "Atur siapa yang boleh mencatat, melihat laporan, atau mengelola data",
    tone: "leaf" as Tone,
  },
  {
    icon: ScrollText,
    title: "Audit transaksi",
    desc: "Perubahan penting tercatat agar pembukuan mudah ditelusuri",
    tone: "wood" as Tone,
  },
  {
    icon: Sparkles,
    title: "Siap untuk UMKM",
    desc: "Akun awal dan alur sederhana untuk mulai mencatat lebih cepat",
    tone: "honey" as Tone,
  },
] as const;

const workflowSteps = [
  {
    icon: Building2,
    step: "01",
    title: "Buat bisnis",
    desc: "Isi nama usaha, tanggal mulai pembukuan, dan saldo awal kas/bank.",
  },
  {
    icon: FileText,
    step: "02",
    title: "Catat transaksi",
    desc: "Pilih jenis transaksi seperti penjualan, pembelian, piutang, utang, atau beban.",
  },
  {
    icon: BarChart3,
    step: "03",
    title: "Laporan siap",
    desc: "Ledjer membentuk jurnal, memperbarui stok, dan menyajikan laporan otomatis.",
  },
] as const;

const reportCards = [
  {
    icon: BookOpen,
    title: "Buku Besar",
    desc: "Lihat mutasi dan saldo berjalan per akun.",
    tone: "leaf" as Tone,
  },
  {
    icon: Scale,
    title: "Neraca Saldo",
    desc: "Pastikan total debit dan kredit tetap seimbang.",
    tone: "wood" as Tone,
  },
  {
    icon: TrendingUp,
    title: "Laba Rugi",
    desc: "Pantau pendapatan, HPP, beban, dan laba usaha.",
    tone: "honey" as Tone,
  },
  {
    icon: Building2,
    title: "Neraca",
    desc: "Lihat aset, utang, modal, dan posisi keuangan.",
    tone: "sky" as Tone,
  },
] as const;

const securityItems = [
  {
    icon: Database,
    label: "Data dipisah per bisnis",
    desc: "Setiap bisnis hanya bisa melihat datanya sendiri. Pemisahan ini dijaga di level database dengan Row Level Security.",
  },
  {
    icon: Shield,
    label: "Akses berbasis peran",
    desc: "Pemilik dan staf punya hak yang berbeda untuk mencatat dan mengelola.",
  },
  {
    icon: Eye,
    label: "Catatan audit transaksi",
    desc: "Aksi finansial penting tercatat dan bisa ditelusuri.",
  },
  {
    icon: Lock,
    label: "Keamanan Supabase",
    desc: "Koneksi dan penyimpanan data terlindungi dengan platform modern.",
  },
] as const;

const freeAccessHighlights = [
  {
    title: "Transaksi tanpa batas",
    desc: "Catat penjualan, pembelian, beban, modal, dan transfer tanpa cap bulanan.",
    tone: "leaf" as Tone,
  },
  {
    title: "Laporan utama aktif",
    desc: "Dashboard, buku besar, neraca saldo, laba rugi, dan neraca tersedia untuk operasional harian.",
    tone: "sky" as Tone,
  },
  {
    title: "Tim dan izin tersedia",
    desc: "Undang staf, atur akses, dan pantau aktivitas penting dari audit log.",
    tone: "honey" as Tone,
  },
  {
    title: "Stok dan HPP ikut terbuka",
    desc: "Kelola produk, pergerakan stok, dan HPP rata-rata tertimbang tanpa paket tambahan.",
    tone: "wood" as Tone,
  },
] as const;

const mockupMetrics = [
  { label: "Saldo Kas", value: "Rp 45.200.000", tone: "leaf" as Tone },
  { label: "Piutang", value: "Rp 12.500.000", tone: "honey" as Tone },
  { label: "Stok", value: "184 unit", tone: "wood" as Tone },
  { label: "Laba bulan ini", value: "Rp 8.350.000", tone: "sky" as Tone },
] as const;

const mockupTransactions = [
  { desc: "Penjualan", amount: "Rp 8.500.000", tone: "leaf" as Tone },
  { desc: "Terima Piutang", amount: "Rp 2.300.000", tone: "honey" as Tone },
  { desc: "Pembelian", amount: "Rp 3.200.000", tone: "clay" as Tone },
  { desc: "Bayar Beban", amount: "Rp 750.000", tone: "wood" as Tone },
] as const;

const navLinks = [
  { label: "Fitur", href: "#fitur" },
  { label: "Cara kerja", href: "#cara-kerja" },
  { label: "Laporan", href: "#laporan" },
  { label: "Keamanan", href: "#keamanan" },
  { label: "Harga", href: "#harga" },
] as const;

const footerLinks = [
  { label: "Fitur", href: "#fitur" },
  { label: "Laporan", href: "#laporan" },
  { label: "Keamanan", href: "#keamanan" },
  { label: "Harga", href: "#harga" },
  { label: "Masuk", to: "/login" as const },
  { label: "Mulai Gratis", to: "/register" as const },
] as const;

const legalLinks = [
  { label: "Syarat & Ketentuan", to: "/terms" as const },
  { label: "Kebijakan Privasi", to: "/privacy" as const },
  { label: "Kebijakan Pengembalian", to: "/refund" as const },
  { label: "Keamanan", to: "/security" as const },
  { label: "Hubungi Kami", to: "/contact" as const },
] as const;

function stagger(index: number) {
  return { "--i": index } as CSSProperties;
}

export function LandingPage() {
  return (
    <div className="ledger-min-dvh overflow-x-hidden scroll-smooth motion-reduce:scroll-auto bg-cream-50">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-tooltip focus:rounded-lg focus:bg-wood-500 focus:px-4 focus:py-2 focus:text-sm focus:text-cream-50 focus:shadow-lg"
      >
        Lewati ke konten utama
      </a>

      <header className="sticky top-0 z-sticky border-b border-wood-200 bg-cream-50/95 backdrop-blur-sm">
        <nav
          aria-label="Navigasi utama"
          className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8"
        >
          <Link to="/" aria-label="Ledjer beranda">
            <Logo size="sm" variant="full" />
          </Link>

          <div className="hidden items-center gap-1 md:flex">
            {navLinks.map((link) => (
              <Button key={link.href} as="a" variant="ghost" size="sm" href={link.href}>
                {link.label}
              </Button>
            ))}
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <Button
              as={Link}
              to="/login"
              variant="ghost"
              size="sm"
              className="hidden sm:inline-flex"
            >
              Masuk
            </Button>
            <Button as={Link} to="/register" variant="primary" size="sm">
              <span className="sm:hidden">Mulai</span>
              <span className="hidden sm:inline">Mulai Gratis</span>
            </Button>
          </div>
        </nav>

        <div className="md:hidden border-t border-wood-100 bg-cream-50/95">
          <nav
            aria-label="Navigasi bagian"
            className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 py-2 text-xs"
          >
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="shrink-0 rounded-full px-3 py-1.5 font-medium text-wood-700 hover:bg-cream-100"
              >
                {link.label}
              </a>
            ))}
          </nav>
        </div>
      </header>

      <main id="main-content">
        <section
          aria-labelledby="hero-heading"
          className="landing-ledger relative overflow-hidden border-b border-wood-100"
        >
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
                  className="max-w-[10ch] text-balance text-[clamp(2.75rem,10vw,5.25rem)] font-bold leading-[0.98] tracking-[-0.03em] text-wood-900 sm:max-w-[11ch]"
                  style={stagger(1)}
                >
                  Uang masuk keluar jelas.
                </h1>
                <p
                  className="mt-6 max-w-xl text-pretty text-base leading-relaxed text-wood-700 sm:text-lg"
                  style={stagger(2)}
                >
                  Catat penjualan, pembelian, piutang, utang, stok, dan modal.
                  Ledjer otomatis membentuk jurnal, HPP, dan laporan keuangan
                  untuk UMKM.
                </p>

                <div
                  className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4"
                  style={stagger(3)}
                >
                  <Button
                    as={Link}
                    to="/register"
                    variant="primary"
                    size="lg"
                    fullWidth
                    className="group sm:w-auto"
                  >
                    Mulai Gratis
                    <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none" />
                  </Button>
                  <a
                    href="#cara-kerja"
                    className="ledger-cta-link text-sm font-medium text-wood-700 underline-offset-4 transition-colors hover:text-wood-900 hover:underline"
                  >
                    Lihat cara kerja
                  </a>
                </div>
              </div>

              <div
                className="relative min-w-0"
                role="img"
                aria-label="Contoh dashboard Ledjer yang menyeimbangkan jurnal otomatis"
              >
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

                  <div
                    className="grid grid-cols-2 gap-3 py-4"
                    role="group"
                    aria-label="Metrik dashboard contoh"
                  >
                    {mockupMetrics.map((metric, index) => (
                      <div
                        key={metric.label}
                        className={cn(
                          "ledger-row min-w-0 rounded-lg border px-3 py-3 font-mono [font-feature-settings:\"tnum\",\"ss01\"]",
                          toneStyles[metric.tone]
                        )}
                        style={stagger(index)}
                      >
                        <span className="block break-words text-[11px] font-semibold tracking-wide uppercase">
                          {metric.label}
                        </span>
                        <div className="mt-1 break-words text-sm font-semibold tabular-nums text-wood-900">
                          {metric.value}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div
                    className="min-w-0 rounded-lg bg-cream-50 p-4 text-wood-900"
                    aria-hidden="true"
                  >
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-wood-500" />
                        <span className="text-xs font-semibold text-wood-700">
                          Transaksi Terakhir
                        </span>
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
                          <span
                            className={cn(
                              "mr-2 inline-flex shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide",
                              toneStyles[tx.tone]
                            )}
                          >
                            {tx.desc}
                          </span>
                          <span className="break-all font-mono text-[11px] font-semibold tabular-nums text-wood-900 sm:text-xs">
                            {tx.amount}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                      <div
                        className="ledger-flow-line ledger-flow-line--left h-px bg-leaf-300"
                        style={stagger(0)}
                      />
                      <span className="ledger-balance-pill rounded-full bg-leaf-100 px-3 py-1 text-[11px] font-semibold tracking-wide text-leaf-700">
                        Debet = Kredit
                      </span>
                      <div
                        className="ledger-flow-line ledger-flow-line--right h-px bg-leaf-300"
                        style={stagger(1)}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section
          id="fitur"
          aria-labelledby="features-heading"
          className="bg-cream-50 py-16 sm:py-24"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-2xl">
              <h2
                id="features-heading"
                className="text-balance text-2xl font-bold tracking-[-0.02em] text-wood-900 sm:text-3xl"
              >
                Yang dikerjakan manual, sekarang tersambung.
              </h2>
              <p className="mt-4 max-w-[60ch] text-pretty text-base leading-relaxed text-wood-600">
                Satu transaksi menggerakkan jurnal, stok, piutang, utang, dan
                laporan tanpa membuat pemilik bisnis memeriksa rumus spreadsheet.
              </p>
            </div>

            <ul
              role="list"
              className="ledger-stagger mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
            >
              {features.map((feature, index) => (
                <li
                  key={feature.title}
                  className="ledger-interactive group flex h-full flex-col gap-3 rounded-xl border border-wood-200 bg-surface-elevated p-5"
                  style={stagger(index)}
                >
                  <div
                    className={cn(
                      "flex h-11 w-11 items-center justify-center rounded-lg border transition-transform duration-200 group-hover:scale-105 motion-reduce:transition-none",
                      toneStyles[feature.tone]
                    )}
                    aria-hidden="true"
                  >
                    <feature.icon className="h-5 w-5" />
                  </div>
                  <p className="break-words text-sm font-semibold tracking-[-0.005em] text-wood-900">
                    {feature.title}
                  </p>
                  <p className="break-words text-sm leading-relaxed text-wood-600">
                    {feature.desc}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section
          id="cara-kerja"
          aria-labelledby="how-heading"
          className="border-y border-wood-200 bg-cream-100 py-16 sm:py-24"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-2xl">
              <h2
                id="how-heading"
                className="text-balance text-2xl font-bold tracking-[-0.02em] text-wood-900 sm:text-3xl"
              >
                Cara kerja Ledjer.
              </h2>
              <p className="mt-4 max-w-[58ch] text-pretty text-base leading-relaxed text-wood-600">
                Tiga langkah sederhana untuk mulai mencatat transaksi UMKM
                tanpa rumus akuntansi.
              </p>
            </div>

            <ol
              role="list"
              className="ledger-stagger mt-10 grid grid-cols-1 gap-4 md:grid-cols-3"
            >
              {workflowSteps.map((step, index) => (
                <li
                  key={step.title}
                  className="ledger-interactive flex h-full flex-col gap-4 rounded-xl border border-wood-200 bg-cream-50 p-6"
                  style={stagger(index)}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-wood-500 font-mono text-sm font-semibold tabular-nums tracking-tight text-cream-50"
                      aria-hidden="true"
                    >
                      {step.step}
                    </span>
                    <step.icon
                      className="h-6 w-6 text-wood-500"
                      aria-hidden="true"
                    />
                  </div>
                  <p className="break-words text-base font-semibold tracking-[-0.01em] text-wood-900">
                    {step.title}
                  </p>
                  <p className="break-words text-sm leading-relaxed text-wood-600">
                    {step.desc}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section
          id="laporan"
          aria-labelledby="reports-heading"
          className="bg-cream-50 py-16 sm:py-24"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-2xl">
              <h2
                id="reports-heading"
                className="text-balance text-2xl font-bold tracking-[-0.02em] text-wood-900 sm:text-3xl"
              >
                4 laporan utama, otomatis.
              </h2>
              <p className="mt-4 max-w-[60ch] text-pretty text-base leading-relaxed text-wood-600">
                Setiap transaksi yang dicatat akan langsung tersaji di laporan
                yang umum dipakai UMKM.
              </p>
            </div>

            <ul
              role="list"
              className="ledger-stagger mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
            >
              {reportCards.map((report, index) => (
                <li
                  key={report.title}
                  className="ledger-interactive flex h-full flex-col gap-3 rounded-xl border border-wood-200 bg-surface-elevated p-5"
                  style={stagger(index)}
                >
                  <div
                    className={cn(
                      "flex h-11 w-11 items-center justify-center rounded-lg border",
                      toneStyles[report.tone]
                    )}
                    aria-hidden="true"
                  >
                    <report.icon className="h-5 w-5" />
                  </div>
                  <p className="break-words text-sm font-semibold tracking-[-0.005em] text-wood-900">
                    {report.title}
                  </p>
                  <p className="break-words text-sm leading-relaxed text-wood-600">
                    {report.desc}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section
          id="keamanan"
          aria-labelledby="security-heading"
          className="border-y border-wood-200 bg-cream-100 py-16 sm:py-24"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-2xl">
              <h2
                id="security-heading"
                className="text-balance text-2xl font-bold tracking-[-0.02em] text-wood-900 sm:text-3xl"
              >
                Data bisnis Anda aman.
              </h2>
              <p className="mt-4 max-w-[60ch] text-pretty text-base leading-relaxed text-wood-600">
                Ledjer memisahkan data tiap usaha dan membatasi akses sesuai
                peran, sehingga catatan keuangan tetap privat dan telusur.
              </p>
            </div>

            <ul
              role="list"
              className="ledger-stagger mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2"
            >
              {securityItems.map((item, index) => (
                <li
                  key={item.label}
                  className="ledger-interactive flex h-full items-start gap-3 rounded-xl border border-wood-200 bg-cream-50 p-5"
                  style={stagger(index)}
                >
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-leaf-50 text-leaf-600"
                    aria-hidden="true"
                  >
                    <item.icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="break-words text-sm font-semibold tracking-[-0.005em] text-wood-900">
                      {item.label}
                    </p>
                    <p className="mt-1 break-words text-sm leading-relaxed text-wood-600">
                      {item.desc}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section
          id="akses"
          aria-labelledby="access-heading"
          className="bg-cream-50 py-16 sm:py-24"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl">
              <h2
                id="access-heading"
                className="text-balance text-2xl font-bold tracking-[-0.02em] text-wood-900 sm:text-3xl"
              >
                Ledjer gratis digunakan untuk sementara.
              </h2>
              <p className="mt-4 max-w-[60ch] text-pretty text-base leading-relaxed text-wood-600">
                Tidak ada kartu, tidak ada biaya aplikasi, dan tidak ada batas transaksi.
                Fitur operasional inti dibuka agar pembukuan bisa langsung berjalan.
              </p>
            </div>

            <ul
              role="list"
              className="ledger-stagger mt-10 grid grid-cols-1 gap-4 md:grid-cols-2"
            >
              {freeAccessHighlights.map((item, index) => (
                <li
                  key={item.title}
                  className="ledger-interactive flex h-full flex-col gap-3 rounded-xl border border-wood-200 bg-surface-elevated p-6"
                  style={stagger(index)}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={cn(
                        "mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border",
                        toneStyles[item.tone]
                      )}
                    >
                      <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <div>
                      <p className="break-words text-sm font-semibold text-wood-900">
                        {item.title}
                      </p>
                      <p className="mt-1 break-words text-sm leading-relaxed text-wood-600">
                        {item.desc}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section aria-labelledby="cta-heading" className="bg-wood-800 py-16 sm:py-24">
          <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
            <div className="mx-auto mb-5 inline-flex items-center gap-2 rounded-full bg-leaf-100 px-3 py-1.5 text-xs font-semibold text-leaf-700">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Siap dari transaksi pertama
            </div>
            <h2
              id="cta-heading"
              className="text-balance text-2xl font-bold tracking-[-0.02em] text-cream-50 sm:text-3xl"
            >
              Mulai rapikan pembukuan dari transaksi pertama.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-pretty text-base leading-relaxed text-wood-200">
              Tidak perlu rumus spreadsheet. Catat transaksi, Ledjer bantu
              susun jurnal, stok, dan laporan.
            </p>
            <div className="mt-8 flex justify-center">
              <Button
                as={Link}
                to="/register"
                variant="primary"
                size="lg"
                fullWidth
                className="sm:w-auto"
              >
                Mulai Gratis
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer aria-label="Informasi footer" className="border-t border-wood-200 bg-cream-50">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-[1fr_2fr]">
            <div className="flex flex-col items-start gap-3">
              <Logo size="sm" variant="full" />
              <p className="break-words text-sm text-wood-600">
                Pembukuan UMKM Indonesia yang sederhana, rapi, dan bisa dipercaya.
              </p>
            </div>
            <nav aria-label="Tautan footer">
              <ul
                role="list"
                className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3"
              >
                {footerLinks.map((link) =>
                  "to" in link ? (
                    <li key={link.label}>
                      <Link
                        to={link.to}
                        className="text-wood-700 underline-offset-4 transition-colors hover:text-wood-900 hover:underline"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ) : (
                    <li key={link.label}>
                      <a
                        href={link.href}
                        className="text-wood-700 underline-offset-4 transition-colors hover:text-wood-900 hover:underline"
                      >
                        {link.label}
                      </a>
                    </li>
                  )
                )}
              </ul>
            </nav>
          </div>
          <p className="mt-8 border-t border-wood-100 pt-6 text-center text-xs text-wood-500">
            &copy; {new Date().getFullYear()} Ledjer. Pembukuan UMKM Indonesia.
          </p>
          <nav aria-label="Tautan legal" className="mt-4">
            <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-wood-500">
              {legalLinks.map((link) => (
                <li key={link.label}>
                  <Link
                    to={link.to}
                    className="text-wood-500 underline-offset-4 transition-colors hover:text-wood-700 hover:underline"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </footer>
    </div>
  );
}
