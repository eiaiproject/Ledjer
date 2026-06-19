import { useQuery } from "@tanstack/react-query";
import { useOrganization, useIsOwner } from "@/hooks/useOrganization";
import {
  fetchMonthlyTransactionUsage,
  FREE_PLAN_TRANSACTION_LIMIT,
} from "@/lib/transaction-usage";
import { Check } from "lucide-react";

const PLAN_DETAILS = {
  free: {
    name: "Gratis",
    price: "Rp 0",
    period: "/bulan",
    users: "1 pemilik",
    transactions: "50 transaksi/bulan",
    features: ["1 pemilik", "50 transaksi/bulan", "Laporan dasar", "Bagan akun default"],
  },
  solo: {
    name: "Solo",
    price: "Rp 99.000",
    period: "/bulan",
    users: "1 pemilik",
    transactions: "Unlimited",
    features: ["1 pemilik", "Transaksi unlimited", "Laporan lengkap", "Buku besar", "Audit log"],
  },
  business: {
    name: "Business",
    price: "Rp 199.000",
    period: "/bulan",
    users: "1 pemilik + 1 staf",
    transactions: "Unlimited",
    features: ["1 pemilik + 1 staf", "Transaksi unlimited", "Kelola izin staf", "Semua fitur Solo"],
  },
};

export function BillingSettingsPage() {
  const { data: orgData } = useOrganization();
  const isOwner = useIsOwner();
  const plan = orgData?.organization?.current_plan as keyof typeof PLAN_DETAILS;

  const { data: usage } = useQuery({
    queryKey: ["monthly-usage", orgData?.organization?.id],
    queryFn: async () => {
      if (!orgData?.organization?.id) return null;
      return fetchMonthlyTransactionUsage(orgData.organization.id);
    },
    enabled: !!orgData?.organization?.id,
  });

  const planInfo = PLAN_DETAILS[plan] || PLAN_DETAILS.free;
  const usageLimit = usage?.limit ?? FREE_PLAN_TRANSACTION_LIMIT;
  const usagePercent = plan === "free" ? ((usage?.count || 0) / usageLimit) * 100 : 0;
  const isNearLimit = plan === "free" && usagePercent >= 80;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-2 text-xl font-bold text-wood-900">Langganan & Billing</h1>
      <p className="mb-6 text-sm text-wood-500">Kelola paket langganan Anda</p>

      {/* Current Plan */}
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold text-wood-700">Paket Saat Ini</h2>
        <div className="rounded-lg border border-wood-200 bg-cream-100 p-6">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-lg font-bold text-wood-900">{planInfo.name}</h3>
              <p className="mt-1 text-2xl font-bold text-wood-700">
                {planInfo.price}
                <span className="text-sm font-normal text-wood-500">{planInfo.period}</span>
              </p>
            </div>
            <span className="rounded-full bg-wood-100 px-3 py-1 text-xs font-medium text-wood-700">
              Aktif
            </span>
          </div>
          <ul className="mt-4 space-y-2">
            {planInfo.features.map((feature) => (
              <li key={feature} className="flex items-center gap-2 text-sm text-wood-800">
                <Check className="h-4 w-4 text-leaf-600" />
                {feature}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Usage */}
      {plan === "free" && (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold text-wood-700">Penggunaan Bulan Ini</h2>
          <div className="rounded-lg border border-wood-200 bg-cream-50 p-6">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-sm text-wood-600">Transaksi</p>
                <p className="text-2xl font-bold text-wood-900">
                  {usage?.count || 0}
                  <span className="text-sm font-normal text-wood-500"> / {usageLimit}</span>
                </p>
              </div>
              {isNearLimit && (
                <span className="rounded-full bg-clay-400/10 px-2.5 py-0.5 text-xs font-medium text-clay-600">
                  Hampir limit
                </span>
              )}
            </div>
            <div className="mt-3">
              <div className="h-2 overflow-hidden rounded-full bg-wood-100">
                <div
                  className={`h-full rounded-full transition-all ${
                    isNearLimit ? "bg-clay-500" : "bg-wood-500"
                  }`}
                  style={{ width: `${Math.min(usagePercent, 100)}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-wood-500">
                {usage?.remaining ?? usageLimit} transaksi tersisa bulan ini
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Upgrade CTA */}
      {isOwner && plan === "free" && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-wood-700">Upgrade Paket</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <PlanCard
              name={PLAN_DETAILS.solo.name}
              price={PLAN_DETAILS.solo.price}
              features={PLAN_DETAILS.solo.features}
              recommended={false}
            />
            <PlanCard
              name={PLAN_DETAILS.business.name}
              price={PLAN_DETAILS.business.price}
              features={PLAN_DETAILS.business.features}
              recommended={true}
            />
          </div>
          <p className="mt-3 text-center text-xs text-wood-500">
            Pembayaran akan segera tersedia. Untuk sementara, silakan hubungi admin untuk upgrade.
          </p>
        </section>
      )}

      {!isOwner && (
        <div className="rounded-lg border border-wood-200 bg-cream-100 p-4 text-center text-sm text-wood-500">
          Hubungi pemilik organisasi untuk mengelola langganan.
        </div>
      )}
    </div>
  );
}

function PlanCard({
  name,
  price,
  features,
  recommended,
}: {
  name: string;
  price: string;
  features: string[];
  recommended: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-5 ${
        recommended
          ? "border-wood-300 bg-cream-100"
          : "border-wood-200 bg-cream-50"
      }`}
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-bold text-wood-900">{name}</h3>
        {recommended && (
          <span className="rounded-full bg-wood-100 px-2 py-0.5 text-xs font-medium text-wood-700">
            Disarankan
          </span>
        )}
      </div>
      <p className="mb-3 text-xl font-bold text-wood-900">{price}/bulan</p>
      <ul className="space-y-1.5">
        {features.map((f) => (
          <li key={f} className="flex items-center gap-1.5 text-xs text-wood-600">
            <Check className="h-3.5 w-3.5 text-leaf-600" />
            {f}
          </li>
        ))}
      </ul>
      <button
        disabled
        className="mt-4 w-full rounded-md border border-wood-300 px-4 py-2 text-sm font-medium text-wood-400 cursor-not-allowed"
      >
        Segera tersedia
      </button>
    </div>
  );
}
