import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { z } from "zod/v4";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Logo } from "@/components/ui/logo";
import { translateError } from "@/lib/errors";
import { checkRateLimit, getResetTime, RATE_LIMITS } from "@/lib/rate-limit";
import { supabase } from "@/lib/supabase";
import { Lock, Mail } from "lucide-react";

const loginSchema = z.object({
  email: z.string().email("Email tidak valid"),
  password: z.string().min(1, "Password wajib diisi"),
});

type LoginForm = z.infer<typeof loginSchema>;

export function LoginPage() {
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rateLimited, setRateLimited] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginForm) => {
    const email = data.email.trim().toLowerCase();
    const localRateLimitKey = `login:${email}`;

    // Check rate limit
    if (!checkRateLimit(localRateLimitKey, RATE_LIMITS.login)) {
      const resetMs = getResetTime(localRateLimitKey, RATE_LIMITS.login);
      const resetSeconds = Math.ceil(resetMs / 1000);
      setRateLimited(true);
      setError(`Terlalu banyak percobaan. Coba lagi dalam ${resetSeconds} detik.`);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const rateLimitWindowSeconds = Math.ceil(RATE_LIMITS.login.windowMs / 1000);
      const lockoutMinutes = Math.ceil(RATE_LIMITS.login.windowMs / 60_000) * 3;

      const { data: isLocked } = await supabase.rpc("is_email_rate_limited", {
        p_email: email,
        p_max_attempts: RATE_LIMITS.login.maxAttempts,
        p_lockout_minutes: lockoutMinutes,
      });

      if (isLocked) {
        setRateLimited(true);
        setError(`Terlalu banyak percobaan gagal. Coba lagi dalam ${lockoutMinutes} menit.`);
        return;
      }

      const { data: isAllowed } = await supabase.rpc("check_rate_limit", {
        p_identifier: email,
        p_action: "login",
        p_max_attempts: RATE_LIMITS.login.maxAttempts,
        p_window_seconds: rateLimitWindowSeconds,
      });

      if (isAllowed === false) {
        setRateLimited(true);
        setError(`Terlalu banyak percobaan. Coba lagi dalam ${rateLimitWindowSeconds} detik.`);
        return;
      }

      await signIn(email, data.password);
      void supabase.rpc("record_login_attempt", {
        p_email: email,
        p_success: true,
        p_user_agent: navigator.userAgent,
      });
      navigate("/dashboard");
    } catch (err) {
      const message = translateError(err);
      void supabase.rpc("record_login_attempt", {
        p_email: email,
        p_success: false,
        p_user_agent: navigator.userAgent,
        p_error_message: message,
      });
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-cream-100 lg:grid lg:grid-cols-2">
      {/* Left side — illustration (hidden on mobile) */}
      <div className="hidden bg-wood-700 p-12 lg:flex lg:items-center lg:justify-center">
        <div className="max-w-md text-center">
          <div className="mb-6 flex justify-center">
            <Logo size="lg" variant="icon" tone="light" />
          </div>
          <h1 className="text-3xl font-bold text-cream-50">Ledjer</h1>
          <p className="mt-3 text-wood-200 text-lg">
            Pembukuan UMKM Indonesia yang mudah dan terpercaya
          </p>
          <div className="mt-8 flex items-center justify-center gap-6 text-sm text-wood-300">
            <span>✓ Sesuai PSAK ETAP</span>
            <span>✓ Data aman</span>
            <span>✓ Gratis</span>
          </div>
        </div>
      </div>

      {/* Right side — form */}
      <div className="flex min-h-screen items-center justify-center p-6 lg:min-h-0">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="mb-8 flex justify-center lg:hidden">
            <Logo size="md" variant="full" tone="dark" />
          </div>

          <Card padding="lg">
            <CardContent>
              <h2 className="text-xl font-bold text-wood-800">Masuk</h2>
              <p className="mt-1 text-sm text-wood-500">
                Selamat datang kembali! Silakan masuk ke akun Anda.
              </p>

              {error && (
                <div className="mt-4 p-3 rounded-lg bg-error/10 text-sm text-error">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
                <Input
                  {...register("email")}
                  type="email"
                  placeholder="email@contoh.com"
                  prefix={<Mail className="h-4 w-4 text-wood-400" />}
                  error={errors.email?.message}
                  disabled={rateLimited}
                />

                <Input
                  {...register("password")}
                  type="password"
                  placeholder="Password"
                  prefix={<Lock className="h-4 w-4 text-wood-400" />}
                  error={errors.password?.message}
                  disabled={rateLimited}
                />

                <Button type="submit" fullWidth loading={loading} disabled={rateLimited}>
                  Masuk
                </Button>
              </form>

              <div className="relative mt-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-wood-200"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="bg-cream-100 px-2 text-wood-400">atau</span>
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                fullWidth
                onClick={() => supabase.auth.signInWithOAuth({ provider: 'google' })}
                className="mt-4 gap-2"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Masuk dengan Google
              </Button>

              <p className="mt-4 text-center text-sm text-wood-500">
                Belum punya akun?{" "}
                <Link to="/register" className="font-medium text-wood-600 hover:text-wood-800">
                  Daftar
                </Link>
              </p>
            </CardContent>
          </Card>

          {/* Security notice */}
          <p className="mt-6 text-center text-xs text-wood-400">
            Koneksi terenkripsi. Data Anda aman.
          </p>
        </div>
      </div>
    </div>
  );
}
