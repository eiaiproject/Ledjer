import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useOrganization, useIsOwner } from "@/hooks/useOrganization";
import {
  fetchMonthlyTransactionUsage,
  FREE_PLAN_TRANSACTION_LIMIT,
} from "@/lib/transaction-usage";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Check, ArrowRight, MessageCircle, RefreshCw } from "lucide-react";

type BillingPeriod = "monthly" | "yearly";

const PLAN_DETAILS = {
  free: {
    name: "Gratis",
    description: "Cocok untuk usaha kecil yang baru mulai",
    monthlyPrice: 0,
    yearlyPrice: 0,
    userAllowance: "1 pemilik",
    transactionAllowance: "50/bulan",
    transactionLimit: 50,
    isUnlimited: false,
    features: [
      "1 pemilik",
      "50 transaksi/bulan",
      "Laporan dasar",
      "Bagan akun default",
    ],
  },
  solo: {
    name: "Solo",
    description: "Untuk usaha yang mulai berkembang",
    monthlyPrice: 39000,
    yearlyPrice: 390000,
    monthlyEquivalent: 32500,
    userAllowance: "1 pemilik",
    transactionAllowance: "Unlimited",
    transactionLimit: Infinity,
    isUnlimited: true,
    features: [
      "1 pemilik",
      "Transaksi unlimited",
      "Semua laporan keuangan",
      "Buku besar",
      "Neraca saldo",
      "Laba rugi",
      "Neraca",
      "Audit log",
    ],
  },
  business: {
    name: "Business",
    description: "Untuk tim dengan kasir atau admin",
    monthlyPrice: 49000,
    yearlyPrice: 490000,
    monthlyEquivalent: 40833,
    userAllowance: "1 pemilik + 1 staf",
    transactionAllowance: "Unlimited",
    transactionLimit: Infinity,
    isUnlimited: true,
    features: [
      "1 pemilik + 1 staf",
      "Transaksi unlimited",
      "Semua fitur Solo",
      "Kelola izin staf",
      "Audit aktivitas staf",
      "Cocok untuk kasir/admin",
    ],
  },
} as const;

type PlanKey = keyof typeof PLAN_DETAILS;

function formatPrice(price: number): string {
  return new Intl.NumberFormat("id-ID").format(price);
}

export function BillingSettingsPage() {
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>("monthly");
  const { data: orgData } = useOrganization();
  const isOwner = useIsOwner();
  const plan = (orgData?.organization?.current_plan as PlanKey) || "free";
  const planInfo = PLAN_DETAILS[plan] || PLAN_DETAILS.free;
  const isFreePlan = plan === "free";
  const isYearly = billingPeriod === "yearly";

  const { data: usage, error: usageError, refetch: refetchUsage } = useQuery({
    queryKey: ["monthly-usage", orgData?.organization?.id],
    queryFn: async () => {
      if (!orgData?.organization?.id) return null;
      return fetchMonthlyTransactionUsage(orgData.organization.id);
    },
    enabled: !!orgData?.organization?.id,
  });

  const usageCount = usage?.count ?? 0;
  const usageLimit = usage?.limit ?? FREE_PLAN_TRANSACTION_LIMIT;
  const usagePercent = isFreePlan
    ? Math.round((usageCount / usageLimit) * 100)
    : 0;
  const boundedUsagePercent = Math.min(Math.max(usagePercent, 0), 100);
  const remaining = isFreePlan
    ? (usage?.remaining ?? usageLimit)
    : 0;
  const isNearLimit = isFreePlan && usagePercent >= 80;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 space-y-8">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Langganan & Billing</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Kelola paket langganan dan lihat penggunaan Anda.
        </p>
      </div>

      {/* Current Plan */}
      <section aria-labelledby="current-plan-heading">
        <h2
          id="current-plan-heading"
          className="mb-3 text-sm font-semibold text-wood-700"
        >
          Paket Saat Ini
        </h2>
        <Card variant="elevated">
          <CardContent className="p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xl font-bold text-wood-900">
                    {planInfo.name}
                  </h3>
                  <Badge variant="success" dot>
                    Aktif
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-wood-600">{planInfo.description}</p>
                <div className="mt-3 flex flex-wrap gap-4 text-sm">
                  <div>
                    <span className="block text-xs text-wood-500">Pengguna</span>
                    <span className="font-medium text-wood-800">
                      {planInfo.userAllowance}
                    </span>
                  </div>
                  <div>
                    <span className="block text-xs text-wood-500">Transaksi</span>
                    <span className="font-medium text-wood-800">
                      {planInfo.transactionAllowance}
                    </span>
                  </div>
                  {isFreePlan && (
                    <div>
                      <span className="block text-xs text-wood-500">Reset kuota</span>
                      <span className="font-medium text-wood-800">Setiap awal bulan</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Price display */}
              <div className="text-right">
                {planInfo.monthlyPrice === 0 ? (
                  <p className="text-2xl font-bold text-wood-900">Gratis</p>
                ) : (
                  <p className="text-2xl font-bold text-wood-900">
                    Rp {formatPrice(planInfo.monthlyPrice)}
                    <span className="text-sm font-normal text-wood-500">/bulan</span>
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Usage Section */}
      <section aria-labelledby="usage-heading">
        <h2
          id="usage-heading"
          className="mb-3 text-sm font-semibold text-wood-700"
        >
          Penggunaan Bulan Ini
        </h2>

        {usageError ? (
          <ErrorState error={usageError} onRetry={refetchUsage} />
        ) : isFreePlan ? (
          <Card>
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-wood-500">Transaksi terpakai</p>
                  <p className="text-3xl font-bold text-wood-900">
                    {usageCount}
                    <span className="text-base font-normal text-wood-500">
                      {" "}
                      / {usageLimit}
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-wood-500">
                    {remaining} transaksi tersisa bulan ini
                  </p>
                </div>
                {isNearLimit && (
                  <Badge variant="warning" size="md">
                    Hampir limit
                  </Badge>
                )}
              </div>

              <div className="mt-4" role="progressbar" aria-valuenow={boundedUsagePercent} aria-valuemin={0} aria-valuemax={100} aria-valuetext={`${usageCount} dari ${usageLimit} transaksi digunakan`}>
                <div className="h-3 overflow-hidden rounded-full bg-wood-100">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ease-out ${
                      isNearLimit ? "bg-clay-500" : "bg-wood-500"
                    }`}
                    style={{ width: `${boundedUsagePercent}%` }}
                  />
                </div>
                <p className="mt-1.5 text-right text-xs text-wood-500">
                  {usagePercent}%
                </p>
              </div>

              {isNearLimit && (
                <div className="mt-4 rounded-lg border border-clay-200 bg-clay-50 p-4">
                  <p className="text-sm font-medium text-clay-800">
                    Kuota hampir habis
                  </p>
                  <p className="mt-1 text-xs text-clay-600">
                    Upgrade ke paket berbayar untuk transaksi unlimited dan fitur lengkap.
                  </p>
                  {isOwner && (
                    <button
                      onClick={() => {
                        document.getElementById("plans-heading")?.scrollIntoView({ behavior: "smooth" });
                      }}
                      className="mt-2 text-xs font-medium text-clay-700 underline underline-offset-2 hover:text-clay-900"
                    >
                      Lihat paket lainnya
                    </button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-leaf-50">
                  <Check className="h-5 w-5 text-leaf-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-wood-800">
                    Transaksi unlimited
                  </p>
                  <p className="text-xs text-wood-500">
                    Paket {planInfo.name} tidak memiliki batas transaksi.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </section>

      {/* Billing Period Toggle */}
      <section aria-labelledby="plans-heading">
        <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h2
            id="plans-heading"
            className="text-sm font-semibold text-wood-700"
          >
            Perbandingan Paket
          </h2>

          {/* Toggle */}
          <div className="flex items-center gap-1 rounded-lg bg-wood-100 p-1">
            <button
              type="button"
              onClick={() => setBillingPeriod("monthly")}
              className={`relative rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                billingPeriod === "monthly"
                  ? "bg-white text-wood-900 shadow-sm"
                  : "text-wood-600 hover:text-wood-800"
              }`}
              aria-pressed={billingPeriod === "monthly"}
            >
              Bulanan
            </button>
            <button
              type="button"
              onClick={() => setBillingPeriod("yearly")}
              className={`relative rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                billingPeriod === "yearly"
                  ? "bg-white text-wood-900 shadow-sm"
                  : "text-wood-600 hover:text-wood-800"
              }`}
              aria-pressed={billingPeriod === "yearly"}
            >
              Tahunan
              <Badge variant="success" size="sm" className="ml-1.5">
                Hemat 2 bulan
              </Badge>
            </button>
          </div>
        </div>

        {/* Plan Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:items-stretch">
          {(Object.keys(PLAN_DETAILS) as PlanKey[]).map((key) => {
            const info = PLAN_DETAILS[key];
            const isCurrent = key === plan;
            const isRecommended = key === "business" && plan !== "business";
            const price = isYearly ? info.yearlyPrice : info.monthlyPrice;

            return (
              <div key={key} className="flex h-full flex-col">
                <Card
                  variant={isRecommended ? "elevated" : "default"}
                  className={
                    "flex h-full flex-col " +
                    (isCurrent
                      ? "ring-2 ring-wood-500"
                      : isRecommended
                        ? "ring-2 ring-leaf-300"
                        : "")
                  }
                >
                  <CardContent className="flex flex-1 flex-col p-5">
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="font-bold text-wood-900">{info.name}</h3>
                      <div className="flex gap-1.5">
                        {isCurrent && (
                          <Badge variant="info" size="sm">
                            Saat ini
                          </Badge>
                        )}
                        {isRecommended && (
                          <Badge variant="success" size="sm">
                            Disarankan
                          </Badge>
                        )}
                      </div>
                    </div>

                    <p className="mb-3 text-xs text-wood-500">{info.description}</p>

                    {/* Price */}
                    <div className="mb-4">
                      {price === 0 ? (
                        <p className="text-2xl font-bold text-wood-900">Gratis</p>
                      ) : (
                        <>
                          <p className="text-2xl font-bold text-wood-900">
                            Rp {formatPrice(price)}
                            <span className="text-sm font-normal text-wood-500">
                              /{isYearly ? "tahun" : "bulan"}
                            </span>
                          </p>
                          {isYearly && 'monthlyEquivalent' in info && (
                            <p className="mt-0.5 text-xs text-wood-500">
                              Setara Rp {formatPrice((info as {monthlyEquivalent?: number}).monthlyEquivalent || 0)}/bulan
                            </p>
                          )}
                        </>
                      )}
                    </div>

                    {/* Key details */}
                    <div className="mb-4 flex flex-col gap-1.5 text-sm text-wood-600">
                      <div className="flex min-w-0 justify-between gap-3">
                        <span>Pengguna</span>
                        <span className="break-words text-right font-medium text-wood-800">
                          {info.userAllowance}
                        </span>
                      </div>
                      <div className="flex min-w-0 justify-between gap-3">
                        <span>Transaksi</span>
                        <span className="break-words text-right font-medium text-wood-800">
                          {info.transactionAllowance}
                        </span>
                      </div>
                    </div>

                    {/* Features */}
                    <ul className="mb-4 space-y-2">
                      {info.features.map((f) => (
                        <li
                          key={f}
                          className="flex min-w-0 items-start gap-2 text-xs text-wood-600"
                        >
                          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-leaf-600" />
                          <span className="min-w-0 break-words">{f}</span>
                        </li>
                      ))}
                    </ul>

                    {/* CTA - pushed to bottom */}
                    <div className="mt-auto pt-6">
                      {isCurrent ? (
                        <Button
                          type="button"
                          variant="outline"
                          fullWidth
                          disabled
                        >
                          Paket saat ini
                        </Button>
                      ) : info.monthlyPrice === 0 ? (
                        <Button
                          type="button"
                          variant="secondary"
                          fullWidth
                          disabled
                        >
                          Sudah menggunakan
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant={isRecommended ? "primary" : "secondary"}
                          fullWidth
                          disabled={!isOwner}
                        >
                          {isOwner ? (
                            <>
                              <MessageCircle className="h-4 w-4" />
                              Minta Upgrade
                              <ArrowRight className="h-4 w-4" />
                            </>
                          ) : (
                            "Tidak tersedia"
                          )}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            );
          })}
        </div>

        {/* Manual Upgrade Notice */}
        {isOwner && (
          <Card className="mt-4">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-wood-100">
                  <RefreshCw className="h-5 w-5 text-wood-600" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-wood-800">
                    Ingin upgrade sekarang?
                  </p>
                  <p className="mt-0.5 text-xs text-wood-600">
                    Pembayaran online sedang disiapkan. Untuk upgrade sekarang, hubungi admin Ledjer melalui WhatsApp atau email.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </section>

      {/* Non-owner notice */}
      {!isOwner && (
        <Card variant="filled">
          <CardContent className="p-4">
            <p className="text-sm text-center text-wood-600">
              Hanya pemilik organisasi yang dapat mengubah paket langganan.
              Hubungi pemilik untuk informasi lebih lanjut.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
