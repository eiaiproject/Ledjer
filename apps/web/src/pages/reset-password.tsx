import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { z } from "zod/v3";
import { zodResolver } from "@hookform/resolvers/zod";
import { Lock } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Logo } from "@/components/ui/logo";
import { translateError } from "@/lib/errors";

const resetSchema = z
  .object({
    password: z
      .string()
      .min(8, "Password minimal 8 karakter")
      .max(72, "Password maksimal 72 karakter"),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    message: "Konfirmasi password tidak cocok",
    path: ["confirm"],
  });

type ResetForm = z.infer<typeof resetSchema>;

/**
 * Password-reset landing page used by Supabase recovery email links.
 *
 * The recovery flow in auth-callback.tsx verifies the OTP (verifyOtp with
 * type=recovery) and sets a temporary session. The user is redirected here
 * with that session, and is allowed to set a new password once.
 *
 * If the page is opened WITHOUT a recovery session (e.g. someone bookmarks
 * it, or refreshes after the session expires), we render a "request new
 * link" message and link to login. We do NOT silently redirect to /login
 * because that hides the reason for the failed reset.
 */
export function ResetPasswordPage() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!session) {
      // No session — recovery link missing or expired.
      // Don't auto-redirect; explain so the user knows why.
    }
  }, [session, loading]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetForm>({
    resolver: zodResolver(resetSchema),
  });

  const onSubmit = async (data: ResetForm) => {
    if (!session) {
      setError(
        "Sesi pemulihan tidak ditemukan. Buka tautan pada email pemulihan terbaru, atau minta tautan baru.",
      );
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const { error: updateErr } = await supabase.auth.updateUser({
        password: data.password,
      });
      if (updateErr) throw updateErr;
      setSuccess(true);
      // After a successful password reset, force a fresh sign-in so the
      // session reflects the new credentials.
      setTimeout(async () => {
        await supabase.auth.signOut();
        navigate("/login", { replace: true });
      }, 1500);
    } catch (err) {
      setError(translateError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="ledger-page flex ledger-min-dvh items-center justify-center bg-cream-100 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo size="md" variant="full" />
        </div>

        <Card padding="lg">
          <CardContent>
            <h1 className="text-center text-xl font-bold text-text-primary">
              Atur Ulang Password
            </h1>
            <p className="mt-2 text-center text-sm text-text-secondary">
              Masukkan password baru untuk akun Anda.
            </p>

            {success ? (
              <div
                className="mt-6 rounded-lg bg-success/10 p-3 text-sm text-success"
                role="status"
              >
                Password berhasil diperbarui. Mengarahkan ke halaman masuk…
              </div>
            ) : !session ? (
              <div className="mt-6 space-y-4">
                <div
                  className="rounded-lg bg-warning/10 p-3 text-sm text-warning"
                  role="alert"
                >
                  Tautan pemulihan tidak valid atau sudah kedaluwarsa. Minta
                  tautan baru dari halaman masuk.
                </div>
                <Button
                  type="button"
                  fullWidth
                  onClick={() => navigate("/login", { replace: true })}
                >
                  Kembali ke halaman masuk
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
                {error && (
                  <div
                    className="rounded-lg bg-error/10 p-3 text-sm text-error"
                    role="alert"
                  >
                    {error}
                  </div>
                )}

                <div>
                  <label
                    htmlFor="reset-password"
                    className="mb-1.5 block text-left text-sm font-medium text-text-secondary"
                  >
                    <Lock className="mr-1 inline h-3 w-3" />
                    Password baru
                  </label>
                  <Input
                    id="reset-password"
                    type="password"
                    autoComplete="new-password"
                    placeholder="Minimal 8 karakter"
                    aria-invalid={errors.password ? "true" : "false"}
                    {...register("password")}
                  />
                  {errors.password && (
                    <p className="mt-1 text-xs text-error">
                      {errors.password.message}
                    </p>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="reset-confirm"
                    className="mb-1.5 block text-left text-sm font-medium text-text-secondary"
                  >
                    <Lock className="mr-1 inline h-3 w-3" />
                    Konfirmasi password
                  </label>
                  <Input
                    id="reset-confirm"
                    type="password"
                    autoComplete="new-password"
                    placeholder="Ulangi password baru"
                    aria-invalid={errors.confirm ? "true" : "false"}
                    {...register("confirm")}
                  />
                  {errors.confirm && (
                    <p className="mt-1 text-xs text-error">
                      {errors.confirm.message}
                    </p>
                  )}
                </div>

                <Button
                  type="submit"
                  fullWidth
                  loading={submitting}
                  disabled={submitting}
                >
                  Perbarui password
                </Button>

                <div className="text-center text-sm text-wood-500">
                  Ingat password Anda?{" "}
                  <Link
                    to="/login"
                    className="font-medium text-wood-600 hover:text-wood-800"
                  >
                    Masuk
                  </Link>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
