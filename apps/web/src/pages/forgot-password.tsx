import { useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { z } from "zod/v3";
import { zodResolver } from "@hookform/resolvers/zod";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Logo } from "@/components/ui/logo";
import { AuthBrandPanel } from "@/components/auth-brand-panel";
import { translateError } from "@/lib/errors";
import { forgotPassword } from "@/lib/api/auth";

const forgotSchema = z.object({
  email: z.string().email("Email tidak valid"),
});

type ForgotForm = z.infer<typeof forgotSchema>;

/**
 * "Lupa password?" landing page.
 *
 * Asks for the email and calls the Worker password recovery endpoint.
 *
 * Security notes:
 *  - Always shows the same success message regardless of whether the
 *    email exists. Prevents account enumeration.
 *  - Server-side rate limiting is handled by the Worker auth service.
 */
export function ForgotPasswordPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotForm>({
    resolver: zodResolver(forgotSchema),
  });

  const onSubmit = async (data: ForgotForm) => {
    if (loading) return;
    const email = data.email.trim().toLowerCase();

    setLoading(true);
    setError(null);
    try {
      await forgotPassword(email);
      // Move to "check your inbox" view regardless of whether the email
      // actually exists — prevents account enumeration.
      setSubmittedEmail(email);
    } catch (err) {
      // Auth-level errors that could reveal account existence → show
      // success view anyway to prevent account enumeration.
      const msg = String((err as Error)?.message ?? '').toLowerCase();
      const isAuthEnumLeak = [
        'user not found', 'user_not_found', 'email not found',
        'email_not_confirmed', 'not confirmed', 'signup disabled',
        'signups not allowed', 'email address .* is invalid',
      ].some((p) => msg.includes(p));
      if (isAuthEnumLeak) {
        setSubmittedEmail(email);
      } else {
        setError(translateError(err));
      }
    } finally {
      setLoading(false);
    }
  };

  // ── Success view ──────────────────────────────────────────────────
  if (submittedEmail) {
    return (
      <div className="ledger-page ledger-min-dvh bg-cream-100 lg:grid lg:grid-cols-3">
        <AuthBrandPanel
          className="col-span-1"
          title="Pemulihan password."
          description="Kami akan mengirim tautan untuk mengatur ulang password Anda. Cek kotak masuk dan folder spam."
          entries={[
            { label: "Email dikirim", amount: "✓", tone: "leaf" },
            { label: "Atur password baru", amount: "—", tone: "wood" },
            { label: "Masuk kembali", amount: "—", tone: "clay" },
          ]}
        />

        <div className="col-span-1 flex items-center justify-center p-4 sm:p-6 lg:min-h-0 lg:col-span-2">
          <div className="w-full max-w-sm">
            <div className="mb-8 flex justify-center lg:hidden">
              <Logo size="md" variant="full" />
            </div>

            <Card padding="lg">
              <CardContent>
                <div className="flex flex-col items-center text-center">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-leaf-50 text-leaf-700">
                    <Mail className="h-6 w-6" />
                  </div>
                  <h1 className="text-xl font-bold text-text-primary">
                    Cek email Anda
                  </h1>
                  <p className="mt-2 text-sm text-text-secondary">
                    Jika email{" "}
                    <span className="font-medium break-all text-text-primary">
                      {submittedEmail}
                    </span>{" "}
                    terdaftar, kami telah mengirim tautan pemulihan. Klik
                    tautan tersebut untuk mengatur password baru.
                  </p>
                </div>

                <div className="mt-6 space-y-3 rounded-lg border border-wood-100 bg-cream-50 p-4 text-xs text-text-secondary">
                  <p>Tidak menerima email? Periksa folder spam atau promosi.</p>
                  <p>Tautan berlaku selama 1 jam.</p>
                </div>

                <div className="mt-6 text-center text-sm text-wood-500">
                  Sudah ingat password Anda?{" "}
                  <Link
                    to="/login"
                    className="font-medium text-wood-600 hover:text-wood-800"
                  >
                    Kembali ke halaman masuk
                  </Link>
                </div>
              </CardContent>
            </Card>

            <p className="mt-6 text-center text-xs text-wood-500">
              Koneksi terenkripsi. Data Anda aman.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Email form view ──────────────────────────────────────────────
  return (      <div className="ledger-page ledger-min-dvh bg-cream-100 lg:grid lg:grid-cols-3">
      <AuthBrandPanel
        className="col-span-1"
        title="Lupa password Anda?"
        description="Masukkan email akun Anda. Kami akan mengirim tautan untuk mengatur ulang password."
        entries={[
          { label: "Masukkan email", amount: "1/2", tone: "leaf" },
          { label: "Cek inbox", amount: "—", tone: "wood" },
          { label: "Atur password baru", amount: "—", tone: "clay" },
        ]}
      />

      <div className="col-span-1 flex items-center justify-center p-4 sm:p-6 lg:min-h-0 lg:col-span-2">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex justify-center lg:hidden">
            <Logo size="md" variant="full" />
          </div>

          <Card padding="lg">
            <CardContent>
              <h1 className="text-center text-xl font-bold text-text-primary">
                Atur Ulang Password
              </h1>
              <p className="mt-2 text-center text-sm text-text-secondary">
                Masukkan email akun Anda untuk menerima tautan pemulihan.
              </p>

              <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
                {error && (
                  <div
                    className="rounded-lg bg-error/10 p-3 text-sm text-error"
                    role="alert"
                  >
                    {error}
                  </div>
                )}

                <Input
                  {...register("email")}
                  label="Email"
                  type="email"
                  placeholder="email@contoh.com"
                  prefix={<Mail className="h-4 w-4 text-wood-400" />}
                  error={errors.email?.message}
                  disabled={loading}
                  autoComplete="email"
                />

                <Button
                  type="submit"
                  fullWidth
                  loading={loading}
                  disabled={loading}
                >
                  Kirim tautan pemulihan
                </Button>
              </form>

              <p className="mt-6 text-center text-sm text-wood-500">
                Ingat password Anda?{" "}
                <Link
                  to="/login"
                  className="font-medium text-wood-600 hover:text-wood-800"
                >
                  Masuk
                </Link>
              </p>
            </CardContent>
          </Card>

          <p className="mt-6 text-center text-xs text-wood-500">
            Koneksi terenkripsi. Data Anda aman.
          </p>
        </div>
      </div>
    </div>
  );
}
