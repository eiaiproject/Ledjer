import { Link } from "react-router-dom";
import {
  BookOpen,
  ArrowRight,
  FileText,
  Calculator,
  Package,
  BarChart3,
  Users,
  Shield,
  Lock,
  ClipboardList,
  Eye,
  CheckCircle2,
  TrendingUp,
  Receipt,
  Wallet,
  ChevronRight,
  Zap,
  Scale,
  Activity,
} from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { cn } from "@/lib/utils";

/* ── Feature data ── */
const features = [
  {
    icon: FileText,
    title: "Pencatatan Transaksi",
    desc: "Catat penjualan kas, kredit, pembelian, beban, modal, dan penarikan — semua jenis transaksi UMKM dalam satu tempat.",
  },
  {
    icon: Calculator,
    title: "Jurnal Otomatis",
    desc: "Setiap transaksi langsung menghasilkan jurnal berpasangan yang seimbang — tidak perlu input manual ke buku besar.",
  },
  {
    icon: Package,
    title: "Manajemen Stok",
    desc: "Kelola produk, pantau pergerakan stok, dan hitung HPP otomatis saat terjadi transaksi pembelian atau penjualan.",
  },
  {
    icon: BarChart3,
    title: "Laporan Keuangan",
    desc: "Buku besar, neraca saldo, laba rugi, dan neraca tersedia real-time — kapan pun Anda butuh untuk pengambilan keputusan.",
  },
  {
    icon: Users,
    title: "Hak Akses Tim",
    desc: "Buat tim dengan peran pemilik dan staf. Atur siapa yang bisa lihat, catat, atau ubah data keuangan bisnis.",
  },
  {
    icon: Shield,
    title: "Keamanan Data",
    desc: "Enkripsi data, role-based access, dan audit log menjaga informasi keuangan Anda tetap aman dan terlindungi.",
  },
] as const;

/* ── Workflow steps ── */
const steps = [
  {
    icon: ClipboardList,
    title: "Pilih jenis transaksi",
    desc: "Penjualan, pembelian, beban, modal, atau transfer kas — sesuai kebutuhan bisnis Anda.",
  },
  {
    icon: FileText,
    title: "Isi detail sekali",
    desc: "Tanggal, nominal, pihak, akun kas atau bank, dan produk bila diperlukan.",
  },
  {
    icon: Eye,
    title: "Pantau dampaknya",
    desc: "Jurnal, stok, dan laporan keuangan langsung diperbarui secara otomatis.",
  },
] as const;

/* ── Security items ── */
const securityItems = [
  {
    icon: Lock,
    title: "Autentikasi Terenkripsi",
    desc: "Login terlindungi enkripsi sehingga hanya Anda yang bisa mengakses data bisnis.",
  },
  {
    icon: Users,
    title: "Role-Based Access",
    desc: "Tentukan hak akses pemilik, admin, atau staf sesuai kebutuhan operasional.",
  },
  {
    icon: Eye,
    title: "Audit Log",
    desc: "Setiap perubahan data tercatat — Anda bisa mengecek siapa yang mengubah apa dan kapan.",
  },
  {
    icon: Shield,
    title: "Row-Level Security",
    desc: "Data hanya bisa diakses oleh pengguna yang memang berhak, tidak ada akses silang.",
  },
] as const;

/* ── Proof stats ── */
const proofStats = [
  { icon: Zap, value: "8+", label: "Jenis transaksi" },
  { icon: Scale, value: "2 sisi", label: "Jurnal otomatis" },
  { icon: Activity, value: "Real-time", label: "Laporan keuangan" },
] as const;

/* ── Mockup data ── */
const mockupMetrics = [
  { label: "Saldo Kas", value: "Rp 45.200.000", icon: Wallet, color: "bg-leaf-100 text-leaf-700" },
  { label: "Pendapatan", value: "Rp 128.500.000", icon: TrendingUp, color: "bg-sky-100 text-sky-700" },
  { label: "Beban", value: "Rp 32.750.000", icon: Receipt, color: "bg-clay-100 text-clay-700" },
  { label: "Laba/Rugi", value: "Rp 95.750.000", icon: BarChart3, color: "bg-honey-100 text-honey-700" },
] as const;

const mockupTransactions = [
  { date: "19 Jun", desc: "Penjualan Toko Online", debit: "Rp 8.500.000", credit: "" },
  { date: "18 Jun", desc: "Pembelian Bahan Baku", debit: "", credit: "Rp 3.200.000" },
  { date: "17 Jun", desc: "Pembayaran Utang Dagang", debit: "", credit: "Rp 5.000.000" },
  { date: "16 Jun", desc: "Pemasukan Modal Awal", debit: "Rp 15.000.000", credit: "" },
] as const;

/* ── Reusable button styles ── */
const btnBase =
  "inline-flex items-center justify-center font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wood-500";

const btnPrimaryMobileFull = cn(
  btnBase,
  "bg-wood-500 text-cream-50 hover:bg-wood-600 active:bg-wood-700 shadow-sm h-12 px-6 text-base gap-2 rounded-lg w-full sm:w-auto",
);

const btnSecondaryMobileFull = cn(
  btnBase,
  "border border-wood-300 text-wood-700 hover:bg-cream-100 active:bg-cream-200 h-12 px-6 text-base gap-2 rounded-lg w-full sm:w-auto",
);

const btnGhost = cn(
  btnBase,
  "text-wood-600 hover:bg-cream-100 active:bg-cream-200 h-8 px-3 text-sm gap-1.5 rounded-md",
);

const btnGhostSmall = cn(
  btnBase,
  "bg-wood-500 text-cream-50 hover:bg-wood-600 active:bg-wood-700 shadow-sm h-8 px-3 text-sm gap-1.5 rounded-md",
);

const btnOutlineDark = cn(
  btnBase,
  "border border-wood-500 text-cream-100 hover:bg-wood-700 h-12 px-6 text-base gap-2 rounded-lg",
);

/* ── Main Component ── */
export function LandingPage() {
  return (
    <div className="min-h-screen scroll-smooth motion-reduce:scroll-auto bg-cream-50">
      {/* ─── Skip Link ─── */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[2000] focus:rounded-lg focus:bg-wood-500 focus:px-4 focus:py-2 focus:text-sm focus:text-cream-50 focus:shadow-lg"
      >
        Lewati ke konten utama
      </a>

      {/* ─── Navigation ─── */}
      <header className="sticky top-0 z-[1000] border-b border-wood-200 bg-cream-50/95 backdrop-blur-sm">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <Logo size="sm" variant="full" tone="dark" />

          {/* Desktop anchor links */}
          <div className="hidden items-center gap-1 md:flex">
            <a href="#fitur" className={btnGhost}>
              Fitur
            </a>
            <a href="#cara-kerja" className={btnGhost}>
              Cara kerja
            </a>
            <a href="#keamanan" className={btnGhost}>
              Keamanan
            </a>
          </div>

          <div className="flex items-center gap-3">
            <Link to="/login" className={btnGhost}>
              Masuk
            </Link>
            <Link to="/register" className={btnGhostSmall}>
              Mulai Gratis
            </Link>
          </div>
        </nav>
      </header>

      <main id="main-content">
        {/* ─── Hero ─── */}
        <section className="relative overflow-hidden bg-cream-100">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8 lg:py-32">
            <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
              {/* Text */}
              <div>
                {/* Badge */}
                <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-wood-200 bg-cream-50 px-3 py-1 text-xs font-medium text-wood-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-leaf-500" />
                  Pembukuan UMKM &bull; Jurnal otomatis &bull; Laporan real-time
                </div>

                {/* H1 */}
                <h1 className="text-3xl font-bold leading-tight text-wood-900 sm:text-4xl lg:text-[2.75rem]">
                  Catat keuangan bisnis tanpa spreadsheet berantakan
                </h1>
                <p className="mt-5 text-base leading-relaxed text-wood-600 sm:text-lg">
                  Ledjer membantu UMKM mencatat transaksi, menjalankan jurnal otomatis, dan
                  membaca laporan keuangan — semuanya dalam satu aplikasi yang dirancang untuk
                  operasional di Indonesia.
                </p>

                {/* CTA Group */}
                <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                  <Link to="/register" className={btnPrimaryMobileFull}>
                    Mulai Gratis
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  <a href="#cara-kerja" className={btnSecondaryMobileFull}>
                    Lihat Cara Kerja
                  </a>
                </div>

                {/* Trust microcopy */}
                <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-wood-500">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-leaf-500" />
                    Tanpa kartu kredit
                  </span>
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-leaf-500" />
                    Gratis untuk mulai
                  </span>
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-leaf-500" />
                    Cocok untuk UMKM Indonesia
                  </span>
                </div>

                {/* Proof stats */}
                <div className="mt-8 flex flex-wrap items-center gap-6 border-t border-wood-200 pt-6">
                  {proofStats.map((stat) => (
                    <div key={stat.label} className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-leaf-50 text-leaf-600">
                        <stat.icon className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-wood-800">{stat.value}</div>
                        <div className="text-xs text-wood-500">{stat.label}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Product Mockup */}
              <div className="relative">
                {/* Status chip */}
                <div className="absolute -top-3 left-6 z-10 flex items-center gap-1.5 rounded-full border border-leaf-200 bg-cream-50 px-3 py-1 text-xs font-medium text-leaf-700 shadow-sm">
                  <span className="h-1.5 w-1.5 rounded-full bg-leaf-500" />
                  Dashboard ringkas
                </div>

                <div className="overflow-hidden rounded-xl border border-wood-200 bg-surface-elevated shadow-lg">
                  {/* Mockup Header */}
                  <div className="flex items-center gap-3 border-b border-wood-100 bg-cream-50 px-5 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full bg-clay-400" />
                      <div className="h-3 w-3 rounded-full bg-honey-400" />
                      <div className="h-3 w-3 rounded-full bg-leaf-400" />
                    </div>
                    <div className="flex-1 text-center text-xs font-medium text-wood-400">
                      Ledjer — Dashboard
                    </div>
                    <div className="h-4 w-4 rounded bg-wood-200" />
                  </div>

                  {/* Mockup Metrics */}
                  <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4 sm:p-5">
                    {mockupMetrics.map((m) => (
                      <div
                        key={m.label}
                        className="rounded-lg border border-wood-100 bg-cream-50 p-3"
                      >
                        <div className="flex items-center gap-2">
                          <div className={`rounded-md p-1.5 ${m.color}`}>
                            <m.icon className="h-3.5 w-3.5" />
                          </div>
                          <span className="truncate text-[11px] font-medium text-wood-500">
                            {m.label}
                          </span>
                        </div>
                        <div className="mt-2 font-mono text-sm font-semibold text-wood-800">
                          {m.value}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Mockup Table */}
                  <div className="border-t border-wood-100 px-5 py-4">
                    <div className="mb-3 flex items-center gap-2">
                      <FileText className="h-4 w-4 text-wood-500" />
                      <span className="text-xs font-semibold text-wood-700">
                        Jurnal Otomatis
                      </span>
                      <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-leaf-50 px-2 py-0.5 text-[10px] font-medium text-leaf-700">
                        <Scale className="h-3 w-3" />
                        Seimbang
                      </span>
                    </div>
                    <div className="space-y-2">
                      {mockupTransactions.map((tx) => (
                        <div
                          key={tx.date + tx.desc}
                          className="flex items-center gap-3 rounded-lg bg-cream-50 px-3 py-2"
                        >
                          <span className="w-10 text-[11px] text-wood-400">{tx.date}</span>
                          <span className="flex-1 truncate text-xs text-wood-700">
                            {tx.desc}
                          </span>
                          <span className="font-mono text-xs font-medium text-wood-800">
                            {tx.debit || tx.credit}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Jurnal detail mini panel */}
                  <div className="border-t border-wood-100 bg-cream-50/50 px-5 py-3">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-leaf-600" />
                      <span className="text-[11px] text-wood-600">
                        Jurnal otomatis seimbang &mdash; debit dan kredit langsung terbentuk
                      </span>
                    </div>
                  </div>
                </div>

                {/* Decorative accent */}
                <div className="pointer-events-none absolute -right-4 -top-4 h-24 w-24 rounded-full bg-leaf-200/30 blur-2xl" />
                <div className="pointer-events-none absolute -bottom-4 -left-4 h-20 w-20 rounded-full bg-honey-200/30 blur-2xl" />
              </div>
            </div>
          </div>
        </section>

        {/* ─── Features ─── */}
        <section id="fitur" className="bg-cream-50 py-16 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-2xl font-bold text-wood-900 sm:text-3xl">
                Fitur yang dibutuhkan UMKM
              </h2>
              <p className="mt-3 text-base text-wood-500">
                Semua kebutuhan pembukuan dalam satu aplikasi yang mudah digunakan.
              </p>
            </div>

            <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((f) => (
                <div
                  key={f.title}
                  className="group rounded-xl border border-wood-200 bg-surface-elevated p-6 transition-all hover:border-wood-300 hover:shadow-md focus-within:shadow-md"
                  tabIndex={0}
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-wood-100 text-wood-600 transition-colors group-hover:bg-wood-200">
                    <f.icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-base font-semibold text-wood-800">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-wood-500">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── Workflow ─── */}
        <section id="cara-kerja" className="bg-wood-700 py-16 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-2xl font-bold text-cream-50 sm:text-3xl">
                Tiga langkah sederhana
              </h2>
              <p className="mt-3 text-base text-wood-200">
                Mulai mencatat pembukuan dalam hitungan menit.
              </p>
            </div>

            <div className="mt-12 grid gap-8 sm:grid-cols-3">
              {steps.map((s, i) => (
                <div key={s.title} className="relative text-center">
                  {i < steps.length - 1 && (
                    <div className="absolute left-[calc(50%+40px)] top-6 hidden w-[calc(100%-80px)] border-t-2 border-dashed border-wood-500 sm:block" />
                  )}
                  <div className="relative mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-wood-600 text-leaf-300">
                    <s.icon className="h-7 w-7" />
                    <span className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-honey-500 text-xs font-bold text-wood-900">
                      {i + 1}
                    </span>
                  </div>
                  <h3 className="mt-5 text-lg font-semibold text-cream-50">{s.title}</h3>
                  <p className="mt-2 text-sm text-wood-300">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── Trust / Security ─── */}
        <section id="keamanan" className="bg-cream-50 py-16 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-2xl font-bold text-wood-900 sm:text-3xl">
                Kendali penuh atas data keuangan
              </h2>
              <p className="mt-3 text-base text-wood-500">
                Ketika Anda memiliki staf atau admin yang mengakses data bisnis, penting untuk
                memastikan hanya orang yang tepat yang bisa melihat dan mengubah informasi
                keuangan.
              </p>
            </div>

            <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {securityItems.map((item) => (
                <div
                  key={item.title}
                  className="rounded-xl border border-wood-200 bg-surface-elevated p-6 text-center transition-all hover:border-wood-300 hover:shadow-md"
                >
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-leaf-50 text-leaf-600">
                    <item.icon className="h-6 w-6" />
                  </div>
                  <h3 className="mt-4 text-base font-semibold text-wood-800">{item.title}</h3>
                  <p className="mt-2 text-sm text-wood-500">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── Final CTA ─── */}
        <section className="bg-wood-800 py-16 sm:py-24">
          <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
            <h2 className="text-2xl font-bold text-cream-50 sm:text-3xl">
              Siap mulai pembukuan yang rapi?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-base text-wood-300">
              Daftar gratis dan mulai mencatat transaksi bisnis Anda hari ini. Tanpa kartu
              kredit. Bisa mulai dari transaksi pertama.
            </p>
            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center sm:gap-4">
              <Link to="/register" className={btnPrimaryMobileFull}>
                Mulai Gratis
                <ChevronRight className="h-4 w-4" />
              </Link>
              <Link to="/login" className={cn(btnOutlineDark, "w-full sm:w-auto")}>
                Masuk
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* ─── Footer ─── */}
      <footer className="border-t border-wood-200 bg-cream-50">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start sm:justify-between">
            {/* Brand */}
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-leaf-500" />
              <span className="text-sm font-medium text-wood-600">Ledjer</span>
            </div>

            {/* Footer nav links */}
            <div className="flex flex-wrap items-center justify-center gap-4 text-sm text-wood-500">
              <a
                href="#fitur"
                className="transition-colors hover:text-wood-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wood-500"
              >
                Fitur
              </a>
              <a
                href="#cara-kerja"
                className="transition-colors hover:text-wood-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wood-500"
              >
                Cara kerja
              </a>
              <a
                href="#keamanan"
                className="transition-colors hover:text-wood-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wood-500"
              >
                Keamanan
              </a>
            </div>

            {/* Copyright */}
            <p className="text-xs text-wood-400">
              &copy; {new Date().getFullYear()} Ledjer. Pembukuan UMKM Indonesia.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
