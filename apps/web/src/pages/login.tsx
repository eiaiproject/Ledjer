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
import { getSafeRedirectPath } from "@/lib/redirect";
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
  const { signIn } = useAuth();
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // OAuth callback redirects here with ?error=<code> on failure
  const oauthError = (() => {
    const code = searchParams.get("error");
    if (!code) return null;
    const messages: Record<string, string> = {
      oauth_denied: "Login Google dibatalkan.",
      oauth_missing_params: "Sesi login Google tidak valid. Coba lagi.",
      oauth_invalid_state: "Sesi login Google tidak valid. Coba lagi.",
      oauth_not_configured: "Masuk dengan Google belum aktif. Coba lagi nanti.",
      oauth_email_conflict: "Email Google tidak terverifikasi. Masuk dengan email dan password.",
      oauth_failed: "Gagal masuk dengan Google. Coba lagi.",
    };
    return messages[code] ?? "Gagal masuk dengan Google. Coba lagi.";
  })();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginForm) => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      await signIn(data.email.trim().toLowerCase(), data.password);
      navigate(getSafeRedirectPath(searchParams.get("redirect"), "/dashboard"));
    } catch (err) {
      setError(translateError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
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
        title="Masuk ke pembukuan yang rapi."
        description="Catat uang masuk dan keluar, lalu lihat saldo serta laba bersih usaha Anda."
        entries={[
          { label: "Uang masuk bulan ini", amount: "+8,5 jt", tone: "leaf" },
          { label: "Uang keluar bulan ini", amount: "-3,2 jt", tone: "clay" },
          { label: "Saldo kas & bank", amount: "45,2 jt", tone: "wood" },
        ]}
      />

      <div className="col-span-1 flex items-center justify-center p-4 sm:p-6 lg:min-h-0 lg:col-span-2">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex justify-center lg:hidden">
            <Logo size="md" variant="full" />
          </div>

          <Card className="p-6">
            <CardContent>
              <h1 className="text-xl font-bold text-text-primary">Masuk</h1>
              <p className="mt-1 text-sm text-text-secondary">Masuk ke akun Anda.</p>

              {(error || oauthError) && (
                <Callout variant="error" className="mt-4">
                  {error ?? oauthError}
                </Callout>
              )}

              <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
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
                  {...register("password")}
                  label="Password"
                  type="password"
                  placeholder="Password"
                  prefix={<Lock className="h-4 w-4 text-wood-500" />}
                  error={errors.password?.message}
                  autoComplete="current-password"
                />

                <Button type="submit" fullWidth loading={loading}>
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
                disabled={loading || oauthLoading}
              />

              <p className="mt-4 text-center text-sm text-wood-500">
                Belum punya akun?{" "}
                <Link to="/register" className="font-medium text-wood-600 hover:text-wood-800">
                  Daftar
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