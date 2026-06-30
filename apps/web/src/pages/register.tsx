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
import { buildAuthCallbackUrl, buildRedirectSearch, getSafeRedirectPath } from "@/lib/redirect";
import { supabase } from "@/lib/supabase";
import { useCooldown } from "@/hooks/useCooldown";
import { Lock, Mail, User } from "lucide-react";

const registerSchema = z.object({
  fullName: z.string().min(2, "Nama harus minimal 2 karakter"),
  email: z.string().email("Email tidak valid"),
  password: z
    .string()
    .min(8, "Password harus minimal 8 karakter")
    .regex(/[A-Z]/, "Password harus mengandung minimal 1 huruf besar")
    .regex(/[0-9]/, "Password harus mengandung minimal 1 angka"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Password tidak cocok",
  path: ["confirmPassword"],
});

type RegisterForm = z.infer<typeof registerSchema>;

export function RegisterPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { signUp, resendConfirmationEmail } = useAuth();
  const [oauthLoading, setOauthLoading] = useState(false);
  const redirectPath = getSafeRedirectPath(searchParams.get("redirect"), "/onboarding");
  const loginPath = redirectPath === "/onboarding"
    ? "/login"
    : `/login?${buildRedirectSearch(redirectPath)}`;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Email confirmation state
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [resendLoading, setResendLoading] = useState(false);
  const resendCooldown = useCooldown({ duration: 60 });
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
  });

  const handleGoogleSignUp = async () => {
    if (loading || oauthLoading) return;
    setOauthLoading(true);
    setError(null);
    try {
      const callbackUrl = buildAuthCallbackUrl(redirectPath, "/onboarding");
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: callbackUrl.toString() },
      });
      if (error) throw error;
    } catch (err) {
      setError(translateError(err));
      setOauthLoading(false);
    }
  };

  const onSubmit = async (data: RegisterForm) => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const result = await signUp(
        data.email.trim().toLowerCase(),
        data.password,
        data.fullName,
        redirectPath
      );
      if (result.needsEmailConfirmation) {
        // Show "check your email" view instead of redirecting.
        setPendingEmail(data.email.trim().toLowerCase());
        resendCooldown.start();
      } else {
        // Confirmations disabled: proceed straight to onboarding.
        navigate(redirectPath);
      }
    } catch (err) {
      setError(translateError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!pendingEmail || resendLoading || resendCooldown.isActive) return;
    setResendLoading(true);
    setResendMessage(null);
    setResendError(null);
    try {
      await resendConfirmationEmail(pendingEmail);
      setResendMessage("Email konfirmasi telah dikirim ulang.");
      resendCooldown.start();
    } catch (err) {
      setResendError(translateError(err));
    } finally {
      setResendLoading(false);
    }
  };

  // ── "Check your email" view ───────────────────────────────────────────
  if (pendingEmail) {
    return (
      <div className="ledger-page min-h-screen bg-cream-100 lg:grid lg:grid-cols-3">
        <AuthBrandPanel
          className="col-span-1"
          title="Satu langkah lagi."
          description="Cek kotak masuk Anda untuk mengaktifkan akun dan mulai mencatat transaksi pertama."
          entries={[
            { label: "Konfirmasi email", amount: "1/1", tone: "leaf" },
            { label: "Setup bisnis", amount: "2/3", tone: "wood" },
            { label: "Catat transaksi", amount: "—", tone: "clay" },
          ]}
        />

        <div className="col-span-1 flex min-h-screen items-center justify-center p-6 lg:min-h-0 lg:col-span-2">
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
                    Kami telah mengirim tautan konfirmasi ke{" "}
                    <span className="font-medium break-all text-text-primary">
                      {pendingEmail}
                    </span>
                    . Klik tautan tersebut untuk mengaktifkan akun Anda.
                  </p>
                </div>

                <div className="mt-6 space-y-3 rounded-lg border border-wood-100 bg-cream-50 p-4 text-xs text-text-secondary">
                  <p>Tidak menerima email? Periksa folder spam atau promosi.</p>
                </div>

                {resendMessage && (
                  <div
                    className="mt-4 rounded-lg bg-success/10 p-3 text-sm text-success"
                    role="status"
                  >
                    {resendMessage}
                  </div>
                )}
                {resendError && (
                  <div
                    className="mt-4 rounded-lg bg-error/10 p-3 text-sm text-error"
                    role="alert"
                  >
                    {resendError}
                  </div>
                )}

                <div className="mt-6 space-y-2">
                  <Button
                    type="button"
                    fullWidth
                    onClick={handleResend}
                    loading={resendLoading}
                    disabled={resendLoading || resendCooldown.isActive}
                  >
                    {resendCooldown.isActive
                      ? `Kirim ulang (${resendCooldown.remaining}s)`
                      : "Kirim ulang email"}
                  </Button>

                  <button
                    type="button"
                    onClick={() => {
                      setPendingEmail(null);
                      setResendMessage(null);
                      setResendError(null);
                      resendCooldown.reset();
                    }}
                    className="w-full rounded-md px-3 py-2 text-sm text-wood-600 hover:text-wood-800 hover:bg-cream-100"
                  >
                    Gunakan email lain
                  </button>
                </div>

                <p className="mt-4 text-center text-sm text-wood-500">
                  Sudah konfirmasi?{" "}
                  <Link
                    to={loginPath}
                    className="font-medium text-wood-600 hover:text-wood-800"
                  >
                    Masuk
                  </Link>
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  // ── Registration form ────────────────────────────────────────────────
  return (
    <div className="ledger-page min-h-screen bg-cream-100 lg:grid lg:grid-cols-3">
      {/* Brand panel — 33% */}
      <AuthBrandPanel
        className="col-span-1"
        title="Mulai dengan struktur yang benar."
        description="Setiap transaksi langsung menjadi jurnal, stok, dan laporan yang siap dibaca."
        entries={[
          { label: "Kas toko", amount: "12,0 jt", tone: "wood" },
          { label: "Modal awal", amount: "+25,0 jt", tone: "leaf" },
          { label: "Persediaan", amount: "8,7 jt", tone: "wood" },
        ]}
      />

      {/* Form — 67% */}
      <div className="col-span-1 flex min-h-screen items-center justify-center p-6 lg:min-h-0 lg:col-span-2">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="mb-8 flex justify-center lg:hidden">
            <Logo size="md" variant="full" />
          </div>

          <Card padding="lg">
            <CardContent>
              <h1 className="text-xl font-bold text-text-primary">Daftar</h1>
              <p className="mt-1 text-sm text-text-secondary">
                Buat akun Ledjer.
              </p>

              {error && (
                <div className="mt-4 rounded-lg bg-error/10 p-3 text-sm text-error" role="alert">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
                <Input
                  {...register("fullName")}
                  label="Nama lengkap"
                  placeholder="Nama lengkap"
                  prefix={<User className="h-4 w-4 text-wood-400" />}
                  error={errors.fullName?.message}
                  autoComplete="name"
                />

                <Input
                  {...register("email")}
                  label="Email"
                  type="email"
                  placeholder="email@contoh.com"
                  prefix={<Mail className="h-4 w-4 text-wood-400" />}
                  error={errors.email?.message}
                  autoComplete="email"
                />

                <Input
                  {...register("password")}
                  label="Password"
                  type="password"
                  placeholder="Minimal 8 karakter, 1 huruf besar, 1 angka"
                  prefix={<Lock className="h-4 w-4 text-wood-400" />}
                  error={errors.password?.message}
                  autoComplete="new-password"
                />

                <Input
                  {...register("confirmPassword")}
                  label="Konfirmasi password"
                  type="password"
                  placeholder="Konfirmasi password"
                  prefix={<Lock className="h-4 w-4 text-wood-400" />}
                  error={errors.confirmPassword?.message}
                  autoComplete="new-password"
                />

                <Button type="submit" fullWidth loading={loading} disabled={loading || oauthLoading}>
                  Daftar
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
                mode="signup"
                onClick={handleGoogleSignUp}
                loading={oauthLoading}
                disabled={loading || oauthLoading}
              />

              <p className="mt-4 text-center text-sm text-wood-500">
                Sudah punya akun?{" "}
                <Link to={loginPath} className="font-medium text-wood-600 hover:text-wood-800">
                  Masuk
                </Link>
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
