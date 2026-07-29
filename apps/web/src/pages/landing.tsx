import { useState, useEffect, useRef, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Package,
  Chart,
  ChevronRight,
  CheckCircle,
  Users,
  FileText,
  Wallet,
  BookOpen,
  Scale,
  TrendUp,
  Building2,
  Shield,
  Store,
  ForkKnife,
  Handshake,
  Truck,
} from "reicon-react";
import { Logo } from "@/components/ui/logo";
import { Button } from "@/components/ui/button";
import { SupportLink } from "@/components/ui/support-link";
import { cn } from "@/lib/utils";

/* ===========================================================
   TYPES & CONSTANTS
   =========================================================== */

type Tone = "leaf" | "wood" | "honey" | "sky" | "clay";

const toneStyles: Record<Tone, string> = {
  leaf: "border-leaf-200 bg-leaf-50 text-leaf-700",
  wood: "border-wood-200 bg-wood-50 text-wood-700",
  honey: "border-honey-200 bg-honey-50 text-honey-700",
  sky: "border-sky-200 bg-sky-50 text-sky-700",
  clay: "border-clay-200 bg-clay-50 text-clay-700",
};

/* ===========================================================
   NAVIGATION DATA
   =========================================================== */

const navLinks = [
  { label: "Fitur", href: "#fitur" },
  { label: "Cara Kerja", href: "#cara-kerja" },
  { label: "Laporan", href: "#laporan" },
  { label: "Akses", href: "#akses" },
  { label: "Keamanan", href: "#keamanan" },
] as const;

const footerLinks = [
  { label: "Fitur", href: "#fitur" },
  { label: "Laporan", href: "#laporan" },
  { label: "Keamanan", href: "#keamanan" },
  { label: "Masuk", to: "/login" as const },
  { label: "Mulai Gratis", to: "/register" as const },
] as const;

const legalLinks = [
  { label: "Syarat & Ketentuan", to: "/terms" as const },
  { label: "Kebijakan Privasi", to: "/privacy" as const },
  { label: "Kebijakan Layanan", to: "/refund" as const },
  { label: "Keamanan", to: "/security" as const },
  { label: "Hubungi Kami", to: "/contact" as const },
] as const;

/* ===========================================================
   HELPER: stagger animation delay
   =========================================================== */

function stagger(index: number) {
  return { "--i": index } as CSSProperties;
}

/* ===========================================================
   SECTION: One-Transaction Demonstration
   =========================================================== */

const demoRows = [
  { label: "Kas bertambah", detail: "+Rp500.000", tone: "leaf" as Tone },
  { label: "Pendapatan tercatat", detail: "+Rp500.000", tone: "sky" as Tone },
  { label: "Stok berkurang", detail: "−2 produk", tone: "wood" as Tone },
  { label: "Laba kotor", detail: "Rp180.000", tone: "honey" as Tone },
] as const;

const demoDetailRows = [
  { label: "HPP tercatat", detail: "Rp320.000", tone: "clay" as Tone },
  { label: "Jurnal", detail: "Otomatis", tone: "honey" as Tone },
  { label: "Status", detail: "Debit = Kredit", tone: "leaf" as Tone },
] as const;

/* ===========================================================
   SECTION: Four user-outcome benefits
   =========================================================== */

const benefits = [
  {
    icon: TrendUp,
    title: "Tahu laba usaha",
    desc: "Pendapatan, HPP, dan laba tersusun otomatis.",
    tone: "leaf" as Tone,
  },
  {
    icon: Package,
    title: "Pantau stok",
    desc: "Stok berubah saat barang dibeli atau dijual.",
    tone: "wood" as Tone,
  },
  {
    icon: Wallet,
    title: "Ingat piutang & utang",
    desc: "Pantau pelanggan dan tagihan pemasok.",
    tone: "honey" as Tone,
  },
  {
    icon: Users,
    title: "Atur akses staf",
    desc: "Batasi fitur sesuai kebutuhan setiap staf.",
    tone: "sky" as Tone,
  },
] as const;

/* ===========================================================
   SECTION: Business types (chips + 1 active panel)
   =========================================================== */

const businessTypes = [
  {
    id: "toko",
    label: "Toko",
    icon: Store,
    items: ["Penjualan & pembelian", "Stok barang", "Piutang pelanggan", "Utang pemasok"],
  },
  {
    id: "kuliner",
    label: "Kuliner",
    icon: ForkKnife,
    items: ["Penjualan harian", "Pembelian bahan", "Beban operasional", "Laporan laba rugi"],
  },
  {
    id: "jasa",
    label: "Jasa",
    icon: Handshake,
    items: ["Pendapatan jasa", "Beban usaha", "Piutang", "Laporan laba rugi"],
  },
  {
    id: "distributor",
    label: "Distributor",
    icon: Truck,
    items: ["Pembelian & penjualan", "Stok gudang", "Piutang & utang", "HPP"],
  },
] as const;

type BizId = (typeof businessTypes)[number]["id"];

/* ===========================================================
   SECTION: Report tabs
   =========================================================== */

const reportTabs = [
  {
    id: "laba-rugi",
    label: "Laba Rugi",
    icon: TrendUp,
    question: "Apakah usaha saya untung bulan ini?",
    desc: "Pendapatan, HPP, beban, dan laba usaha tersaji otomatis.",
  },
  {
    id: "neraca",
    label: "Neraca",
    icon: Building2,
    question: "Berapa nilai aset, utang, dan modal usaha?",
    desc: "Posisi keuangan usaha secara keseluruhan.",
  },
  {
    id: "buku-besar",
    label: "Buku Besar",
    icon: BookOpen,
    question: "Dari transaksi mana saldo berubah?",
    desc: "Mutasi dan saldo berjalan setiap akun.",
  },
  {
    id: "neraca-saldo",
    label: "Neraca Saldo",
    icon: Scale,
    question: "Apakah pencatatan tetap seimbang?",
    desc: "Periksa keseimbangan total debit dan kredit.",
  },
] as const;

type ReportId = (typeof reportTabs)[number]["id"];

/* ===========================================================
   SECTION: Security checklist
   =========================================================== */

const securityItems = [
  "Data dipisahkan per bisnis.",
  "Akses pemilik dan staf dapat dibatasi.",
  "Perubahan transaksi tercatat dan dapat ditelusuri.",
  "Koneksi dan sesi login dilindungi.",
  "Data dapat diekspor.",
] as const;

/* ===========================================================
   SECTION: Team checklist
   =========================================================== */

const teamItems = [
  { label: "Peran berbeda", desc: "Pemilik akses penuh, staf akses terbatas." },
  { label: "Atur akses per fitur", desc: "Tentukan siapa boleh mencatat atau melihat laporan." },
  { label: "Audit transaksi", desc: "Lihat siapa yang membuat atau mengubah transaksi." },
  { label: "Kendali penuh pemilik", desc: "Pemilik dapat mencabut akses staf kapan saja." },
] as const;

/* ===========================================================
   SECTION: FAQ data — 6 items
   =========================================================== */

const faqItems = [
  {
    q: "Apakah saya harus memahami akuntansi?",
    a: "Tidak. Catat transaksi seperti biasa — penjualan, pembelian, atau beban. Jurnal, debit, dan kredit diisi otomatis.",
  },
  {
    q: "Apakah Ledjer bisa digunakan dari ponsel?",
    a: "Bisa. Tampilan disesuaikan untuk ponsel, tablet, dan desktop. Catat transaksi dan lihat laporan dari mana saja.",
  },
  {
    q: "Apakah Ledjer gratis?",
    a: "Ya. Saat ini, fitur utama Ledjer dapat digunakan tanpa biaya berlangganan dan tanpa kartu kredit.",
  },
  {
    q: "Apakah saya wajib mendukung melalui Trakteer?",
    a: "Tidak. Dukungan melalui Trakteer sepenuhnya sukarela dan tidak memengaruhi akses Anda ke Ledjer.",
  },
  {
    q: "Untuk apa dukungan melalui Trakteer digunakan?",
    a: "Dukungan membantu biaya operasional, pemeliharaan sistem, peningkatan keamanan, dan pengembangan Ledjer.",
  },
  {
    q: "Apakah Ledjer akan selalu gratis?",
    a: "Kami berkomitmen menjaga Ledjer tetap mudah dijangkau. Jika model layanan berubah di kemudian hari, perubahan akan disampaikan secara transparan sebelum berlaku.",
  },
  {
    q: "Apakah data dapat diekspor?",
    a: "Ya. Data transaksi dapat diekspor ke CSV. Opsi tambahan akan diinformasikan jika tersedia.",
  },
  {
    q: "Apakah saya bisa mengundang staf?",
    a: "Bisa. Undang staf dan atur aksesnya per fitur. Setiap perubahan penting tercatat di audit log.",
  },
] as const;

/* ===========================================================
   SECTION: Mockup data
   =========================================================== */

const mockupMetrics = [
  { label: "Saldo Kas", value: "Rp 45.200.000", tone: "leaf" as Tone },
  { label: "Laba bulan ini", value: "Rp 8.350.000", tone: "sky" as Tone },
] as const;

const mockupTransactions = [
  { desc: "Penjualan", amount: "+Rp 8.500.000", tone: "leaf" as Tone },
  { desc: "Pembelian", amount: "−Rp 3.200.000", tone: "clay" as Tone },
  { desc: "Bayar Beban", amount: "−Rp 750.000", tone: "wood" as Tone },
] as const;

/* ===========================================================
   COMPONENT: FAQ Accordion
   =========================================================== */

function FaqAccordion({ items }: { readonly items: ReadonlyArray<{ readonly q: string; readonly a: string }> }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggle = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <dl className="divide-y divide-wood-200">
      {items.map((item, index) => {
        const isOpen = openIndex === index;
        const panelId = `faq-panel-${index}`;
        const buttonId = `faq-button-${index}`;

        return (
          <div key={item.q} className="py-1.5">
            <dt>
              <button
                id={buttonId}
                type="button"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => toggle(index)}
                className="flex w-full items-center justify-between gap-4 py-2.5 text-left text-sm font-semibold text-wood-900 transition-colors hover:text-wood-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wood-500 rounded-sm min-h-[48px]"
              >
                <span>{item.q}</span>
                <ChevronRight
                  className={cn(
                    "h-4 w-4 shrink-0 text-wood-500 transition-transform duration-200 motion-reduce:transition-none",
                    isOpen && "rotate-90"
                  )}
                  aria-hidden="true"
                />
              </button>
            </dt>
            <dd
              id={panelId}
              aria-labelledby={buttonId}
              aria-hidden={!isOpen || undefined}
              className={cn(
                "grid transition-all duration-200 motion-reduce:transition-none",
                isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
              )}
            >
              <div className="overflow-hidden">
                <p className="pb-2 pr-8 text-sm leading-relaxed text-wood-600">{item.a}</p>
              </div>
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

/* ===========================================================
   COMPONENT: Chip-style segmented control
   =========================================================== */

function SegmentedTabs<T extends string>({
  items,
  activeId,
  onChange,
  ariaLabel,
}: {
  readonly items: ReadonlyArray<{ readonly id: T; readonly label: string; readonly icon?: React.ComponentType<{ className?: string }> }>;
  readonly activeId: T;
  readonly onChange: (id: T) => void;
  readonly ariaLabel: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="ledger-scroll-x no-scrollbar ledger-fade-x flex gap-2 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0"
    >
      {items.map((item) => {
        const isActive = activeId === item.id;
        const Icon = item.icon;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`tab-${item.id}`}
            aria-selected={isActive}
            aria-controls={`panel-${item.id}`}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(item.id)}
            className={cn(
              "shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-medium transition-colors min-h-[44px]",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wood-500",
              isActive
                ? "bg-wood-700 border-wood-700 text-cream-50"
                : "bg-cream-50 border-wood-200 text-wood-700 hover:bg-cream-100"
            )}
          >
            {Icon ? <Icon className="h-4 w-4" aria-hidden="true" /> : null}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

/* ===========================================================
   PAGE: LandingPage
   =========================================================== */

export function LandingPage() {
  const [activeSection, setActiveSection] = useState("");
  const subNavRef = useRef<HTMLElement>(null);
  const [activeBiz, setActiveBiz] = useState<BizId>("toko");
  const [activeReport, setActiveReport] = useState<ReportId>("laba-rugi");
  const [demoExpanded, setDemoExpanded] = useState(false);

  // Keyboard arrow nav between segmented tabs (unused for now; kept
  // for future enhancement when we add roving tabindex on the list).

  // Keep the active pill centered in the horizontal strip.
  // Scroll ONLY the sub-nav container horizontally — never the page itself.
  useEffect(() => {
    if (!activeSection) return;
    const container = subNavRef.current;
    if (!container) return;
    const el = container.querySelector<HTMLElement>('[aria-current="true"]');
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const target = el.offsetLeft + el.offsetWidth / 2 - container.clientWidth / 2;
    container.scrollTo({ left: Math.max(0, target), behavior: reduce ? "auto" : "smooth" });
  }, [activeSection]);

  // Highlight the section currently in view for the mobile sub-nav
  useEffect(() => {
    const sections = navLinks
      .map((l) => document.getElementById(l.href.slice(1)))
      .filter((el): el is HTMLElement => el !== null);
    if (!sections.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const top = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (top) setActiveSection("#" + top.target.id);
      },
      { rootMargin: "-45% 0px -50% 0px", threshold: [0, 0.25, 0.5, 1] }
    );
    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, []);

  // Sticky mobile CTA: show after hero leaves viewport, hide when the
  // final CTA section is visible. Single observer, no scroll listeners.
  const [showStickyCta, setShowStickyCta] = useState(false);
  useEffect(() => {
    const hero = document.querySelector('[aria-labelledby="hero-heading"]');
    const finalCta = document.querySelector('[aria-labelledby="cta-heading"]');
    const footer = document.querySelector('footer');
    if (!hero || !finalCta) return;
    const targets = [hero, finalCta, footer].filter((el): el is Element => el !== null);
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.target === hero) {
            setShowStickyCta(!entry.isIntersecting);
          } else if (entry.target === finalCta || entry.target === footer) {
            if (entry.isIntersecting) setShowStickyCta(false);
          }
        }
      },
      { threshold: 0, rootMargin: "0px" }
    );
    targets.forEach((t) => observer.observe(t));
    return () => observer.disconnect();
  }, []);

  const activeBizPanel = businessTypes.find((b) => b.id === activeBiz) ?? businessTypes[0];
  const activeReportPanel = reportTabs.find((r) => r.id === activeReport) ?? reportTabs[0];

  return (
    <div className="ledger-min-dvh overflow-x-hidden scroll-smooth motion-reduce:scroll-auto bg-cream-50">
      {/* SKIP TO MAIN CONTENT */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-tooltip focus:rounded-lg focus:bg-wood-500 focus:px-4 focus:py-2 focus:text-sm focus:text-cream-50 focus:shadow-lg"
      >
        Lewati ke konten utama
      </a>

      {/* ============================================================
         HEADER & NAVIGATION
         ============================================================ */}
      <header className="sticky top-0 z-sticky border-b border-wood-200 bg-cream-50/95 backdrop-blur-sm [--header-h:72px] md:[--header-h:60px]">
        <nav
          aria-label="Navigasi utama"
          className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8"
        >
          <Link to="/" aria-label="Ledjer beranda" className="flex items-center min-h-[44px]">
            <Logo size="sm" variant="full" />
          </Link>

          {/* Desktop nav */}
          <div className="hidden items-center gap-1 md:flex">
            {navLinks.map((link) => (
              <Button key={link.href} as="a" variant="ghost" size="sm" href={link.href} aria-label={`${link.label} (navigasi utama)`}>
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
              aria-label="Masuk ke akun (bilah navigasi)"
            >
              Masuk
            </Button>
            <Button
              as={Link}
              to="/register"
              variant="primary"
              size="sm"
              aria-label="Mulai Gratis (bilah navigasi)"
            >
              <span className="sm:hidden">Mulai</span>
              <span className="hidden sm:inline">Mulai Gratis</span>
            </Button>
          </div>
        </nav>

        {/* Mobile sub-nav (section links) — single scrollable row, no wrap */}
        <div className="md:hidden border-t border-wood-100 bg-cream-50/95">
          <nav
            ref={subNavRef}
            aria-label="Navigasi bagian"
            className="ledger-scroll-x no-scrollbar ledger-fade-x mx-auto flex max-w-6xl snap-x snap-mandatory gap-1 px-4 py-2 text-xs"
          >
            {navLinks.map((link) => {
              const isActive = activeSection === link.href;
              return (
                <a
                  key={link.href}
                  href={link.href}
                  aria-label={`${link.label} (sub-navigasi)`}
                  aria-current={isActive ? "true" : undefined}
                  className={`shrink-0 snap-start rounded-full px-3 py-2 min-h-[44px] flex items-center text-xs font-medium transition-colors ${
                    isActive
                      ? "bg-wood-700 text-cream-50"
                      : "text-wood-700 hover:bg-cream-100"
                  }`}
                >
                  {link.label}
                </a>
              );
            })}
          </nav>
        </div>
      </header>

      {/* ============================================================
         MAIN CONTENT
         ============================================================ */}
      <main
        id="main-content"
        className={cn(
          "md:pb-0",
          showStickyCta ? "pb-[calc(72px+env(safe-area-inset-bottom,0px))] md:pb-0" : "pb-0"
        )}
      >
        {/* ----------------------------------------------------------
           HERO + PREVIEW
           ---------------------------------------------------------- */}
        <section
          aria-labelledby="hero-heading"
          className="landing-ledger relative overflow-hidden border-b border-wood-100"
        >
          <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
            <div className="grid min-w-0 grid-cols-1 items-center gap-10 lg:grid-cols-[minmax(0,0.95fr)_minmax(26rem,1.05fr)] lg:gap-16">
              <div className="ledger-hero-copy min-w-0">
                <div
                  className="mb-4 inline-flex max-w-full items-center gap-2 rounded-full border border-leaf-200 bg-leaf-50 px-3 py-1 text-xs font-semibold text-leaf-700"
                  style={stagger(0)}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-leaf-500" aria-hidden="true" />{' '}
                  Pembukuan UMKM Indonesia
                </div>

                <h1
                  id="hero-heading"
                  className="max-w-none text-balance text-[clamp(2.125rem,8vw,4rem)] font-bold leading-[1.02] tracking-[-0.03em] text-wood-900 sm:max-w-[16ch]"
                  style={stagger(1)}
                >
                  Pembukuan usaha yang rapi, tanpa harus menjadi ahli akuntansi.
                </h1>
                <p
                  className="mt-5 max-w-xl text-pretty text-base leading-relaxed text-wood-700 sm:text-lg"
                  style={stagger(2)}
                >
                  Catat penjualan, pembelian, stok, utang-piutang, dan pantau laporan keuangan usaha dalam satu tempat. Ledjer menggunakan sistem pembukuan berpasangan agar setiap transaksi tercatat dengan benar.
                </p>

                <div
                  className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4"
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
                    className="ledger-cta-link text-sm font-medium text-wood-700 underline-offset-4 transition-colors hover:text-wood-900 hover:underline min-h-[44px] inline-flex items-center py-1 sm:self-center"
                  >
                    Lihat cara kerja
                  </a>
                </div>

                <p
                  className="mt-3 text-sm text-wood-500"
                  style={stagger(3)}
                >
                  Saat ini gratis digunakan &bull; Tanpa kartu kredit
                </p>
              </div>

              {/* Hero mockup */}
              <div
                className="relative min-w-0"
                role="img"
                aria-label="Contoh dashboard Ledjer yang menyeimbangkan jurnal otomatis"
              >
                <div className="ledger-mockup w-full min-w-0 max-w-full overflow-hidden rounded-xl bg-wood-800 p-3 text-cream-50 shadow-lg sm:p-4">
                  <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-b border-wood-600 pb-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-cream-50">Pembukuan seimbang</p>
                      <p className="text-xs text-wood-200">Transaksi menjadi laporan otomatis</p>
                    </div>
                    <div className="ledger-balance-stamp inline-flex shrink-0 items-center gap-1.5 rounded-full bg-leaf-100 px-3 py-1.5 text-xs font-semibold text-leaf-700">
                      <CheckCircle className="h-3.5 w-3.5" />
                      <span>Debit = Kredit</span>
                    </div>
                  </div>

                  <fieldset className="grid grid-cols-2 gap-3 py-3">
                    <legend className="sr-only">Metrik dashboard contoh</legend>
                    {mockupMetrics.map((metric, index) => (
                      <div
                        key={metric.label}
                        className={cn(
                          "ledger-row min-w-0 rounded-lg border px-3 py-2.5 font-mono [font-feature-settings:\"tnum\",\"ss01\"]",
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
                  </fieldset>

                  <div className="min-w-0 rounded-lg bg-cream-50 p-3 text-wood-900" aria-hidden="true">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-wood-500" />
                        <span className="text-xs font-semibold text-wood-700">Transaksi terbaru</span>
                      </div>
                      <span className="rounded-full bg-wood-100 px-2 py-0.5 text-[11px] font-medium text-wood-700">
                        Otomatis
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      {mockupTransactions.map((tx, index) => (
                        <div
                          key={tx.desc}
                          className="ledger-row flex min-w-0 flex-col gap-1 rounded-md bg-cream-100 px-3 py-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
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
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ----------------------------------------------------------
           FOUR USER-OUTCOME BENEFITS — 2x2 grid
           ---------------------------------------------------------- */}
        <section
          id="fitur"
          aria-labelledby="features-heading"
          className="bg-cream-50 py-14 sm:py-16 lg:py-20"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <h2
              id="features-heading"
              className="text-balance text-2xl font-bold tracking-[-0.02em] text-wood-900 sm:text-3xl"
            >
              Empat hal yang langsung Anda dapatkan.
            </h2>

            <ul className="ledger-stagger mt-6 grid grid-cols-2 gap-3">
              {benefits.map((benefit, index) => (
                <li
                  key={benefit.title}
                  className="flex h-full items-start gap-2.5 rounded-xl border border-wood-200 bg-surface-elevated p-4"
                  style={stagger(index)}
                >
                  <span
                    className={cn(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border",
                      toneStyles[benefit.tone]
                    )}
                    aria-hidden="true"
                  >
                    <benefit.icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold leading-tight text-wood-900">{benefit.title}</p>
                    <p className="mt-1 text-sm leading-snug text-wood-600">{benefit.desc}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ----------------------------------------------------------
           CARA KERJA — timeline (steps)
           ---------------------------------------------------------- */}
        <section
          id="cara-kerja"
          aria-labelledby="how-heading"
          className="border-y border-wood-200 bg-cream-100 py-14 sm:py-16 lg:py-20"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <h2
              id="how-heading"
              className="text-balance text-2xl font-bold tracking-[-0.02em] text-wood-900 sm:text-3xl"
            >
              Cara kerja dalam tiga langkah.
            </h2>

            <ol className="ledger-stagger mt-6 relative">
              <span
                aria-hidden="true"
                className="absolute left-[15px] top-2 bottom-2 w-px bg-wood-200 sm:left-5"
              />
              {[
                {
                  n: "01",
                  title: "Buat usaha",
                  desc: "Isi nama usaha dan saldo awal.",
                  icon: Building2,
                  tone: "leaf" as Tone,
                },
                {
                  n: "02",
                  title: "Catat transaksi",
                  desc: "Masukkan penjualan, pembelian, atau beban.",
                  icon: Wallet,
                  tone: "honey" as Tone,
                },
                {
                  n: "03",
                  title: "Laporan siap",
                  desc: "Stok, jurnal, dan laporan diperbarui otomatis.",
                  icon: Chart,
                  tone: "sky" as Tone,
                },
              ].map((step, index) => (
                <li
                  key={step.n}
                  className="relative flex items-start gap-3 py-3 sm:gap-4"
                  style={stagger(index)}
                >
                  <span
                    className={cn(
                      "relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-cream-100 text-xs font-bold sm:h-10 sm:w-10",
                      toneStyles[step.tone]
                    )}
                    aria-hidden="true"
                  >
                    {step.n}
                  </span>
                  <div className="min-w-0 pt-0.5">
                    <p className="text-sm font-semibold text-wood-900 sm:text-base">{step.title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-wood-600 sm:text-sm">{step.desc}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ----------------------------------------------------------
           ONE-TRANSACTION DEMO — single panel with expand
           ---------------------------------------------------------- */}
        <section
          aria-labelledby="demo-heading"
          className="bg-cream-50 py-14 sm:py-16 lg:py-20"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <h2
              id="demo-heading"
              className="text-balance text-2xl font-bold tracking-[-0.02em] text-wood-900 sm:text-3xl"
            >
              Satu transaksi, semua ikut berubah.
            </h2>
            <p className="mt-2 max-w-[58ch] text-sm text-wood-600">
              Contoh: <strong>Penjualan Rp500.000 untuk 2 produk</strong>. Sekali catat, semua pembaruan terjadi otomatis.
            </p>

            <div className="mt-5 overflow-hidden rounded-xl border border-wood-200 bg-cream-50">
              <div className="border-b border-wood-200 bg-cream-100 px-4 py-2.5 text-xs font-semibold text-wood-700">
                Penjualan tunai &middot; 2 produk &middot; Rp500.000
              </div>
              <dl className="divide-y divide-wood-100">
                {demoRows.map((row) => (
                  <div
                    key={row.label}
                    className="flex items-center justify-between gap-3 px-4 py-2.5"
                  >
                    <dt className="flex min-w-0 items-center gap-2 text-sm text-wood-700">
                      <span
                        className={cn(
                          "inline-block h-2 w-2 shrink-0 rounded-full",
                          row.tone === "leaf" && "bg-leaf-500",
                          row.tone === "sky" && "bg-sky-500",
                          row.tone === "wood" && "bg-wood-500",
                          row.tone === "honey" && "bg-honey-500",
                          row.tone === "clay" && "bg-clay-500"
                        )}
                        aria-hidden="true"
                      />
                      {row.label}
                    </dt>
                    <dd className="font-mono text-sm font-semibold tabular-nums text-wood-900">
                      {row.detail}
                    </dd>
                  </div>
                ))}
                <div
                  id="demo-detail"
                  hidden={!demoExpanded}
                  className={cn(
                    "overflow-hidden transition-all duration-200 motion-reduce:transition-none",
                    demoExpanded ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
                  )}
                >
                  {demoDetailRows.map((row) => (
                    <div
                      key={row.label}
                      className="flex items-center justify-between gap-3 px-4 py-2.5"
                    >
                      <span className="flex min-w-0 items-center gap-2 text-sm text-wood-700">
                        <span
                          className={cn(
                            "inline-block h-2 w-2 shrink-0 rounded-full",
                            row.tone === "leaf" && "bg-leaf-500",
                            row.tone === "honey" && "bg-honey-500",
                            row.tone === "clay" && "bg-clay-500"
                          )}
                          aria-hidden="true"
                        />
                        {row.label}
                      </span>
                      <span className="font-mono text-sm font-semibold tabular-nums text-wood-900">
                        {row.detail}
                      </span>
                    </div>
                  ))}
                  <p className="px-4 py-2 text-xs text-wood-500">
                    Validasi: Rp500.000 − Rp320.000 = <strong className="font-semibold text-wood-700">Rp180.000</strong> (laba kotor)
                  </p>
                </div>
              </dl>
              <div className="border-t border-wood-200 bg-cream-100/60 px-4 py-2.5">
                <button                   type="button"
                  aria-expanded={demoExpanded}
                  aria-controls="demo-detail"
                  onClick={() => setDemoExpanded((v) => !v)}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-wood-700 hover:text-wood-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wood-500 rounded-sm min-h-[44px]"
                >
                  {demoExpanded ? "Sembunyikan detail" : "Lihat detail pembukuan"}
                  <ChevronRight
                    className={cn(
                      "h-4 w-4 transition-transform duration-200 motion-reduce:transition-none",
                      demoExpanded && "rotate-90"
                    )}
                    aria-hidden="true"
                  />
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* ----------------------------------------------------------
           BUSINESS TYPES — chips + 1 active panel
           ---------------------------------------------------------- */}
        <section
          aria-labelledby="business-heading"
          className="border-y border-wood-200 bg-cream-100 py-14 sm:py-16 lg:py-20"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <h2
              id="business-heading"
              className="text-balance text-2xl font-bold tracking-[-0.02em] text-wood-900 sm:text-3xl"
            >
              Cocok untuk berbagai jenis usaha.
            </h2>

            <div className="mt-4">
              <SegmentedTabs
                items={businessTypes.map((b) => ({ id: b.id, label: b.label, icon: b.icon }))}
                activeId={activeBiz}
                onChange={(id) => setActiveBiz(id as BizId)}
                ariaLabel="Pilih jenis usaha"
              />
            </div>

            <div
              id={`panel-${activeBizPanel.id}`}
              role="tabpanel"
              aria-labelledby={`tab-${activeBizPanel.id}`}
              className="mt-4 rounded-xl border border-wood-200 bg-cream-50 p-4 sm:p-5"
            >
              <p className="text-sm font-semibold text-wood-900">
                Alur kerja untuk {activeBizPanel.label.toLowerCase()}:
              </p>
              <ul className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2 sm:gap-2">
                {activeBizPanel.items.map((item) => (
                  <li key={item} className="flex items-center gap-2 text-sm text-wood-700">
                    <CheckCircle className="h-4 w-4 shrink-0 text-leaf-600" aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* ----------------------------------------------------------
           REPORTS — tabs + 1 active panel
           ---------------------------------------------------------- */}
        <section
          id="laporan"
          aria-labelledby="reports-heading"
          className="bg-cream-50 py-14 sm:py-16 lg:py-20"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <h2
              id="reports-heading"
              className="text-balance text-2xl font-bold tracking-[-0.02em] text-wood-900 sm:text-3xl"
            >
              Laporan yang menjawab pertanyaan usaha Anda.
            </h2>

            <div className="mt-4">
              <SegmentedTabs
                items={reportTabs.map((r) => ({ id: r.id, label: r.label, icon: r.icon }))}
                activeId={activeReport}
                onChange={(id) => setActiveReport(id as ReportId)}
                ariaLabel="Pilih laporan"
              />
            </div>

            <div
              id={`panel-${activeReportPanel.id}`}
              role="tabpanel"
              aria-labelledby={`tab-${activeReportPanel.id}`}
              className="mt-4 rounded-xl border border-wood-200 bg-cream-50 p-4 sm:p-5"
            >
              <p className="text-sm italic text-wood-600">
                "{activeReportPanel.question}"
              </p>
              <p className="mt-2 text-sm leading-relaxed text-wood-700">
                {activeReportPanel.desc}
              </p>
            </div>
          </div>
        </section>

        {/* ----------------------------------------------------------
           TIM & IZIN — checklist (single container)
           ---------------------------------------------------------- */}
        <section
          aria-labelledby="team-heading"
          className="border-y border-leaf-200 bg-leaf-50 py-14 sm:py-16 lg:py-20"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <h2
              id="team-heading"
              className="text-balance text-2xl font-bold tracking-[-0.02em] text-wood-900 sm:text-3xl"
            >
              Atur akses staf dengan peran yang berbeda.
            </h2>
            <p className="mt-2 max-w-[60ch] text-sm text-wood-600">
              Staf dapat membantu mencatat tanpa melihat semua informasi. Pemilik tetap memegang kendali.
            </p>

            <ul className="mt-5 grid grid-cols-1 gap-1.5 sm:grid-cols-2 sm:gap-2">
              {teamItems.map((item) => (
                <li key={item.label} className="flex items-start gap-2 text-sm text-wood-700">
                  <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-leaf-600" aria-hidden="true" />
                  <span>
                    <strong className="font-semibold text-wood-900">{item.label}.</strong>{" "}
                    {item.desc}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ----------------------------------------------------------
           SECURITY — checklist
           ---------------------------------------------------------- */}
        <section
          id="keamanan"
          aria-labelledby="security-heading"
          className="bg-cream-50 py-14 sm:py-16 lg:py-20"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <h2
              id="security-heading"
              className="text-balance text-2xl font-bold tracking-[-0.02em] text-wood-900 sm:text-3xl"
            >
              Data bisnis tetap privat dan dapat ditelusuri.
            </h2>
            <p className="mt-2 max-w-[60ch] text-sm text-wood-600">
              Data usaha dipisahkan dan aksesnya dapat dibatasi. Setiap perubahan penting tercatat.
            </p>

            <ul className="mt-5 space-y-1.5">
              {securityItems.map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm text-wood-700">
                  <Shield className="mt-0.5 h-4 w-4 shrink-0 text-leaf-600" aria-hidden="true" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            <p className="mt-4 text-sm">
              <Link
                to="/security"
                className="font-medium text-wood-700 underline-offset-4 hover:text-wood-900 hover:underline min-h-[44px] inline-flex items-center py-1"
              >
                Pelajari keamanan Ledjer →
              </Link>
            </p>
          </div>
        </section>

        {/* ----------------------------------------------------------
           AKSES & DUKUNGAN — single panel
           ---------------------------------------------------------- */}
        <section
          id="akses"
          aria-labelledby="access-heading"
          className="border-y border-wood-200 bg-cream-100 py-14 sm:py-16 lg:py-20"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="rounded-xl border border-wood-200 bg-cream-50 p-5 sm:p-6">
              <h2
                id="access-heading"
                className="text-balance text-2xl font-bold tracking-[-0.02em] text-wood-900 sm:text-3xl"
              >
                Ledjer dapat digunakan secara gratis
              </h2>
              <p className="mt-2 max-w-[60ch] text-sm text-wood-600">
                Saat ini, Anda dapat menggunakan fitur-fitur utama Ledjer tanpa biaya berlangganan dan tanpa kartu kredit.
              </p>
              <p className="mt-3 max-w-[60ch] text-sm text-wood-600">
                Jika Ledjer bermanfaat bagi usaha Anda, Anda dapat ikut mendukung biaya operasional dan pengembangannya melalui Trakteer. Dukungan sepenuhnya sukarela dan tidak memengaruhi akses Anda ke Ledjer.
              </p>

              <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button
                  as={Link}
                  to="/register"
                  variant="primary"
                  size="md"
                  className="sm:w-auto"
                >
                  Mulai Gratis
                </Button>
                <SupportLink
                  variant="outline"
                  placement="landing"
                  className="px-4 py-2.5 text-sm"
                />
              </div>
              <p className="mt-3 text-xs text-wood-500">
                Anda tetap dapat menggunakan Ledjer meskipun tidak memberikan dukungan.
              </p>
            </div>
          </div>
        </section>

        {/* ----------------------------------------------------------
           FAQ — 6 items
           ---------------------------------------------------------- */}
        <section
          aria-labelledby="faq-heading"
          className="bg-cream-50 py-14 sm:py-16 lg:py-20"
        >
          <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
            <h2
              id="faq-heading"
              className="text-balance text-2xl font-bold tracking-[-0.02em] text-wood-900 sm:text-3xl"
            >
              Pertanyaan umum.
            </h2>

            <div className="mt-5 rounded-xl border border-wood-200 bg-cream-50 px-4 py-1 sm:px-5">
              <FaqAccordion items={faqItems} />
            </div>
          </div>
        </section>

        {/* ----------------------------------------------------------
           FINAL CTA
           ---------------------------------------------------------- */}
        <section aria-labelledby="cta-heading" className="bg-wood-800 py-12 sm:py-16">
          <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
            <h2
              id="cta-heading"
              className="text-balance text-2xl font-bold tracking-[-0.02em] text-cream-50 sm:text-3xl"
            >
              Siap memulai pembukuan yang lebih mudah?
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-wood-200 sm:text-base">
              Buat usaha pertama Anda dan catat transaksi dalam beberapa menit.
            </p>
            <div className="mt-6 flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
              <Button
                as={Link}
                to="/register"
                variant="primary"
                size="lg"
                fullWidth
                className="sm:w-auto"
                aria-label="Mulai Gratis (cta akhir)"
              >
                Mulai Gratis
                <ChevronRight className="h-4 w-4" />
              </Button>
              <a
                href="#cara-kerja"
                className="text-sm font-medium text-wood-100 underline-offset-4 hover:text-cream-50 hover:underline min-h-[44px] inline-flex items-center py-1 sm:ml-3"
              >
                Lihat cara kerja
              </a>
            </div>
            <p className="mt-3 text-xs text-wood-500">
              Saat ini gratis digunakan &bull; Tanpa kartu kredit
            </p>
          </div>
        </section>
      </main>

      {/* ============================================================
         STICKY MOBILE CTA
         ============================================================ */}
      <div
        aria-hidden={!showStickyCta}
        inert={!showStickyCta}
        className={cn(
          "fixed inset-x-0 bottom-0 z-sticky md:hidden",
          "border-t border-wood-200 bg-cream-50/95 backdrop-blur-sm",
          "transition-transform duration-200 motion-reduce:transition-none",
          showStickyCta ? "translate-y-0" : "translate-y-full"
        )}
      >
        <div className="ledger-safe-bottom mx-auto flex max-w-6xl items-center px-4 py-3">
          <Button
            as={Link}
            to="/register"
            variant="primary"
            size="md"
            fullWidth
            aria-label="Mulai Gratis (cta melekat)"
            tabIndex={showStickyCta ? 0 : -1}
          >
            Mulai Gratis
          </Button>
        </div>
      </div>

      {/* ============================================================
         FOOTER
         ============================================================ */}
      <footer aria-label="Informasi footer" className="border-t border-wood-200 bg-cream-50">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-[1fr_2fr] sm:items-start">
            <div className="flex flex-col items-start gap-2">
              <Logo size="sm" variant="full" />
              <p className="break-words text-sm text-wood-600">
                Pembukuan UMKM Indonesia yang sederhana dan rapi.
              </p>
              <p className="break-words text-sm text-wood-500">
                Ledjer saat ini gratis digunakan. Jika bermanfaat, Anda dapat mendukung pengembangannya melalui Trakteer.
              </p>
              <SupportLink
                variant="link"
                placement="footer"
              />
            </div>
            <nav aria-label="Tautan footer">
              <ul className="grid grid-cols-2 gap-1 text-sm sm:grid-cols-3 sm:gap-2">
                {footerLinks.map((link) =>
                  "to" in link ? (
                    <li key={link.label}>
                      <Link
                        to={link.to}
                        aria-label={`${link.label} (tautan footer)`}
                        className="text-wood-700 underline-offset-4 transition-colors hover:text-wood-900 hover:underline min-h-[44px] inline-flex items-center py-1"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ) : (
                    <li key={link.label}>
                      <a
                        href={link.href}
                        aria-label={`${link.label} (tautan footer)`}
                        className="text-wood-700 underline-offset-4 transition-colors hover:text-wood-900 hover:underline min-h-[44px] inline-flex items-center py-1"
                      >
                        {link.label}
                      </a>
                    </li>
                  )
                )}
              </ul>
            </nav>
          </div>
          <div className="mt-6 flex flex-col items-center gap-2 border-t border-wood-100 pt-4 sm:flex-row sm:justify-between">
            <p className="text-sm text-wood-500">
              &copy; {new Date().getFullYear()} Ledjer. Pembukuan UMKM Indonesia.
            </p>
            <nav aria-label="Tautan legal">
              <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm text-wood-500">
                {legalLinks.map((link) => (
                  <li key={link.label}>
                    <Link
                      to={link.to}
                      className="text-wood-500 underline-offset-4 transition-colors hover:text-wood-700 hover:underline min-h-[44px] inline-flex items-center py-1"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </div>
      </footer>
    </div>
  );
}
