import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Logo } from "@/components/ui/logo";
import { translateError } from "@/lib/errors";
import { getSafeRedirectPath } from "@/lib/redirect";
import { ApiError } from "@/lib/api/client";
import {
  forgotPassword,
  getMe,
  resendVerification,
  verifyEmail,
} from "@/lib/api/auth";
import { AlertTriangle, ArrowRight, CheckCircle2, Mail } from "lucide-react";

type Status = "verifying" | "success" | "error" | "invalid";

const STATUS_COPY: Record<Status, { title: string; subtitle: string }> = {
  verifying: {
    title: "Memverifikasi email Anda…",
    subtitle: "Mohon tunggu sebentar, kami sedang mengaktifkan akun Anda.",
  },
  success: {
    title: "Email terkonfirmasi",
    subtitle: "Akun Anda sudah aktif. Mengarahkan ke onboarding…",
  },
  error: {
    title: "Verifikasi gagal",
    subtitle: "Tautan tidak valid atau sudah kedaluwarsa.",
  },
  invalid: {
    title: "Autentikasi tidak terarah",
    subtitle: "Tautan tidak valid atau belum terkonfirmasi. Cek email Anda atau coba masuk kembali.",
  },
};

export function AuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>("verifying");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Guard against React.StrictMode double-invoke (development).
  const verifiedRef = useRef(false);
  // Persist the verified callback type for success CTA and resend flow.
  const [callbackType, setCallbackType] = useState<string | null>(null);

  // Resend state (used for "error" / "invalid" recovery).
  const [resendEmail, setResendEmail] = useState("");
  const [resendLoading, setResendLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendMessage, setResendMessage] = useState<string | null>(null);

  useEffect(() => {
    const verify = async () => {
      if (verifiedRef.current) return;
      verifiedRef.current = true;

      // Strip query params from URL to prevent leaking OAuth error tokens
      // to browser history, Referer headers, or server logs.
      window.history.replaceState(null, "", "/auth/callback");

      // OAuth flow: backend redirects here with ?success=true or ?error=...
      const oauthSuccess = searchParams.get("success");
      const oauthError = searchParams.get("error");
      // Email-link flow: ?token=...&type=signup | recovery.
      const token = searchParams.get("token");
      const type = searchParams.get("type") as
        | "signup"
        | "recovery"
        | null;
      const redirectPath = getSafeRedirectPath(searchParams.get("redirect"), "/onboarding");

      try {
        if (oauthSuccess === "true") {
          // Google OAuth succeeded — session cookie is already set by backend
          setStatus("success");
          setTimeout(() => {
            navigate(redirectPath, { replace: true });
          }, 1200);
          return;
        } else if (oauthError) {
          throw new ApiError(500, "oauth_error", decodeURIComponent(oauthError));
        } else if (token && type) {
          setCallbackType(type);
          await verifyEmail(token, type);
        } else {
          // No code or token — check if a session already exists.
          // A session may exist when the user authenticated on another tab
          // or the onAuthStateChange listener fired before this component
          // mounted. Without this check, authenticated users would see a
          // misleading "link invalid" error instead of being redirected.
          const { session } = await getMe();
          if (session) {
            setStatus("success");
            setTimeout(() => {
              navigate(redirectPath, { replace: true });
            }, 1200);
            return;
          }
          setStatus("invalid");
          return;
        }

        setStatus("success");
        // Brief delay so user sees the success state before redirect.
        setTimeout(() => {
          // Decide destination based on the OTP type.
          // - recovery → password-reset page so the user can set a new password
          //   (do NOT send them to /settings/team — that is unrelated).
          // - signup / magiclink / email_change → onboarding so they can
          //   create or resume their business.
          if (type === "recovery") {
            navigate("/reset-password", { replace: true });
          } else {
            navigate(redirectPath, { replace: true });
          }
        }, 1200);
      } catch (err) {
        setErrorMessage(translateError(err));
        setStatus("error");
      }
    };

    verify();
  }, [searchParams, navigate]);

  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (cooldownRef.current) {
        clearInterval(cooldownRef.current);
        cooldownRef.current = null;
      }
    };
  }, []);

  const startResendCooldown = (seconds: number) => {
    setResendCooldown(seconds);
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    cooldownRef.current = setInterval(() => {
      setResendCooldown((prev) => {
        if (prev <= 1) {
          if (cooldownRef.current) {
            clearInterval(cooldownRef.current);
            cooldownRef.current = null;
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleResend = async () => {
    if (!resendEmail || resendLoading || resendCooldown > 0) return;
    setResendLoading(true);
    setResendMessage(null);
    setErrorMessage(null);
    try {
      const isRecovery = callbackType === "recovery";
      if (isRecovery) {
        await forgotPassword(resendEmail.trim().toLowerCase());
      } else {
        await resendVerification(resendEmail.trim().toLowerCase());
      }
      setResendMessage(
        isRecovery
          ? "Tautan pemulihan telah dikirim ulang. Cek kotak masuk (atau folder spam) Anda."
          : "Email konfirmasi telah dikirim ulang. Cek kotak masuk (atau folder spam) Anda."
      );
      startResendCooldown(60);
    } catch (err) {
      setErrorMessage(translateError(err));
    } finally {
      setResendLoading(false);
    }
  };

  const copy = STATUS_COPY[status];

  return (
    <div className="ledger-page flex ledger-min-dvh items-center justify-center bg-cream-100 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo size="md" variant="full" />
        </div>

        <Card className="p-6">
          <CardContent>
            <div className="flex flex-col items-center text-center">
              <StatusIcon status={status} />
              <h1 className="mt-4 text-xl font-bold text-text-primary">{copy.title}</h1>
              <p className="mt-2 text-sm text-text-secondary">{copy.subtitle}</p>
            </div>

            {status === "error" && (
              <div className="mt-6 space-y-4">
                {errorMessage && (
                  <div
                    className="rounded-lg bg-error/10 p-3 text-sm text-error"
                    role="alert"
                  >
                    {errorMessage}
                  </div>
                )}

                {resendMessage && (
                  <output
                    className="rounded-lg bg-success/10 p-3 text-sm text-success"
                  >
                    {resendMessage}
                  </output>
                )}

                <div className="space-y-3">
                  <label className="block text-left text-sm">
                    <span className="mb-1.5 block font-medium text-text-secondary">
                      Kirim ulang ke email
                    </span>
                    <input
                      type="email"
                      autoComplete="email"
                      placeholder="email@contoh.com"
                      value={resendEmail}
                      onChange={(e) => setResendEmail(e.target.value)}
                      className="block w-full rounded-md border border-wood-200 bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-wood-400 focus:border-wood-500 focus:outline-none focus:ring-2 focus:ring-wood-500/20"
                    />
                  </label>
                  <Button
                    type="button"
                    fullWidth
                    onClick={handleResend}
                    loading={resendLoading}
                    disabled={resendLoading || resendCooldown > 0 || !resendEmail}
                  >
                    {resendCooldown > 0
                      ? `Kirim ulang (${resendCooldown}s)`
                      : "Kirim ulang email"}
                  </Button>
                </div>

                <div className="text-center text-sm text-wood-500">
                  Sudah diverifikasi?{" "}
                  <Link
                    to="/login"
                    className="font-medium text-wood-600 hover:text-wood-800"
                  >
                    Masuk
                  </Link>
                </div>
              </div>
            )}

            {status === "invalid" && (
              <div className="mt-6">
                <Button
                  type="button"
                  fullWidth
                  onClick={() => navigate("/login")}
                  className="gap-2"
                >
                  Kembali ke halaman masuk
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            )}

            {status === "success" && callbackType === "recovery" && (
              <div className="mt-6">
                <Button
                  type="button"
                  fullWidth
                  variant="outline"
                  onClick={() => navigate("/reset-password", { replace: true })}
                  className="gap-2"
                >
                  Atur password baru
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            )}
            {status === "success" && callbackType !== "recovery" && (
              <div className="mt-6">
                <Button
                  type="button"
                  fullWidth
                  variant="outline"
                  onClick={() => navigate("/onboarding", { replace: true })}
                  className="gap-2"
                >
                  Lanjut ke onboarding
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatusIcon({ status }: { readonly status: Status }) {
  if (status === "verifying") {
    return (
      <div
        className="flex h-12 w-12 items-center justify-center rounded-full bg-cream-200 text-wood-600"
        aria-hidden="true"
      >
        <div className="h-6 w-6 animate-spin rounded-full border-4 border-wood-500 border-t-transparent" />
      </div>
    );
  }
  if (status === "success") {
    return (
      <div
        className="flex h-12 w-12 items-center justify-center rounded-full bg-leaf-50 text-leaf-700"
        aria-hidden="true"
      >
        <CheckCircle2 className="h-6 w-6" />
      </div>
    );
  }
  if (status === "invalid") {
    return (
      <div
        className="flex h-12 w-12 items-center justify-center rounded-full bg-cream-200 text-wood-600"
        aria-hidden="true"
      >
        <Mail className="h-6 w-6" />
      </div>
    );
  }
  // error
  return (
    <div
      className="flex h-12 w-12 items-center justify-center rounded-full bg-error/10 text-error"
      aria-hidden="true"
    >
      <AlertTriangle className="h-6 w-6" />
    </div>
  );
}
