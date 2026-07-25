import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle,
  ArrowRight,
  Sparkles,
  Trash2,
  Refresh,
  Chart,
  type IconProps,
} from "reicon-react";
import { useOrganization } from "@/hooks/useOrganization";
import { queryKeys } from "@/lib/query-keys";
import {
  getOnboardingStatus,
  generateSampleData,
  removeSampleData,
  type OnboardingStep,
} from "@/lib/api/onboarding";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Logo } from "@/components/ui/logo";
import { translateError } from "@/lib/errors";

/* ───── Step-to-action mapping ───── */

interface StepAction {
  path?: string;
  cta: string;
  icon: React.ComponentType<IconProps>;
  external?: boolean;
}

const STEP_ACTIONS: Record<string, StepAction> = {
  business_profile: { path: "/onboarding", cta: "Lengkapi profil", icon: ArrowRight },
  business_type: { path: "/onboarding", cta: "Pilih jenis bisnis", icon: ArrowRight },
  books_start_date: { path: "/onboarding", cta: "Atur tanggal", icon: ArrowRight },
  opening_balances: { path: "/opening-balance", cta: "Input saldo awal", icon: ArrowRight },
  products: { path: "/products", cta: "Kelola produk", icon: ArrowRight },
  parties: { path: "/import", cta: "Tambah pelanggan & pemasok", icon: ArrowRight },
  first_transaction: { path: "/transactions/new", cta: "Catat transaksi", icon: ArrowRight },
  view_first_report: { path: "/reports/profit-loss", cta: "Lihat laporan", icon: Chart },
  invite_team_member: { path: "/settings/team", cta: "Undang tim", icon: ArrowRight },
  first_period_close: { path: "/settings/period-locks", cta: "Kunci periode", icon: ArrowRight },
};

/* ───── Helpers ───── */



function getAction(stepId: string): StepAction {
  return STEP_ACTIONS[stepId] ?? { cta: "Lanjutkan", icon: ArrowRight };
}

function formatProgress(pct: number): string {
  if (pct === 0) return "Belum dimulai";
  if (pct === 100) return "Selesai!";
  return `${Math.round(pct)}% selesai`;
}

/* ───── Step Item ───── */

function ChecklistStep({
  step,
  index,
}: {
  step: OnboardingStep;
  index: number;
}) {
  const action = getAction(step.id);
  const Icon = action.icon;

  return (
      <div
        className={`ledger-item-in group flex items-start gap-4 rounded-xl border p-4 transition-all duration-200 ${
          step.completed
            ? "border-leaf-200 bg-leaf-50/50"
            : "border-wood-200 bg-surface hover:border-wood-300 hover:bg-cream-50"
        }`}
        role="listitem"
        aria-label={`${step.label} — ${step.completed ? "Selesai" : "Belum selesai"}`}
      >
        {/* Status indicator */}
        <div className="flex h-8 w-8 shrink-0 items-center justify-center pt-0.5">
          {step.completed ? (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-leaf-500 text-white">
              <CheckCircle className="h-5 w-5" />
            </div>
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-wood-100 text-wood-400">
              <span className="text-sm font-semibold">{index + 1}</span>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-0.5">
            <p
              className={`text-sm font-semibold ${
                step.completed ? "text-leaf-700" : "text-wood-800"
              }`}
            >
              {step.label}
            </p>
            <p className="truncate text-xs text-text-tertiary">
              {step.description}
            </p>
          </div>

          {/* Action button */}
          {action.path && !step.completed && (
            <Link
              to={action.path}
              className="ledger-interactive mt-2 inline-flex shrink-0 items-center gap-1.5 self-start rounded-lg bg-wood-500 px-3.5 py-2 text-xs font-medium text-text-on-primary transition-all hover:bg-wood-600 hover:shadow-sm active:scale-[0.97] sm:mt-0"
            >
              <Icon className="h-3.5 w-3.5" />
              {action.cta}
            </Link>
          )}

          {step.completed && (
            <span className="mt-1.5 inline-flex shrink-0 items-center gap-1 text-xs font-medium text-leaf-600 sm:mt-0">
              <CheckCircle className="h-3.5 w-3.5" />
              Selesai
            </span>
          )}
        </div>
      </div>
  );
}

/* ───── Skeleton ───── */

function ChecklistSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" role="status">
      <span className="sr-only">Memuat daftar langkah...</span>
      {/* Progress bar skeleton */}
      <div className="h-3 w-full rounded-full bg-cream-200 animate-pulse" />
      {/* Step skeletons */}
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-start gap-4 rounded-xl border border-wood-200 p-4">
          <div className="h-8 w-8 shrink-0 rounded-full bg-cream-200 animate-pulse" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-48 bg-cream-200 rounded animate-pulse" />
            <div className="h-3 w-72 bg-cream-200 rounded animate-pulse" />
          </div>
          <div className="h-8 w-24 shrink-0 rounded-lg bg-cream-200 animate-pulse" />
        </div>
      ))}
    </div>
  );
}

/* ───── Main Page ───── */

export function OnboardingChecklistPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: orgData } = useOrganization();

  const [sampleLoading, setSampleLoading] = useState(false);
  const [sampleError, setSampleError] = useState<string | null>(null);
  const [sampleSuccess, setSampleSuccess] = useState<string | null>(null);

  const orgId = orgData?.organization?.id;

  const {
    data: status,
    isLoading,
    error,
  } = useQuery({
    queryKey: queryKeys.onboarding.status(orgId),
    queryFn: getOnboardingStatus,
    enabled: !!orgId,
    refetchInterval: 15_000, // auto-refresh every 15s
  });

  // Redirect to dashboard if already fully onboarded
  if (status?.completed && orgData && !orgData.needsOnboarding) {
    navigate("/dashboard", { replace: true });
    return null;
  }

  const completedCount = status?.completedCount ?? 0;
  const totalSteps = status?.totalSteps ?? 10;
  const [progressAnim, setProgressAnim] = useState(0);
  const progressPct = totalSteps > 0 ? (completedCount / totalSteps) * 100 : 0;

  // Animate progress bar on mount / update
  useEffect(() => {
    const timer = setTimeout(() => setProgressAnim(progressPct), 100);
    return () => clearTimeout(timer);
  }, [progressPct]);
  const allDone = status?.completed ?? false;

  const handleSampleData = async () => {
    setSampleLoading(true);
    setSampleError(null);
    setSampleSuccess(null);
    try {
      const result = await generateSampleData();
      setSampleSuccess(result.message);
      await queryClient.invalidateQueries({ queryKey: queryKeys.onboarding.all() });
      await queryClient.invalidateQueries({ queryKey: queryKeys.allDashboard() });
      await queryClient.invalidateQueries({ queryKey: queryKeys.products.all(orgId!) });
    } catch (err) {
      setSampleError(translateError(err));
    } finally {
      setSampleLoading(false);
    }
  };

  const handleRemoveSample = async () => {
    setSampleLoading(true);
    setSampleError(null);
    setSampleSuccess(null);
    try {
      await removeSampleData();
      setSampleSuccess("Data contoh berhasil dihapus.");
      await queryClient.invalidateQueries({ queryKey: queryKeys.onboarding.all() });
      await queryClient.invalidateQueries({ queryKey: queryKeys.allDashboard() });
      await queryClient.invalidateQueries({ queryKey: queryKeys.products.all(orgId!) });
    } catch (err) {
      setSampleError(translateError(err));
    } finally {
      setSampleLoading(false);
    }
  };

  return (
    <div className="ledger-page flex ledger-min-dvh items-start justify-center bg-cream-100 px-4 py-8 sm:py-12">
      <div className="w-full max-w-2xl space-y-6">
        {/* Header */}
        <div className="space-y-3 text-center">
          <div className="flex justify-center">
            <Logo size="md" variant="icon" />
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-bold text-text-primary">
              {allDone
                ? "Selamat! Semua langkah selesai"
                : "Siapkan bisnis Anda"}
            </h1>
            <p className="text-sm text-text-secondary">
              {allDone
                ? "Anda sudah siap menggunakan Ledjer. Mulai kelola keuangan bisnis!"
                : "Ikuti langkah-langkah berikut untuk menyiapkan pembukuan bisnis Anda."}
            </p>
          </div>
        </div>

        {/* Progress section */}
        {!allDone && (
          <Card className="border-wood-200">
            <CardContent className="space-y-3 p-5">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-wood-700">
                  Progress Onboarding
                </span>
                <span className="text-wood-500">
                  {completedCount}/{totalSteps} langkah
                </span>
              </div>

              {/* Progress bar */}
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-wood-100" role="progressbar" aria-valuenow={completedCount} aria-valuemin={0} aria-valuemax={totalSteps} aria-label={formatProgress(progressPct)}>
                <div
                  className="h-full rounded-full bg-leaf-500 transition-all duration-700 ease-out"
                  style={{ width: `${progressAnim}%` }}
                />
              </div>

              <p className="text-xs text-text-tertiary">{formatProgress(progressPct)}</p>
            </CardContent>
          </Card>
        )}

        {/* Completion message */}
        {allDone && (
          <div className="ledger-item-in">
            <Card className="border-leaf-300 bg-leaf-50">
              <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-leaf-500 text-white">
                  <CheckCircle className="h-7 w-7" />
                </div>
                <div className="space-y-1">
                  <h2 className="text-lg font-bold text-leaf-800">
                    Semua langkah selesai!
                  </h2>
                  <p className="text-sm text-leaf-600">
                    Bisnis Anda siap digunakan. Anda bisa mulai mencatat transaksi dan melihat laporan keuangan.
                  </p>
                </div>
                <Link
                  to="/dashboard"
                  className="ledger-interactive mt-2 inline-flex items-center gap-2 rounded-lg bg-leaf-600 px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-leaf-700 hover:shadow-sm active:scale-[0.97]"
                >
                  Ke Dashboard
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-md bg-error/10 p-3 text-sm text-error" role="alert">
            Gagal memuat status onboarding.
          </div>
        )}

        {/* Sample data section */}
        {!allDone && (
          <Card className="border-dashed border-honey-300 bg-honey-50/50">
            <CardContent className="space-y-3 p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-honey-200 text-honey-600">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  <p className="text-sm font-semibold text-wood-800">
                    Coba dengan data contoh
                  </p>
                  <p className="text-xs text-text-tertiary leading-relaxed">
                    Ingin eksplorasi dulu? Klik di bawah untuk mengisi produk, pelanggan, dan
                    transaksi contoh secara otomatis. Data ini bisa dihapus kapan saja.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSampleData}
                  disabled={sampleLoading}
                  loading={sampleLoading}
                  className="border-honey-400 text-honey-700 hover:bg-honey-100"
                >
                  <Sparkles className="h-4 w-4" />
                  Isi data contoh
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRemoveSample}
                  disabled={sampleLoading}
                  className="text-wood-500 hover:text-error"
                >
                  <Trash2 className="h-4 w-4" />
                  Hapus data contoh
                </Button>
              </div>

              {sampleError && (
                <p className="text-xs text-error" role="alert">{sampleError}</p>
              )}
              {sampleSuccess && (
                <p className="text-xs text-leaf-600" role="status">{sampleSuccess}</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Loading state */}
        {isLoading && <ChecklistSkeleton />}

        {/* Checklist */}
        {!isLoading && status && (
          <div className="space-y-2.5" role="list" aria-label="Daftar langkah onboarding">
            {status.steps
              .sort((a, b) => a.order - b.order)
              .map((step, index) => (
                <ChecklistStep key={step.id} step={step} index={index} />
              ))}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !status && !error && (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
              <Refresh className="h-8 w-8 text-wood-300" />
              <p className="text-sm text-text-secondary">
                Status onboarding belum tersedia.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Back to dashboard link */}
        <div className="text-center">
          <Link
            to="/dashboard"
            className="text-sm font-medium text-wood-500 underline-offset-2 hover:text-wood-700 hover:underline"
          >
            {allDone ? "Ke Dashboard" : "Lewati, nanti saja → Dashboard"}
          </Link>
        </div>
      </div>
    </div>
  );
}
