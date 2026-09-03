import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { z } from "zod/v3";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Logo } from "@/components/ui/logo";
import { AuthBrandPanel } from "@/components/auth-brand-panel";
import { GoogleAuthButton } from "@/components/google-auth-button";
import { translateError } from "@/lib/errors";
import { startGoogleAuth } from "@/lib/api/auth";
import { Lock, Envelope, User, Store } from "reicon-react";

const passwordSchema = z
  .string()
  .min(8, "Password minimal 8 karakter")
  .regex(/[A-Za-z]/, "Password harus mengandung huruf")
  .regex(/\d/, "Password harus mengandung angka");

const registerSchema = z
  .object({
    fullName: z.string().min(2, "Nama harus minimal 2 karakter"),
    email: z.string().email("Email tidak valid"),
    organizationName: z.string().min(1, "Nama usaha harus diisi"),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Password tidak cocok",
    path: ["confirmPassword"],
  });

type RegisterForm = z.infer<typeof registerSchema>;

export function RegisterPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { signUp } = useAuth();
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const oauthError = (() => {
    const code = searchParams.get("error");
    if (!code) return null;
    const messages: Record<string, string> = {
      oauth_denied: "Pendaftaran Google dibatalkan.",
      oauth_missing_params: "Sesi Google tidak valid. Coba lagi.",
      oauth_invalid_state: "Sesi Google tidak valid. Coba lagi.",
      oauth_not_configured: "Daftar dengan Google belum aktif. Coba lagi nanti.",
      oauth_failed: "Gagal daftar dengan Google. Coba lagi.",
    };
    return messages[code] ?? "Gagal daftar dengan Google. Coba lagi.";
  })();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
  });

  const onSubmit = async (data: RegisterForm) => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      await signUp(
        data.email.trim().toLowerCase(),
        data.password,
        data.fullName,
        data.organizationName,
      );
      navigate("/dashboard");
    } catch (err) {
      setError(translateError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignUp = async () => {
    if (loading || oauthLoading) return;
    setOauthLoading(true);
    setError(null);
    try {
      const response = await startGoogleAuth();
      if (!response.url) throw new Error("oauth_not_configured");
      window.location.assign(response.url);
    } catch (err) {
      setError(translateError(err));
      setOauthLoading(false);
    }
  };

  return (
    <div className="ledger-page ledger-safe-top ledger-min-dvh bg-cream-100 lg:grid lg:grid-cols-3">
      <AuthBrandPanel
        className="col-span-1"
        title="Mulai dengan struktur yang benar."
        description="Setiap transaksi langsung menjadi jurnal dan laporan yang siap dibaca."
        entries={[
          { label: "Kas toko", amount: "12,0 jt", tone: "wood" },
          { label: "Modal awal", amount: "+25,0 jt", tone: "leaf" },
          { label: "Beban bulan ini", amount: "3,2 jt", tone: "clay" },
        ]}
      />

      <div className="col-span-1 flex items-center justify-center p-4 sm:p-6 lg:min-h-0 lg:col-span-2">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex justify-center lg:hidden">
            <Logo size="md" variant="full" />
          </div>

          <Card className="p-6">
            <CardContent>
              <h1 className="text-xl font-bold text-text-primary">Mulai pembukuan usaha Anda</h1>
              <p className="mt-1 text-sm text-text-secondary">
                Buat akun dan nama usaha Anda, lalu langsung catat transaksi pertama.
              </p>

              {(error || oauthError) && (
                <Callout variant="error" className="mt-4">
                  {error ?? oauthError}
                </Callout>
              )}

              <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
                <Input
                  {...register("fullName")}
                  label="Nama lengkap"
                  placeholder="Nama lengkap"
                  prefix={<User className="h-4 w-4 text-wood-500" />}
                  error={errors.fullName?.message}
                  autoComplete="name"
                />

                <Input
                  {...register("email")}
                  label="Email"
                  type="email"
                  placeholder="email@contoh.com"
                  prefix={<Envelope className="h-4 w-4 text-wood-500" />}
                  error={errors.email?.message}
                  autoComplete="email"
                />

                <Input
                  {...register("organizationName")}
                  label="Nama usaha"
                  placeholder="Contoh: Toko Sumber Rejeki"
                  prefix={<Store className="h-4 w-4 text-wood-500" />}
                  error={errors.organizationName?.message}
                  autoComplete="organization"
                />

                <Input
                  {...register("password")}
                  label="Password"
                  type="password"
                  placeholder="Minimal 8 karakter, mengandung huruf dan angka"
                  prefix={<Lock className="h-4 w-4 text-wood-500" />}
                  error={errors.password?.message}
                  autoComplete="new-password"
                />

                <Input
                  {...register("confirmPassword")}
                  label="Konfirmasi password"
                  type="password"
                  placeholder="Konfirmasi password"
                  prefix={<Lock className="h-4 w-4 text-wood-500" />}
                  error={errors.confirmPassword?.message}
                  autoComplete="new-password"
                />

                <Button type="submit" fullWidth loading={loading}>
                  Buat akun gratis
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
                <Link to="/login" className="font-medium text-wood-600 hover:text-wood-800">
                  Masuk
                </Link>
              </p>
              <p className="mt-3 text-center text-xs text-wood-500">
                Gratis digunakan saat ini &middot; Tanpa kartu kredit
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}