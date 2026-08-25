import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { z } from "zod/v3";
import { zodResolver } from "@hookform/resolvers/zod";
import { Lock } from "reicon-react";
import { useAuth } from "@/contexts/auth-context";
import { passwordSchema } from "@/lib/validations/auth";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Logo } from "@/components/ui/logo";
import { translateError } from "@/lib/errors";
import { resetPassword } from "@/lib/api/auth";

const resetSchema = z
  .object({
    password: passwordSchema,
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    message: "Konfirmasi password tidak cocok",
    path: ["confirm"],
  });

type ResetForm = z.infer<typeof resetSchema>;

/**
 * Password-reset landing page used by recovery email links.
 *
 * The recovery flow in auth-callback.tsx verifies the token and sets a
 * temporary session cookie. The user is redirected here with that session,
 * and is allowed to set a new password once.
 *
 * If the page is opened WITHOUT a recovery session (e.g. someone bookmarks
 * it, or refreshes after the session expires), we render a "request new
 * link" message and link to login. We do NOT silently redirect to /login
 * because that hides the reason for the failed reset.
 */
export function ResetPasswordPage() {
  const navigate = useNavigate();
  const { session, loading, signOut } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!session) {
      // No session - recovery link missing or expired.
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
      await resetPassword(data.password);
      setSuccess(true);
      // After a successful password reset, force a fresh sign-in so the
      // session reflects the new credentials.
      setTimeout(async () => {
        await signOut();
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

        <Card className="p-6">
          <CardContent>
            <h1 className="text-center text-xl font-bold text-text-primary">
              Atur Ulang Password
            </h1>
            <h2 className="mt-2 text-center text-sm font-semibold text-text-secondary">
              Buat password baru
            </h2>
            <p className="mt-2 text-center text-sm text-text-secondary">
              Masukkan password baru untuk akun Anda.
            </p>

            {success && (
              <Callout variant="success" className="mt-6">
                Password berhasil diperbarui. Mengarahkan ke halaman masuk…
              </Callout>
            )}
            {!success && !session && (
              <div className="mt-6 space-y-4">
                <Callout variant="warning">
                  Tautan pemulihan tidak valid atau sudah kedaluwarsa. Minta
                  tautan baru dari halaman masuk.
                </Callout>
                <Button
                  type="button"
                  fullWidth
                  onClick={() => navigate("/login", { replace: true })}
                >
                  Kembali ke halaman masuk
                </Button>
              </div>
            )}
            {!success && session && (
              <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
                {error && (
                  <Callout variant="error">
                    {error}
                  </Callout>
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
