import type { ReactNode } from "react";
import { Link } from "react-router-dom";

export type LegalPageId = "privacy" | "terms" | "security" | "contact" | "refund";

interface LegalSection {
  readonly title: string;
  readonly body: ReactNode;
}

interface LegalDocument {
  readonly title: string;
  readonly description: string;
  readonly intro: string;
  readonly sections: readonly LegalSection[];
}

const UPDATED = "24 November 2026";

const CONTACT_URL = "https://github.com/eiaiproject/Ledjer/issues/new";
const SECURITY_URL = "https://github.com/eiaiproject/Ledjer/security/advisories/new";
const REPO_URL = "https://github.com/eiaiproject/Ledjer";

function ExternalLink({ href, children }: Readonly<{ href: string; children: ReactNode }>) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-wood-700 underline decoration-wood-300 underline-offset-2 hover:text-wood-900"
    >
      {children}
    </a>
  );
}

const documents: Record<LegalPageId, LegalDocument> = {
  privacy: {
    title: "Kebijakan Privasi",
    description: "Data apa yang Ledjer kumpulkan, mengapa, dan bagaimana Anda mengendalikannya.",
    intro:
      "Ledjer menyimpan data akun dan pembukuan usaha Anda untuk menjalankan aplikasi. Halaman ini menjelaskan data yang kami proses, pihak yang membantu memprosesnya, dan pilihan yang Anda miliki.",
    sections: [
      {
        title: "Data yang kami kumpulkan",
        body: (
          <>
            <p>Kami mengumpulkan data yang Anda berikan saat membuat akun dan memakai Ledjer:</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>Nama lengkap, alamat email, dan nama usaha.</li>
              <li>Data autentikasi, termasuk hash password atau profil dasar dari Google jika Anda memilih masuk dengan Google.</li>
              <li>Data pembukuan yang Anda masukkan: transaksi, akun kas dan bank, produk, pihak, stok, serta laporan yang diturunkan darinya.</li>
              <li>Data teknis terbatas seperti alamat IP, user agent, waktu sesi, dan catatan kesalahan yang diperlukan untuk keamanan dan stabilitas layanan.</li>
            </ul>
            <p>
              Kami tidak meminta nomor kartu pembayaran. Ledjer saat ini tidak memiliki langganan berbayar.
            </p>
          </>
        ),
      },
      {
        title: "Mengapa data dipakai",
        body: (
          <ul className="list-disc space-y-2 pl-5">
            <li>Menjalankan aplikasi, menyimpan pembukuan, dan menampilkan laporan.</li>
            <li>Mengautentikasi akun dan menjaga sesi tetap aman.</li>
            <li>Mencegah penyalahgunaan, penipuan, dan akses tidak sah.</li>
            <li>Memantau kesalahan dan memperbaiki kinerja layanan.</li>
            <li>Menjawab pertanyaan dukungan dan permintaan terkait data Anda.</li>
          </ul>
        ),
      },
      {
        title: "Penyimpanan dan pihak ketiga",
        body: (
          <>
            <p>
              Ledjer berjalan di Cloudflare Workers dan menyimpan data di Cloudflare D1. Cloudflare memproses data sebagai penyedia hosting dan basis data. Jika Anda memakai Google untuk masuk, Google memproses email dan profil dasar Anda untuk autentikasi. Sentry dapat menerima informasi kesalahan teknis untuk membantu kami mendiagnosis masalah.
            </p>
            <p>
              Data dapat diproses di luar Indonesia melalui jaringan global penyedia tersebut. Kami tidak menjual data pribadi dan tidak mengizinkan penyedia layanan memakainya untuk iklan.
            </p>
          </>
        ),
      },
      {
        title: "Berapa lama data disimpan",
        body: (
          <ul className="list-disc space-y-2 pl-5">
            <li>Akun aktif disimpan selama akun digunakan. Setelah permintaan penghapusan, akun dinonaktifkan dan dijadwalkan dihapus permanen setelah 90 hari.</li>
            <li>Sesi berakhir setelah logout, perubahan password, atau masa berlaku sesi habis.</li>
            <li>Catatan transaksi dan jurnal dapat disimpan lebih lama karena merupakan catatan keuangan usaha. Koreksi dilakukan dengan pembatalan berjejak, bukan penghapusan diam-diam.</li>
            <li>Log keamanan dan percobaan login disimpan untuk jangka waktu terbatas sesuai kebutuhan keamanan dan kewajiban yang berlaku.</li>
          </ul>
        ),
      },
      {
        title: "Hak Anda",
        body: (
          <>
            <p>
              Anda dapat melihat dan memperbarui nama usaha di Pengaturan, mengekspor transaksi ke CSV, dan meminta akses, koreksi, atau penghapusan data pribadi. Beberapa catatan keuangan mungkin tetap disimpan untuk memenuhi kewajiban pembukuan atau hukum.
            </p>
            <p>
              Kirim permintaan data pribadi melalui kanal privat di halaman <Link to="/contact" className="font-medium text-wood-700 underline decoration-wood-300 underline-offset-2 hover:text-wood-900">Kontak</Link>. Jangan menulis detail data pribadi di issue publik.
            </p>
          </>
        ),
      },
      {
        title: "Keamanan",
        body: (
          <p>
            Kami memakai HTTPS, cookie sesi HttpOnly dan Secure, pembatasan percobaan login, validasi input, serta pembatasan akses data per pengguna. Tidak ada sistem yang sepenuhnya bebas risiko. Jika menemukan masalah keamanan, ikuti langkah di halaman <Link to="/security" className="font-medium text-wood-700 underline decoration-wood-300 underline-offset-2 hover:text-wood-900">Keamanan</Link>.
          </p>
        ),
      },
      {
        title: "Perubahan kebijakan",
        body: (
          <p>
            Jika praktik data berubah secara material, kami akan memperbarui halaman ini dan menandai tanggal perubahan. Dengan terus memakai Ledjer setelah perubahan berlaku, Anda menerima kebijakan yang diperbarui.
          </p>
        ),
      },
      {
        title: "Kontak",
        body: (
          <p>
            Pertanyaan tentang privasi dapat dikirim melalui <ExternalLink href={CONTACT_URL}>issue repositori</ExternalLink> untuk hal umum, atau melalui <ExternalLink href={SECURITY_URL}>GitHub Security Advisory</ExternalLink> jika isinya sensitif.
          </p>
        ),
      },
    ],
  },
  terms: {
    title: "Syarat Layanan",
    description: "Ketentuan penggunaan Ledjer untuk akun dan pembukuan usaha Anda.",
    intro:
      "Dengan membuat akun atau memakai Ledjer, Anda setuju dengan ketentuan ini. Bacalah bersama Kebijakan Privasi sebelum mulai mencatat pembukuan.",
    sections: [
      {
        title: "Layanan",
        body: (
          <p>
            Ledjer membantu usaha kecil dan menengah mencatat transaksi, menyusun jurnal double-entry, dan membaca laporan keuangan. Fitur dapat berubah, ditambah, atau dihentikan seiring pengembangan produk.
          </p>
        ),
      },
      {
        title: "Akun Anda",
        body: (
          <ul className="list-disc space-y-2 pl-5">
            <li>Berikan informasi yang benar dan jaga kerahasiaan password serta akses ke perangkat Anda.</li>
            <li>Anda bertanggung jawab atas aktivitas yang terjadi melalui akun Anda.</li>
            <li>Beri tahu kami jika Anda menduga akun diakses tanpa izin.</li>
          </ul>
        ),
      },
      {
        title: "Data usaha",
        body: (
          <p>
            Data pembukuan yang Anda masukkan tetap milik Anda. Anda memberi kami izin terbatas untuk menyimpan, memproses, dan menampilkan data tersebut agar layanan dapat berjalan. Anda bertanggung jawab memastikan data yang dimasukkan tidak melanggar hak orang lain.
          </p>
        ),
      },
      {
        title: "Penggunaan yang dilarang",
        body: (
          <ul className="list-disc space-y-2 pl-5">
            <li>Mencoba mengakses akun, data, atau sistem orang lain tanpa izin.</li>
            <li>Mengganggu keamanan, ketersediaan, atau integritas layanan.</li>
            <li>Memakai Ledjer untuk kegiatan yang melanggar hukum atau untuk menyimpan data yang tidak berhak Anda proses.</li>
            <li>Menyalin, menjual, atau menyalahgunakan layanan di luar izin tertulis.</li>
          </ul>
        ),
      },
      {
        title: "Bukan nasihat keuangan",
        body: (
          <p>
            Ledjer adalah alat pencatatan. Laporan dan angka yang dihasilkan bergantung pada data yang Anda masukkan. Ledjer tidak memberikan nasihat pajak, investasi, hukum, atau akuntansi profesional. Untuk keputusan penting, konsultasikan dengan profesional yang kompeten.
          </p>
        ),
      },
      {
        title: "Ketersediaan dan perubahan",
        body: (
          <p>
            Kami berupaya menjaga layanan tetap tersedia, tetapi tidak menjanjikan layanan bebas gangguan. Pemeliharaan, gangguan penyedia, atau keadaan di luar kendali dapat membuat layanan sementara tidak tersedia. Kami dapat mengubah ketentuan ini dan akan memperbarui tanggal di halaman ini.
          </p>
        ),
      },
      {
        title: "Penghentian",
        body: (
          <p>
            Anda dapat berhenti memakai Ledjer kapan saja. Kami dapat menangguhkan atau menghentikan akses jika terjadi pelanggaran ketentuan, ancaman keamanan, atau kewajiban hukum. Ketentuan tentang data keuangan, batas tanggung jawab, dan penyelesaian sengketa tetap berlaku setelah penghentian.
          </p>
        ),
      },
      {
        title: "Batas tanggung jawab",
        body: (
          <p>
            Sepanjang diizinkan hukum, Ledjer tidak bertanggung jawab atas kerugian tidak langsung, kehilangan keuntungan, atau keputusan bisnis yang diambil berdasarkan laporan. Anda tetap bertanggung jawab memeriksa catatan dan menyimpan ekspor data penting.
          </p>
        ),
      },
      {
        title: "Hukum yang berlaku",
        body: (
          <p>
            Ketentuan ini tunduk pada hukum Republik Indonesia. Jika ada sengketa, para pihak akan berupaya menyelesaikannya secara musyawarah terlebih dahulu.
          </p>
        ),
      },
      {
        title: "Kontak",
        body: (
          <p>
            Pertanyaan tentang ketentuan ini dapat dikirim melalui <ExternalLink href={CONTACT_URL}>issue repositori</ExternalLink>.
          </p>
        ),
      },
    ],
  },
  security: {
    title: "Keamanan",
    description: "Cara melaporkan kerentanan dan kontrol keamanan yang dipakai Ledjer.",
    intro:
      "Keamanan data pembukuan adalah bagian dari kepercayaan produk. Halaman ini merangkum cara melaporkan masalah dan kontrol utama yang kami pakai.",
    sections: [
      {
        title: "Melaporkan kerentanan",
        body: (
          <>
            <p>
              Jangan membuka issue publik untuk kerentanan yang belum diperbaiki. Laporkan melalui <ExternalLink href={SECURITY_URL}>GitHub Security Advisory</ExternalLink> agar laporan dapat ditangani secara privat.
            </p>
            <p>
              Sertakan langkah reproduksi, dampak yang mungkin terjadi, dan versi atau URL yang terkena. Jangan mengakses, mengubah, atau membagikan data pengguna lain saat menguji.
            </p>
          </>
        ),
      },
      {
        title: "Kontrol teknis",
        body: (
          <ul className="list-disc space-y-2 pl-5">
            <li>HTTPS dan header keamanan, termasuk CSP, COOP/COEP, HSTS, dan X-Frame-Options.</li>
            <li>Cookie sesi HttpOnly, Secure, SameSite, dan berprefiks <code className="font-mono text-xs">__Host-</code>.</li>
            <li>Password di-hash dengan PBKDF2-SHA256 dan pepper; token sesi disimpan dalam bentuk hash.</li>
            <li>Validasi input, perlindungan CSRF berbasis origin, dan pembatasan percobaan login.</li>
            <li>Setiap query data dibatasi ke <code className="font-mono text-xs">user_id</code> pemilik akun.</li>
            <li>Dependensi dipindai secara berkala dan error tidak mengembalikan stack trace, SQL, atau rahasia ke pengguna.</li>
          </ul>
        ),
      },
      {
        title: "Cakupan",
        body: (
          <p>
            Versi terbaru yang berjalan di produksi menerima perbaikan keamanan. Kami tidak menjanjikan dukungan untuk salinan lama, fork, atau deployment pihak ketiga.
          </p>
        ),
      },
      {
        title: "Yang perlu Anda lakukan",
        body: (
          <ul className="list-disc space-y-2 pl-5">
            <li>Pakai password unik dan jangan membagikannya.</li>
            <li>Jaga akses ke email dan perangkat yang Anda pakai untuk masuk.</li>
            <li>Ekspor data penting secara berkala dan laporkan aktivitas mencurigakan.</li>
          </ul>
        ),
      },
    ],
  },
  contact: {
    title: "Kontak",
    description: "Kanal untuk pertanyaan produk, privasi, dan laporan keamanan Ledjer.",
    intro:
      "Pilih kanal yang sesuai agar pertanyaan Anda sampai ke orang yang tepat tanpa membuka data sensitif di tempat publik.",
    sections: [
      {
        title: "Pertanyaan produk dan akun",
        body: (
          <p>
            Buka <ExternalLink href={CONTACT_URL}>issue baru di repositori Ledjer</ExternalLink>. Jelaskan langkah yang sudah dicoba dan pesan kesalahan yang terlihat. Jangan sertakan password, token sesi, atau data pelanggan.
          </p>
        ),
      },
      {
        title: "Laporan keamanan",
        body: (
          <p>
            Gunakan <ExternalLink href={SECURITY_URL}>GitHub Security Advisory</ExternalLink>. Kanal ini privat dan lebih aman untuk detail kerentanan. Jangan mempublikasikan langkah eksploitasi di issue biasa.
          </p>
        ),
      },
      {
        title: "Permintaan data pribadi",
        body: (
          <p>
            Untuk akses, koreksi, atau penghapusan data pribadi, gunakan <ExternalLink href={SECURITY_URL}>GitHub Security Advisory</ExternalLink> dan tulis “Permintaan data pribadi” pada judul. Kami mungkin meminta verifikasi kepemilikan akun sebelum memproses permintaan.
          </p>
        ),
      },
      {
        title: "Waktu respons",
        body: (
          <p>
            Kami berupaya menjawab dalam beberapa hari kerja. Laporan keamanan yang berdampak tinggi diprioritaskan. Waktu respons dapat lebih lama pada akhir pekan atau hari libur.
          </p>
        ),
      },
      {
        title: "Repositori",
        body: (
          <p>
            Informasi teknis dan riwayat perubahan tersedia di <ExternalLink href={REPO_URL}>repositori Ledjer</ExternalLink>.
          </p>
        ),
      },
    ],
  },
  refund: {
    title: "Kebijakan Pengembalian Dana",
    description: "Status biaya dan kebijakan pengembalian dana Ledjer.",
    intro:
      "Ledjer saat ini dapat dipakai tanpa biaya. Karena belum ada pembayaran, belum ada dana yang perlu dikembalikan.",
    sections: [
      {
        title: "Status biaya",
        body: (
          <p>
            Tidak ada langganan berbayar, biaya setup, atau tagihan kartu kredit untuk memakai Ledjer saat ini. Anda tidak perlu memberikan data pembayaran untuk membuat akun.
          </p>
        ),
      },
      {
        title: "Jika model biaya berubah",
        body: (
          <p>
            Jika kami memperkenalkan paket berbayar, harga, masa uji, dan ketentuan pengembalian dana akan dijelaskan sebelum Anda membayar. Ketentuan itu akan menggantikan halaman ini untuk pembelian yang dilakukan setelahnya.
          </p>
        ),
      },
      {
        title: "Pertanyaan",
        body: (
          <p>
            Jika Anda melihat tagihan yang tidak Anda kenali, jangan mengirim data kartu melalui issue publik. Hubungi kami melalui <ExternalLink href={SECURITY_URL}>GitHub Security Advisory</ExternalLink> agar dapat diperiksa secara privat.
          </p>
        ),
      },
    ],
  },
};

export function LegalPage({ page }: Readonly<{ page: LegalPageId }>) {
  const document = documents[page];

  return (
    <article className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
      <p className="text-xs font-semibold uppercase tracking-wide text-wood-500">Dokumen Ledjer</p>
      <h1 className="mt-2 text-3xl font-bold text-wood-900 sm:text-4xl">{document.title}</h1>
      <p className="mt-3 text-base leading-relaxed text-wood-700">{document.intro}</p>
      <p className="mt-2 text-xs text-wood-500">Terakhir diperbarui: {UPDATED}</p>

      <div className="mt-8 space-y-8">
        {document.sections.map((section) => (
          <section key={section.title}>
            <h2 className="text-lg font-semibold text-wood-900">{section.title}</h2>
            <div className="mt-2 space-y-3 text-sm leading-relaxed text-wood-700">{section.body}</div>
          </section>
        ))}
      </div>

      <p className="mt-10 border-t border-wood-200 pt-4 text-sm text-wood-600">
        Ada pertanyaan?{" "}
        <Link to="/contact" className="font-medium text-wood-700 underline decoration-wood-300 underline-offset-2 hover:text-wood-900">
          Hubungi kami
        </Link>
        .
      </p>
    </article>
  );
}
