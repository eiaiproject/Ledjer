import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, CheckCircle2, LogIn, MailCheck, UserPlus } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { queryKeys } from "@/lib/query-keys";
import { buildRedirectSearch } from "@/lib/redirect";
import { translateError } from "@/lib/errors";
import { acceptTeamInvitation } from "@/lib/api/team";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Logo } from "@/components/ui/logo";
import { AuthBrandPanel } from "@/components/auth-brand-panel";

type AcceptState = "idle" | "success" | "error";

export function AcceptInvitationPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { session, loading } = useAuth();
  const [accepting, setAccepting] = useState(false);
  const [status, setStatus] = useState<AcceptState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [acceptedOrgId, setAcceptedOrgId] = useState<string | null>(null);

  const token = searchParams.get("token")?.trim() || "";
  const redirectPath = useMemo(
    () => `/invitations/accept?token=${encodeURIComponent(token)}`,
    [token]
  );
  const authSearch = buildRedirectSearch(redirectPath);

  const handleAccept = async () => {
    if (!token || accepting) return;
    setAccepting(true);
    setError(null);
    try {
      const result = await acceptTeamInvitation(token);
      setAcceptedOrgId(result.organization_id || null);
      setStatus("success");
      queryClient.invalidateQueries({ queryKey: queryKeys.allOrganization() });
      queryClient.invalidateQueries({ queryKey: queryKeys.orgMembers.all() });
    } catch (err) {
      setStatus("error");
      setError(translateError(err));
    } finally {
      setAccepting(false);
    }
  };

  if (loading) {
    return (
      <div className="ledger-page flex ledger-min-dvh items-center justify-center bg-cream-100 px-4 py-12" role="status">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-wood-500 border-t-transparent" aria-hidden="true" />
        <span className="sr-only">Memuat sesi...</span>
      </div>
    );
  }

  return (
    <div className="ledger-page ledger-min-dvh bg-cream-100 lg:grid lg:grid-cols-3">
      <AuthBrandPanel
        className="col-span-1"
        title="Bergabung ke pembukuan tim."
        description="Terima undangan, lalu bantu mencatat transaksi dengan izin yang diatur pemilik bisnis."
        entries={[
          { label: "Undangan staf", amount: "Aktif", tone: "leaf" },
          { label: "Izin akses", amount: "Diatur", tone: "wood" },
          { label: "Audit log", amount: "Tercatat", tone: "clay" },
        ]}
      />

      <div className="col-span-1 flex items-center justify-center p-4 sm:p-6 lg:col-span-2 lg:min-h-0">
        <div className="w-full max-w-md">
          <div className="mb-8 flex justify-center lg:hidden">
            <Logo size="md" variant="full" />
          </div>

          <Card className="p-6">
            <CardContent>
              {!token ? (
                <div className="flex flex-col items-center text-center">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-error/10 text-error">
                    <AlertTriangle className="h-6 w-6" />
                  </div>
                  <h1 className="text-xl font-bold text-text-primary">Link undangan tidak lengkap</h1>
                  <p className="mt-2 text-sm text-text-secondary">
                    Minta pemilik bisnis mengirim ulang link undangan dari halaman Tim.
                  </p>
                  <Button as={Link} to="/login" className="mt-6">
                    Masuk ke Ledjer
                  </Button>
                </div>
              ) : status === "success" ? (
                <div className="flex flex-col items-center text-center">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-leaf-100 text-leaf-700">
                    <CheckCircle2 className="h-6 w-6" />
                  </div>
                  <h1 className="text-xl font-bold text-text-primary">Undangan diterima</h1>
                  <p className="mt-2 text-sm text-text-secondary">
                    Anda sudah bergabung sebagai staf. Hak akses Anda akan mengikuti pengaturan pemilik bisnis.
                  </p>
                  <div className="mt-6 flex w-full flex-col gap-2 sm:flex-row">
                    <Button
                      type="button"
                      fullWidth
                      onClick={() => navigate("/dashboard")}
                    >
                      Buka dashboard
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                    {acceptedOrgId && (
                      <Button
                        type="button"
                        variant="secondary"
                        fullWidth
                        onClick={() => navigate("/settings/team")}
                      >
                        Lihat tim
                      </Button>
                    )}
                  </div>
                </div>
              ) : !session ? (
                <div className="flex flex-col items-center text-center">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-sky-100 text-sky-700">
                    <MailCheck className="h-6 w-6" />
                  </div>
                  <h1 className="text-xl font-bold text-text-primary">Masuk untuk menerima undangan</h1>
                  <p className="mt-2 text-sm text-text-secondary">
                    Gunakan email yang menerima undangan. Setelah masuk, Anda akan kembali ke halaman ini.
                  </p>
                  <div className="mt-6 grid w-full gap-2 sm:grid-cols-2">
                    <Button as={Link} to={`/login?${authSearch}`} fullWidth>
                      <LogIn className="h-4 w-4" />
                      Masuk
                    </Button>
                    <Button as={Link} to={`/register?${authSearch}`} variant="secondary" fullWidth>
                      <UserPlus className="h-4 w-4" />
                      Daftar
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center text-center">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-leaf-100 text-leaf-700">
                    <MailCheck className="h-6 w-6" />
                  </div>
                  <h1 className="text-xl font-bold text-text-primary">Terima undangan staf?</h1>
                  <p className="mt-2 text-sm text-text-secondary">
                    Anda akan bergabung ke organisasi yang mengundang Anda sebagai staf.
                  </p>

                  {status === "error" && error && (
                    <div className="mt-5 w-full rounded-lg bg-error/10 p-3 text-left text-sm text-error" role="alert">
                      {error}
                    </div>
                  )}

                  <Button
                    type="button"
                    fullWidth
                    className="mt-6"
                    loading={accepting}
                    disabled={accepting}
                    onClick={handleAccept}
                  >
                    Terima undangan
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
