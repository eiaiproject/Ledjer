import { Card, CardContent } from "@/components/ui/card";
import { Shield, Lock, Eye, Database, Key, AlertTriangle } from "reicon-react";

/**
 * Security Policy / Responsible Disclosure page.
 * ⚠️ REQUIRES REVIEW before public launch.
 */

const securityMeasures = [
  {
    icon: Lock,
    title: "Enkripsi Data",
    desc: "Semua komunikasi menggunakan TLS/HTTPS. Data di database dienkripsi saat transit.",
  },
  {
    icon: Database,
    title: "Isolasi Data",
    desc: "Setiap bisnis terisolasi melalui pemeriksaan organisasi di Worker API dan database.",
  },
  {
    icon: Key,
    title: "Autentikasi",
    desc: "Autentikasi dikelola oleh Ledjer Worker dengan sesi cookie, CSRF protection, dan verifikasi email.",
  },
  {
    icon: Eye,
    title: "Audit Log",
    desc: "Semua aktivitas finansial penting tercatat dalam audit log yang tidak dapat diubah.",
  },
  {
    icon: Shield,
    title: "Akses Berbasis Peran",
    desc: "Pemilik dan staf memiliki hak akses yang berbeda. Izin diperiksa di service layer.",
  },
  {
    icon: AlertTriangle,
    title: "Monitoring",
    desc: "Error tracking dan monitoring aktif untuk mendeteksi masalah keamanan.",
  },
];

export function SecurityPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Kebijakan Keamanan</h1>
        <p className="mt-1 text-sm text-wood-500">
          Keamanan data Anda adalah prioritas kami.
        </p>
      </div>

      <section>
        <h2 className="mb-4 text-lg font-semibold text-wood-800">Langkah-Langkah Keamanan</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {securityMeasures.map((item) => (
            <Card key={item.title}>
              <CardContent className="flex items-start gap-3 p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-leaf-50 text-leaf-600">
                  <item.icon className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-wood-800">{item.title}</h3>
                  <p className="mt-1 text-xs text-wood-600">{item.desc}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <Card>
        <CardContent className="space-y-4 text-sm leading-relaxed text-wood-700">
          <section>
            <h2 className="text-lg font-semibold text-wood-800">Pelaporan Kerentanan</h2>
            <p>
              Jika Anda menemukan kerentanan keamanan di Ledjer, mohon laporkan secara
              bertanggung jawab kepada kami. Kami berkomitmen untuk menanggapi setiap laporan
              dalam waktu 48 jam.
            </p>
            <p className="mt-2">
              Kirimkan laporan ke{" "}
              <a href="mailto:security@ledjer.id" className="text-leaf-600 underline">
                security@ledjer.id
              </a>{" "}
              dengan detail:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Deskripsi kerentanan</li>
              <li>Langkah-langkah untuk mereproduksi</li>
              <li>Potensi dampak</li>
              <li>Saran perbaikan (jika ada)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-wood-800">Bugs Bounty</h2>
            <p>
              Saat ini kami belum memiliki program bugs bounty resmi. Namun, kami sangat menghargai
              kontribusi researcher keamanan yang membantu melindungi pengguna kami.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-wood-800">Infrastruktur</h2>
            <p>
              Ledjer berjalan di Cloudflare Workers dengan Cloudflare D1 sebagai database.
              Semua infrastruktur berjalan di data center yang mematuhi standar keamanan
              internasional.
            </p>
          </section>
        </CardContent>
      </Card>
    </div>
  );
}
