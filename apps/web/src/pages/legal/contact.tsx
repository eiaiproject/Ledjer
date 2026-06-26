import { Card, CardContent } from "@/components/ui/card";
import { Mail, MessageCircle, BookOpen, Bug } from "lucide-react";

/**
 * Contact / Support page.
 */

const contactMethods = [
  {
    icon: Mail,
    title: "Email Support",
    description: "Untuk pertanyaan umum, masalah akun, atau bantuan teknis.",
    action: "support@ledjer.id",
    href: "mailto:support@ledjer.id",
  },
  {
    icon: MessageCircle,
    title: "WhatsApp",
    description: "Chat langsung untuk pertanyaan cepat.",
    action: "Chat via WhatsApp",
    href: "https://wa.me/6281234567890",
  },
  {
    icon: Bug,
    title: "Laporkan Bug",
    description: "Temukan bug? Laporkan di sini.",
    action: "bug@ledjer.id",
    href: "mailto:bug@ledjer.id",
  },
  {
    icon: BookOpen,
    title: "Dokumentasi",
    description: "Panduan penggunaan dan FAQ.",
    action: "Baca dokumentasi",
    href: "#",
  },
];

export function ContactPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Hubungi Kami</h1>
        <p className="mt-1 text-sm text-wood-500">
          Tim support kami siap membantu Anda.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {contactMethods.map((method) => (
          <Card key={method.title}>
            <CardContent className="flex flex-col gap-3 p-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-leaf-50 text-leaf-600">
                <method.icon className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-wood-800">{method.title}</h3>
                <p className="mt-1 text-xs text-wood-600">{method.description}</p>
              </div>
              <a
                href={method.href}
                target={method.href.startsWith("http") ? "_blank" : undefined}
                rel={method.href.startsWith("http") ? "noopener noreferrer" : undefined}
                className="mt-auto text-sm font-medium text-leaf-600 underline-offset-4 hover:underline"
              >
                {method.action}
              </a>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="space-y-3 text-sm text-wood-700">
          <h2 className="font-semibold text-wood-800">Jam Operasional</h2>
          <p>
            Email support: Dibalas dalam 1×24 jam di hari kerja.
            <br />
            WhatsApp: Senin–Jumat, 09:00–17:00 WIB.
          </p>
          <p className="text-xs text-wood-500">
            Untuk masalah mendesak terkait keamanan, kirim email ke{" "}
            <a href="mailto:security@ledjer.id" className="text-leaf-600 underline">
              security@ledjer.id
            </a>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
