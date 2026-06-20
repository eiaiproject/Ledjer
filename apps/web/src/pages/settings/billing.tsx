import { useQuery } from "@tanstack/react-query";
import { useOrganization, useIsOwner } from "@/hooks/useOrganization";
import {
  fetchMonthlyTransactionUsage,
  FREE_PLAN_TRANSACTION_LIMIT,
} from "@/lib/transaction-usage";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";

const PLAN_DETAILS = {
  free: {
    name: "Gratis",
    price: "Rp 0",
    period: "/bulan",
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
    price: "Rp 99.000",
    period: "/bulan",
    userAllowance: "1 pemilik",
    transactionAllowance: "Unlimited",
    transactionLimit: Infinity,
    isUnlimited: true,
    features: [
      "1 pemilik",
      "Transaksi unlimited",
      "Laporan lengkap",
      "Buku besar",
      "Audit log",
    ],
  },
  business: {
    name: "Business",
    price: "Rp 199.000",
    period: "/bulan",
    userAllowance: "1 pemilik + 1 staf",
    transactionAllowance: "Unlimited",
    transactionLimit: Infinity,
    isUnlimited: true,
    features: [
      "1 pemilik + 1 staf",
      "Transaksi unlimited",
      "Kelola izin staf",
      "Semua fitur Solo",
    ],
  },
} as const;

type PlanKey = keyof typeof PLAN_DETAILS;

export function BillingSettingsPage() {
  const { data: orgData } = useOrganization();
  const isOwner = useIsOwner();
  const plan = (orgData?.organization?.current_plan as PlanKey) || "free";
  const planInfo = PLAN_DETAILS[plan] || PLAN_DETAILS.free;
  const isFreePlan = plan === "free";

  const { data: usage } = useQuery({
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
  const remaining = isFreePlan
    ? (usage?.remaining ?? usageLimit)
    : 0;
  const isNearLimit = isFreePlan && usagePercent >= 80;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 space-y-8">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-wood-900">Langganan & Billing</h1>
        <p className="mt-1 text-sm text-wood-500">
          Tinjau paket, penggunaan, dan opsi upgrade langganan Anda.
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
                <p className="mt-1 text-2xl font-bold text-wood-700">
                  {planInfo.price}
                  <span className="text-sm font-normal text-wood-500">
                    {planInfo.period}
                  </span>
                </p>
              </div>

              {/* Key plan details */}
              <div className="flex flex-wrap gap-4 text-sm">
                <div>
                  <span className="block text-xs text-wood-400">Pengguna</span>
                  <span className="font-medium text-wood-800">
                    {planInfo.userAllowance}
                  </span>
                </div>
                <div>
                  <span className="block text-xs text-wood-400">Transaksi</span>
                  <span className="font-medium text-wood-800">
                    {planInfo.transactionAllowance}
                  </span>
                </div>
              </div>
            </div>

            {/* Feature list */}
            <ul className="mt-5 grid gap-2 sm:grid-cols-2">
              {planInfo.features.map((feature) => (
                <li
                  key={feature}
                  className="flex items-center gap-2 text-sm text-wood-700"
                >
                  <Check className="h-4 w-4 shrink-0 text-leaf-600" />
                  {feature}
                </li>
              ))}
            </ul>
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

        {isFreePlan ? (
          <Card>
            <CardContent className="p-6">
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-sm text-wood-500">Transaksi</p>
                  <p className="text-2xl font-bold text-wood-900">
                    {usageCount}
                    <span className="text-sm font-normal text-wood-500">
                      {" "}
                      / {usageLimit}
                    </span>
                  </p>
                </div>
                {isNearLimit && (
                  <Badge variant="warning" size="md">
                    Hampir limit
                  </Badge>
                )}
              </div>

              <div className="mt-4" role="progressbar" aria-valuenow={usagePercent} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-2.5 overflow-hidden rounded-full bg-wood-100">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      isNearLimit ? "bg-clay-500" : "bg-wood-500"
                    }`}
                    style={{ width: `${Math.min(usagePercent, 100)}%` }}
                  />
                </div>
                <p className="mt-1.5 text-xs text-wood-500">
                  {remaining} transaksi tersisa bulan ini
                  <span className="ml-1 text-wood-400">({usagePercent}%)</span>
                </p>
              </div>

              {isNearLimit && (
                <div className="mt-3 rounded-md border border-clay-200 bg-clay-50 p-3 text-xs text-clay-700">
                  Pertimbangkan upgrade agar pencatatan tidak terhenti.
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

      {/* Upgrade / Plan Comparison */}
      <section aria-labelledby="plans-heading">
        <h2
          id="plans-heading"
          className="mb-3 text-sm font-semibold text-wood-700"
        >
          Perbandingan Paket
        </h2>

        <div className="grid gap-4 sm:grid-cols-3">
          {(Object.keys(PLAN_DETAILS) as PlanKey[]).map((key) => {
            const info = PLAN_DETAILS[key];
            const isCurrent = key === plan;
            const isRecommended = key === "business" && plan !== "business";

            return (
              <Card
                key={key}
                variant={isRecommended ? "elevated" : "default"}
                className={
                  isCurrent
                    ? "ring-2 ring-wood-500"
                    : isRecommended
                      ? "ring-2 ring-leaf-300"
                      : ""
                }
              >
                <CardContent className="p-5">
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

                  <p className="text-xl font-bold text-wood-900">
                    {info.price}
                    <span className="text-sm font-normal text-wood-500">
                      {info.period}
                    </span>
                  </p>

                  {/* Key details */}
                  <div className="mt-3 flex flex-col gap-1 text-sm text-wood-600">
                    <div className="flex justify-between">
                      <span>Pengguna</span>
                      <span className="font-medium text-wood-800">
                        {info.userAllowance}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Transaksi</span>
                      <span className="font-medium text-wood-800">
                        {info.transactionAllowance}
                      </span>
                    </div>
                  </div>

                  <ul className="mt-4 space-y-1.5">
                    {info.features.map((f) => (
                      <li
                        key={f}
                        className="flex items-center gap-1.5 text-xs text-wood-600"
                      >
                        <Check className="h-3.5 w-3.5 shrink-0 text-leaf-600" />
                        {f}
                      </li>
                    ))}
                  </ul>

                  {/* CTA */}
                  <div className="mt-4">
                    {isCurrent ? (
                      <Button
                        type="button"
                        variant="outline"
                        fullWidth
                        disabled
                      >
                        Paket saat ini
                      </Button>
                    ) : (
                      <>
                        <Button
                          type="button"
                          variant={isRecommended ? "primary" : "secondary"}
                          fullWidth
                          disabled
                        >
                          {isOwner ? "Upgrade" : "Tidak tersedia"}
                        </Button>
                        {isOwner && (
                          <p className="mt-1.5 text-center text-xs text-wood-400">
                            Pembayaran online segera tersedia.
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {isOwner && (
          <p className="mt-3 text-center text-xs text-wood-500">
            Untuk sementara, silakan hubungi admin untuk upgrade manual.
          </p>
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
