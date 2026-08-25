import { defineConfig } from "vitepress";
import { fileURLToPath, URL } from "node:url";

const DOCS_URL = "https://docs.ledjer.id";

export default defineConfig({
  lang: "id-ID",
  vite: {
    resolve: {
      alias: [
        // Overrides of the default theme components (same technique as VPFeature).
        // VPContent: <div> -> <main> landmark; VPHomeContent: align home content to
        // the shared container; VPFeatures: section header + <section> semantics;
        // VPFeature: h3 titles + <article> cards; VPNavBarHamburger: Indonesian
        // accessible labels + Escape/scroll-lock; VPFooter: columned footer.
        { find: /.*\/VPFeature\.vue$/, replacement: fileURLToPath(new URL("./theme/components/VPFeature.vue", import.meta.url)) },
        { find: /.*\/VPFeatures\.vue$/, replacement: fileURLToPath(new URL("./theme/components/VPFeatures.vue", import.meta.url)) },
        { find: /.*\/VPHomeContent\.vue$/, replacement: fileURLToPath(new URL("./theme/components/VPHomeContent.vue", import.meta.url)) },
        { find: /.*\/VPContent\.vue$/, replacement: fileURLToPath(new URL("./theme/components/VPContent.vue", import.meta.url)) },
        { find: /.*\/VPNavBarHamburger\.vue$/, replacement: fileURLToPath(new URL("./theme/components/VPNavBarHamburger.vue", import.meta.url)) },
        { find: /.*\/VPNavBarExtra\.vue$/, replacement: fileURLToPath(new URL("./theme/components/VPNavBarExtra.vue", import.meta.url)) },
        { find: /.*\/VPFooter\.vue$/, replacement: fileURLToPath(new URL("./theme/components/VPFooter.vue", import.meta.url)) },
      ],
    },
  },
  title: "Docs",
  description:
    "Panduan penggunaan Ledjer - aplikasi pembukuan double-entry untuk UMKM Indonesia. Catat transaksi, kelola stok, dan lihat laporan keuangan.",
  cleanUrls: true,
  head: [
    ["link", { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" }],
    ["link", { rel: "canonical", href: DOCS_URL }],
    [
      "link",
      {
        rel: "preconnect",
        href: "https://fonts.googleapis.com",
      },
    ],
    [
      "link",
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossorigin: "",
      },
    ],
    [
      "link",
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap",
      },
    ],
    [
      "meta",
      {
        property: "og:title",
        content: "Ledjer Docs - Panduan Pembukuan UMKM",
      },
    ],
    [
      "meta",
      {
        property: "og:description",
        content:
          "Panduan penggunaan Ledjer: catat transaksi, kelola inventori, dan hasilkan laporan keuangan tanpa pengetahuan akuntansi formal.",
      },
    ],
  ],
  themeConfig: {
    logo: {
      src: "/logo-horizontal.svg",
      alt: "Ledjer",
      width: 132,
      height: 34,
    },
    siteTitle: "Docs",
    nav: [
      { text: "Beranda", link: "/" },
      { text: "Memulai", link: "/mulai" },
      {
        text: "Panduan",
        items: [
          { text: "Mencatat Transaksi", link: "/panduan/mencatat-transaksi" },
          { text: "Laporan Keuangan", link: "/panduan/laporan-keuangan" },
          { text: "Produk & Inventori", link: "/panduan/produk-inventori" },
          { text: "Faktur & Piutang", link: "/panduan/faktur-piutang" },
          { text: "Tim & Peran", link: "/panduan/tim-peran" },
          { text: "Periode & Penutupan", link: "/panduan/periode-penutupan" },
          { text: "Keamanan Akun", link: "/panduan/keamanan-akun" },
        ],
      },
      { text: "FAQ", link: "/faq" },
      { text: "API", link: "/api" },
      {
        // Registration flow - stay in the same tab (docs should not hold the
        // user hostage in a new tab). rel is still set for the external origin.
        text: "Buka Aplikasi",
        link: "https://ledjer.id",
        target: "_self",
        rel: "noreferrer",
      },
    ],
    sidebar: [
      {
        text: "Dasar",
        items: [
          { text: "Beranda", link: "/" },
          { text: "Memulai", link: "/mulai" },
        ],
      },
      {
        text: "Panduan",
        items: [
          { text: "Mencatat Transaksi", link: "/panduan/mencatat-transaksi" },
          { text: "Laporan Keuangan", link: "/panduan/laporan-keuangan" },
          { text: "Produk & Inventori", link: "/panduan/produk-inventori" },
          { text: "Faktur & Piutang", link: "/panduan/faktur-piutang" },
          { text: "Tim & Peran", link: "/panduan/tim-peran" },
          { text: "Periode & Penutupan", link: "/panduan/periode-penutupan" },
          { text: "Keamanan Akun", link: "/panduan/keamanan-akun" },
        ],
      },
      {
        text: "Lainnya",
        items: [
          { text: "FAQ", link: "/faq" },
          { text: "Referensi API", link: "/api" },
        ],
      },
    ],
    search: {
      provider: "local",
      options: {
        translations: {
          button: { buttonText: "Cari dokumentasi", buttonAriaLabel: "Cari dokumentasi" },
          modal: {
            noResultsText: "Tidak ada hasil untuk",
            resetButtonTitle: "Hapus pencarian",
            footer: { selectText: "pilih", navigateText: "navigasi", closeText: "tutup" },
          },
        },
      },
    },
    outline: { label: "Di halaman ini", level: [2, 3] },
    lastUpdated: { text: "Diperbarui", formatOptions: { dateStyle: "medium" } },
    docFooter: {
      prev: "Sebelumnya",
      next: "Selanjutnya",
    },
    editLink: {
      pattern: "https://github.com/eiaiproject/Ledjer/edit/main/apps/docs/docs/:path",
      text: "Edit halaman ini di GitHub",
    },
    appearance: true,
    // VitePress: saat isDark=true -> lightModeSwitchTitle (aksi: ke terang),
    // saat isDark=false -> darkModeSwitchTitle (aksi: ke gelap).
    lightModeSwitchTitle: "Gunakan tema terang",
    darkModeSwitchTitle: "Gunakan tema gelap",
    darkModeSwitchLabel: "Tampilan",
    externalLinkIcon: true,
    footer: {
      message: "<strong>Ledjer</strong> - pembukuan double-entry untuk UMKM Indonesia.",
      copyright: `© ${new Date().getFullYear()} Ledjer. Hak cipta dilindungi.`,
    },
    socialLinks: [
      { icon: "github", link: "https://github.com/eiaiproject/Ledjer" },
    ],
    // Kolom footer - dirender oleh komponen VPFooter kustom.
    footerLinks: [
      { text: "Memulai", link: "/mulai" },
      { text: "Panduan", link: "/panduan/mencatat-transaksi" },
      { text: "FAQ", link: "/faq" },
      { text: "API", link: "/api" },
    ],
    footerBottomLinks: [
      { text: "Mulai Gratis", link: "https://ledjer.id/register" },
      { text: "Buka Aplikasi", link: "https://ledjer.id" },
      { text: "Keamanan", link: "/panduan/keamanan-akun" },
    ],
    returnToTopLabel: "Kembali ke atas",
    sidebarMenuLabel: "Menu",
    skipToContentLabel: "Langsung ke konten",
    notFound: {
      title: "Halaman tidak ditemukan",
      quote: "Sepertinya halaman ini sudah pindah atau tidak pernah ada.",
      linkLabel: "Kembali ke beranda",
      linkText: "Kembali ke beranda",
      code: "404",
    },
  },
});
