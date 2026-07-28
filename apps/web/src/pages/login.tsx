import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { z } from "zod/v3";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Logo } from "@/components/ui/logo";
import { AuthBrandPanel } from "@/components/auth-brand-panel";
import { GoogleAuthButton } from "@/components/google-auth-button";
import { translateError } from "@/lib/errors";
import { getSafeRedirectPath } from "@/lib/redirect";
import { useCooldown } from "@/hooks/useCooldown";
import { isApiError } from "@/lib/api/client";
import { startGoogleAuth } from "@/lib/api/auth";
import { Lock, Envelope } from "reicon-react";

const loginSchema = z.object({
  email: z.string().email("Email tidak valid"),
  password: z.string().min(1, "Password wajib diisi"),
});

type LoginForm = z.infer<typeof loginSchema>;
export function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { signIn, resendConfirmationEmail } = useAuth();
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rateLimited, setRateLimited] = useState(false);

  // Email-not-confirmed state
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [resendLoading, setResendLoading] = useState(false);
  const resendCooldown = useCooldown({ duration: 60 });
  const [resendMessage, setResendMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginForm) => {
    if (loading || oauthLoading) return;
    const email = data.email.trim().toLowerCase();

    setLoading(true);
    setError(null);
    try {
      await signIn(email, data.password);
      navigate(getSafeRedirectPath(searchParams.get("redirect"), "/dashboard"));
    } catch (err) {
      const message = translateError(err);
      setError(message);

      if (isApiError(err) && err.code === "rate_limited") {
        setRateLimited(true);
      }

      // Detect "email not confirmed" so we can offer a resend action.
      if (isApiError(err) && err.code === "email_not_confirmed") {
        setUnverifiedEmail(email);
        resendCooldown.start();
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResendFromLogin = async () => {
    if (!unverifiedEmail || resendLoading || resendCooldown.isActive) return;
    setResendLoading(true);
    setResendMessage(null);
    try {
      await resendConfirmationEmail(unverifiedEmail);
      setResendMessage("Email konfirmasi telah dikirim ulang.");
      resendCooldown.start();
    } catch (err) {
      setError(translateError(err));
    } finally {
      setResendLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (loading || oauthLoading) return;
    setOauthLoading(true);
    setError(null);
    try {
      const response = await startGoogleAuth();
      if (!response.url) throw new Error("Google OAuth is not configured yet");
      window.location.assign(response.url);
    } catch (err) {
      setError(translateError(err));
      setOauthLoading(false);
    }
  };

  return (
    <div className="ledger-page ledger-min-dvh bg-cream-100 lg:grid lg:grid-cols-3">
      {/* Brand panel — 33% */}
      <AuthBrandPanel
        className="col-span-1"
        title="Masuk ke pembukuan yang rapi."
        description="Transaksi, stok, dan laporan tersambung dalam satu alur yang bisa ditelusuri."
        entries={[
          { label: "Penjualan tunai", amount: "+8,5 jt", tone: "leaf" },
          { label: "Pembelian bahan", amount: "-3,2 jt", tone: "clay" },
          { label: "Saldo kas", amount: "45,2 jt", tone: "wood" },
        ]}
      />

      {/* Form — 67% */}
      <div className="col-span-1 flex items-center justify-center p-4 sm:p-6 lg:min-h-0 lg:col-span-2">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="mb-8 flex justify-center lg:hidden">
            <Logo size="md" variant="full" />
          </div>

          <Card className="p-6">
            <CardContent>
              <h1 className="text-xl font-bold text-text-primary">Masuk</h1>
              <p className="mt-1 text-sm text-text-secondary">
                Masuk ke akun Anda.
              </p>

              {error && (
                <div className="mt-4 rounded-lg bg-error/10 p-3 text-sm text-error" role="alert">
                  {error}
                </div>
              )}

              {unverifiedEmail && (
                <div className="mt-4 space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="alert">
                  <p>
                    Email <span className="font-medium break-all">{unverifiedEmail}</span>{" "}
                    belum dikonfirmasi.
                  </p>
                  {resendMessage && (
                    <p className="text-amber-800">{resendMessage}</p>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    fullWidth
                    onClick={handleResendFromLogin}
                    loading={resendLoading}
                    disabled={resendLoading || resendCooldown.isActive}
                  >
                    {resendCooldown.isActive
                      ? `Kirim ulang (${resendCooldown.remaining}s)`
                      : "Kirim ulang email konfirmasi"}
                  </Button>
                </div>
              )}

              <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
                <Input
                  {...register("email")}
                  label="Email"
                  type="email"
                  placeholder="email@contoh.com"
                  prefix={<Envelope className="h-4 w-4 text-wood-500" />}
                  error={errors.email?.message}
                  disabled={rateLimited}
                  autoComplete="email"
                />

                <Input
                  {...register("password")}
                  label="Password"
                  type="password"
                  placeholder="Password"
                  prefix={<Lock className="h-4 w-4 text-wood-500" />}
                  error={errors.password?.message}
                  disabled={rateLimited}
                  autoComplete="current-password"
                />

                <div className="text-right">
                  <Link
                    to="/forgot-password"
                    className="text-sm font-medium text-wood-600 hover:text-wood-800"
                  >
                    Lupa password?
                  </Link>
                </div>

                <Button type="submit" fullWidth loading={loading} disabled={rateLimited || oauthLoading}>
                  Masuk
                </Button>
              </form>

              <div className="relative mt-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-wood-200"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="bg-surface px-2 text-wood-500">atau</span>
                </div>
              </div>

              <GoogleAuthButton
                mode="login"
                onClick={handleGoogleSignIn}
                loading={oauthLoading}
                disabled={loading || rateLimited || oauthLoading}
              />

              <p className="mt-4 text-center text-sm text-wood-500">
                Belum punya akun?{" "}
                <Link to="/register" className="font-medium text-wood-600 hover:text-wood-800">
                  Daftar
                </Link>
              </p>
            </CardContent>
          </Card>

          {/* Security notice */}
          <p className="mt-6 text-center text-xs text-wood-500">
            Koneksi terenkripsi. Data Anda aman.
          </p>
        </div>
      </div>
    </div>
  );
}
