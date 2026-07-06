import { Card, CardContent } from "@/components/ui/card";

/**
 * Service policy page.
 * ⚠️ REQUIRES LEGAL REVIEW before public launch.
 */

export function RefundPolicyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Kebijakan Layanan</h1>
        <p className="mt-1 text-sm text-wood-500">
          Terakhir diperbarui: 26 Juni 2026 · ⚠️ Membutuhkan review legal sebelum peluncuran
        </p>
      </div>

      <Card>
        <CardContent className="prose prose-wood max-w-none space-y-4 text-sm leading-relaxed text-wood-700">
          <section>
            <h2 className="text-lg font-semibold text-wood-800">1. Akses Layanan</h2>
            <p>
              Ledjer saat ini tersedia gratis. Tidak ada kartu kredit atau pembayaran yang
              diperlukan untuk menggunakan fitur yang tersedia.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-wood-800">2. Biaya</h2>
            <p>
              Selama periode gratis ini, Ledjer tidak memungut biaya penggunaan atau biaya transaksi.
              Jika kebijakan harga berubah, kami akan memperbarui informasi layanan terlebih dahulu.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-wood-800">3. Pengembalian Dana</h2>
            <p>
              Karena Ledjer saat ini tidak memproses pembayaran, tidak ada pengembalian dana yang
              berlaku untuk penggunaan layanan.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-wood-800">4. Penghentian Penggunaan</h2>
            <p>
              Anda dapat berhenti menggunakan Ledjer kapan saja. Untuk permintaan terkait akun atau
              data, hubungi kami melalui alamat kontak di bawah.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-wood-800">5. Perubahan Kebijakan</h2>
            <p>
              Kami dapat memperbarui kebijakan ini dari waktu ke waktu. Perubahan material akan
              dicantumkan pada halaman ini.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-wood-800">6. Ketersediaan Layanan</h2>
            <p>
              Kami berupaya menjaga layanan tetap tersedia, namun gangguan teknis dapat terjadi.
              Jika ada kendala akses, hubungi kami agar dapat ditindaklanjuti.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-wood-800">7. Kontak</h2>
            <p>
              Untuk pertanyaan mengenai layanan, hubungi kami di{" "}
              <a href="mailto:projects.eiai@gmail.com" className="text-leaf-600 underline">
                projects.eiai@gmail.com
              </a>
              .
            </p>
          </section>
        </CardContent>
      </Card>
    </div>
  );
}
