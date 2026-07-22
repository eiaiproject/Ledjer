import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Logo } from "@/components/ui/logo";
import { translateError } from "@/lib/errors";
import { getSafeRedirectPath } from "@/lib/redirect";
import { ApiError } from "@/lib/api/client";
import { useAuth } from "@/contexts/auth-context";
import {
  getMe,
  verifyEmail,
} from "@/lib/api/auth";
import { AlertTriangle, ArrowRight, CheckCircle, Envelope } from "reicon-react";

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
  const { refreshSession } = useAuth();
  const [status, setStatus] = useState<Status>("verifying");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Guard against React.StrictMode double-invoke (development).
  const verifiedRef = useRef(false);
  // Persist the verified callback type for success CTA and resend flow.
  const [callbackType, setCallbackType] = useState<string | null>(null);



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
        // Refresh auth context so ProtectedRoute sees the new session.
        await refreshSession();
        // Brief delay so user sees the success state before redirect.
        setTimeout(() => {
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
  }, [searchParams, navigate, refreshSession]);



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

                <Link
                  to="/login"
                  className="mt-3 block text-center text-sm font-medium text-wood-600 hover:text-wood-800"
                >
                  Kembali ke halaman masuk
                </Link>
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
        <CheckCircle className="h-6 w-6" />
      </div>
    );
  }
  if (status === "invalid") {
    return (
      <div
        className="flex h-12 w-12 items-center justify-center rounded-full bg-cream-200 text-wood-600"
        aria-hidden="true"
      >
        <Envelope className="h-6 w-6" />
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
