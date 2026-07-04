import { Card, CardContent } from "@/components/ui/card";

/**
 * Refund & Billing Policy page.
 * ⚠️ REQUIRES LEGAL REVIEW before public launch.
 */

export function RefundPolicyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Kebijakan Pengembalian & Billing</h1>
        <p className="mt-1 text-sm text-wood-500">
          Terakhir diperbarui: 26 Juni 2026 · ⚠️ Membutuhkan review legal sebelum peluncuran
        </p>
      </div>

      <Card>
        <CardContent className="prose prose-wood max-w-none space-y-4 text-sm leading-relaxed text-wood-700">
          <section>
            <h2 className="text-lg font-semibold text-wood-800">1. Masa Uji Coba</h2>
            <p>
              Ledjer menawarkan masa uji coba gratis untuk paket berbayar. Tidak ada kartu kredit
              yang diperlukan untuk memulai masa uji coba. Setelah masa uji coba berakhir, akun
              akan dikembalikan ke paket gratis.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-wood-800">2. Pembayaran</h2>
            <p>
              Pembayaran paket berbayar dilakukan di muka untuk periode bulanan atau tahunan.
              Harga tercantum dalam Rupiah (IDR) dan sudah termasuk pajak yang berlaku.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-wood-800">3. Pengembalian Dana</h2>
            <p>
              Karena Layanan kami bersifat digital dan dapat langsung digunakan, pengembalian dana
              hanya tersedia dalam kondisi berikut:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Pembayaran duplikat karena kesalahan sistem</li>
              <li>Layanan tidak dapat digunakan selama lebih dari 48 jam karena kesalahan kami</li>
              <li>Pembatalan dalam 7 hari pertama langganan baru (satu kali saja)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-wood-800">4. Pembatalan</h2>
            <p>
              Anda dapat membatalkan langganan kapan saja dari pengaturan akun. Pembatalan berlaku
              pada akhir periode billing saat ini. Anda tetap dapat menggunakan Layanan hingga
              periode berakhir.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-wood-800">5. Perubahan Paket</h2>
            <p>
              Upgrade berlaku segera dengan prorata pembayaran. Downgrade berlaku pada akhir
              periode billing saat ini.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-wood-800">6. Pembayaran Gagal</h2>
            <p>
              Jika pembayaran gagal, kami akan mencoba ulang dalam 3 hari. Jika pembayaran tetap
              gagal, langganan akan ditangguhkan hingga pembayaran berhasil.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-wood-800">7. Kontak</h2>
            <p>
              Untuk pertanyaan mengenai billing, hubungi kami di{" "}
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
