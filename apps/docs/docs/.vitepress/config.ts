import { defineConfig } from "vitepress";
import { fileURLToPath, URL } from "node:url";

const DOCS_URL = "https://docs.ledjer.id";

export default defineConfig({
  lang: "id-ID",
  vite: {
    resolve: {
      alias: [
        {
          // Replace the default theme's VPFeature with our themed version that
          // renders icons from reicon-react (reicon.dev) instead of emoji.
          find: /.*\/VPFeature\.vue$/,
          replacement: fileURLToPath(
            new URL("./theme/components/VPFeature.vue", import.meta.url),
          ),
        },
      ],
    },
  },
  title: "Docs",
  description:
    "Panduan penggunaan Ledjer — aplikasi pembukuan double-entry untuk UMKM Indonesia. Catat transaksi, kelola stok, dan lihat laporan keuangan.",
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
        content: "Ledjer Docs — Panduan Pembukuan UMKM",
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
      { text: "Buka Aplikasi", link: "https://ledjer.id" },
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
    appearance: false,
    hideDarkModeSwitch: true,
    footer: {
      message: "<strong>Ledjer</strong> — pembukuan double-entry untuk UMKM Indonesia.",
      copyright: `© ${new Date().getFullYear()} Ledjer. Hak cipta dilindungi.`,
    },
    socialLinks: [
      { icon: "github", link: "https://github.com/eiaiproject/Ledjer" },
    ],
    footerLinks: [
      { text: "Beranda", link: "/" },
      { text: "Memulai", link: "/mulai" },
      { text: "FAQ", link: "/faq" },
      { text: "Referensi API", link: "/api" },
    ],
    footerBottomLinks: [
      { text: "Buka Aplikasi", link: "https://ledjer.id" },
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
