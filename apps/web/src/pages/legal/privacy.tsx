import { Card, CardContent } from "@/components/ui/card";

/**
 * Privacy Policy page.
 * ⚠️ REQUIRES LEGAL REVIEW before public launch.
 */

export function PrivacyPolicyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Kebijakan Privasi</h1>
        <p className="mt-1 text-sm text-wood-500">
          Terakhir diperbarui: 26 Juni 2026 · ⚠️ Membutuhkan review legal sebelum peluncuran
        </p>
      </div>

      <Card>
        <CardContent className="prose prose-wood max-w-none space-y-4 text-sm leading-relaxed text-wood-700">
          <section>
            <h2 className="text-lg font-semibold text-wood-800">1. Pendahuluan</h2>
            <p>
              Ledjer ("kami") menghargai privasi Anda. Kebijakan ini menjelaskan bagaimana kami
              mengumpulkan, menggunakan, dan melindungi informasi pribadi Anda saat menggunakan
              Layanan kami.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-wood-800">2. Data yang Kami Kumpulkan</h2>
            <p>Kami mengumpulkan jenis data berikut:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <strong>Data Akun:</strong> nama, alamat email, dan informasi autentikasi yang
                dikelola oleh Ledjer.
              </li>
              <li>
                <strong>Data Organisasi:</strong> nama bisnis, jenis usaha, mata uang, dan
                pengaturan pembukuan.
              </li>
              <li>
                <strong>Data Bisnis/Keuangan:</strong> transaksi, jurnal, akun, produk, stok, dan
                laporan keuangan yang Anda buat menggunakan Layanan.
              </li>
              <li>
                <strong>Log & Analitik:</strong> log kesalahan (melalui Sentry), data performa,
                dan aktivitas sistem untuk pemeliharaan.
              </li>
              <li>
                <strong>Komunikasi:</strong> pesan yang Anda kirimkan kepada tim support kami.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-wood-800">3. Penggunaan Data</h2>
            <p>Kami menggunakan data Anda untuk:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Menyediakan dan memelihara Layanan</li>
              <li>Mengirimkan pemberitahuan terkait Layanan</li>
              <li>Menanggapi permintaan support</li>
              <li>Memperbaiki dan meningkatkan Layanan</li>
              <li>Mematuhi kewajiban hukum</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-wood-800">4. Penyimpanan & Keamanan Data</h2>
            <p>
              Data Anda disimpan di Cloudflare D1. Akses organisasi diperiksa di Worker API untuk
              memastikan setiap bisnis hanya dapat mengakses datanya sendiri. Enkripsi TLS
              digunakan untuk semua komunikasi.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-wood-800">5. Berbagi Data</h2>
            <p>
              Kami tidak menjual atau menyewakan data pribadi Anda kepada pihak ketiga. Data hanya
              dibagikan dengan:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Penyedia infrastruktur (Cloudflare)</li>
              <li>Penyedia error tracking (Sentry)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-wood-800">6. Hak Anda</h2>
            <p>Anda berhak untuk:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Mengakses data pribadi Anda</li>
              <li>Memperbaiki data yang tidak akurat</li>
              <li>Meminta penghapusan data Anda</li>
              <li>Mengekspor data Anda dalam format CSV</li>
              <li>Menolak pemrosesan data tertentu</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-wood-800">7. Retensi Data</h2>
            <p>
              Data Anda dipertahankan selama akun Anda aktif. Setelah penghapusan akun, data akan
              dihapus dari server aktif dalam 30 hari. Backup mungkin mempertahankan data lebih
              lama sesuai siklus backup.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-wood-800">8. Cookie</h2>
            <p>
              Layanan menggunakan cookie yang diperlukan untuk autentikasi dan sesi. Kami tidak
              menggunakan cookie pelacakan pihak ketiga untuk iklan.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-wood-800">9. Perubahan Kebijakan</h2>
            <p>
              Kami dapat memperbarui kebijakan ini dari waktu ke waktu. Perubahan signifikan akan
              diberitahukan melalui Layanan atau email.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-wood-800">10. Kontak</h2>
            <p>
              Untuk pertanyaan mengenai privasi, hubungi kami di{" "}
              <a href="mailto:privacy@ledjer.id" className="text-leaf-600 underline">privacy@ledjer.id</a>.
            </p>
          </section>
        </CardContent>
      </Card>
    </div>
  );
}
