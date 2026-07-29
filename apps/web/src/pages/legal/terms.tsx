import { Card, CardContent } from "@/components/ui/card";

/**
 * Terms of Service page.
 * ⚠️ REQUIRES LEGAL REVIEW before public launch.
 * This is a scaffold with reasonable defaults for an Indonesian SaaS.
 */

export function TermsOfServicePage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Syarat & Ketentuan</h1>
        <p className="mt-1 text-sm text-wood-500">
          Terakhir diperbarui: 26 Juni 2026 · ⚠️ Membutuhkan review legal sebelum peluncuran
        </p>
      </div>

      <Card>
        <CardContent className="prose prose-wood max-w-none space-y-4 text-sm leading-relaxed text-wood-700">
          <section>
            <h2 className="text-lg font-semibold text-wood-800">1. Penerimaan Syarat</h2>
            <p>
              Dengan mengakses dan menggunakan Ledjer ("Layanan"), Anda menyetujui syarat dan ketentuan ini.
              Jika Anda tidak menyetujui, jangan menggunakan Layanan.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-wood-800">2. Deskripsi Layanan</h2>
            <p>
              Ledjer adalah aplikasi pembukuan daring untuk UMKM Indonesia. Layanan mencakup pencatatan
              transaksi, laporan keuangan, manajemen stok, dan fitur terkait pembukuan lainnya.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-wood-800">3. Akun Pengguna</h2>
            <p>
              Anda bertanggung jawab untuk menjaga keamanan akun Anda. Anda harus segera memberitahu
              kami jika ada penggunaan akun Anda yang tidak sah.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-wood-800">4. Akses Layanan</h2>
            <p>
              Ledjer saat ini tersedia gratis tanpa kartu kredit dan tanpa biaya berlangganan.
              Anda dapat memberikan dukungan sukarela melalui Trakteer. Dukungan ini tidak
              memengaruhi akses Anda ke Ledjer.
            </p>
            <p className="mt-2 text-xs text-wood-500">
              ⚠️ Transaksi dukungan dilakukan di platform Trakteer dan diatur oleh kebijakan
              Trakteer. Ledjer tidak memproses pembayaran dukungan secara langsung.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-wood-800">5. Kewajiban Pengguna</h2>
            <p>
              Anda bertanggung jawab atas keakuratan data yang dimasukkan ke Layanan. Ledjer tidak
              memberikan saran akuntansi atau pajak. Gunakan data dari Layanan sebagai referensi,
              bukan pengganti konsultasi profesional.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-wood-800">6. Kekayaan Intelektual</h2>
            <p>
              Semua hak atas Layanan, termasuk kode, desain, dan konten, adalah milik Ledjer.
              Anda tidak diperkenankan menyalin, memodifikasi, atau mendistribusikan bagian mana pun
              dari Layanan tanpa izin tertulis.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-wood-800">7. Batasan Tanggung Jawab</h2>
            <p>
              Ledjer disediakan "sebagaimana adanya" tanpa jaminan apa pun. Kami tidak bertanggung
              jawab atas kerugian akibat penggunaan Layanan, termasuk namun tidak terbatas pada
              kehilangan data atau kerugian finansial.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-wood-800">8. Penghentian Layanan</h2>
            <p>
              Kami berhak menangguhkan atau menghentikan akses Anda ke Layanan jika kami menduga
              pelanggaran terhadap syarat ini atau aktivitas yang merugikan pengguna lain.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-wood-800">9. Perubahan Syarat</h2>
            <p>
              Kami dapat memperbarui syarat ini dari waktu ke waktu. Perubahan akan diberitahukan
              melalui Layanan atau email. Penggunaan berkelanjutan setelah perubahan berarti Anda
              menyetujui syarat yang baru.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-wood-800">10. Hukum yang Berlaku</h2>
            <p>
              Syarat ini tunduk pada hukum Republik Indonesia. Sengketa akan diselesaikan melalui
              pengadilan yang berwenang di Indonesia.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-wood-800">11. Kontak</h2>
            <p>
              Untuk pertanyaan mengenai syarat ini, hubungi kami di{" "}
              <a href="mailto:support@ledjer.id" className="text-leaf-600 underline">support@ledjer.id</a>.
            </p>
          </section>
        </CardContent>
      </Card>
    </div>
  );
}
