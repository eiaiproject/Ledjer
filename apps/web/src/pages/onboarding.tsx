import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Controller, useForm, useFieldArray } from "react-hook-form";
import { z } from "zod/v4";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Json } from "@/lib/database-types";
import { formatAmountInput, parseAmountInput } from "@/lib/utils";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Logo } from "@/components/ui/logo";
import { translateError } from "@/lib/errors";
import { Building2, CheckCircle, Info, Trash2, Wallet } from "lucide-react";

const businessSchema = z.object({
  organizationName: z.string().min(2, "Nama bisnis harus minimal 2 karakter"),
  businessType: z.enum(["service", "simple_trading"], {
    error: "Pilih jenis bisnis",
  }),
  booksStartDate: z.string().min(1, "Tanggal wajib diisi"),
});

const accountSchema = z.object({
  accountCode: z.string().min(1, "Pilih akun"),
  openingBalance: z.number().min(0, "Saldo tidak boleh negatif"),
});

const cashSetupSchema = z.object({
  accounts: z.array(accountSchema).min(1, "Minimal satu akun"),
});

type BusinessForm = z.infer<typeof businessSchema>;
type CashSetupForm = z.infer<typeof cashSetupSchema>;

interface ExtraOpeningBalance {
  accountCode?: string;
  openingBalance: number;
  description: string;
  createBank?: boolean;
  bankNumber?: number;
  accountName?: string;
}

// Default cash/bank accounts from chart of accounts
const CASH_ACCOUNTS = [
  { code: "1110", name: "Kas", type: "cash" },
  { code: "1120", name: "Bank", type: "bank" },
];

const BUSINESS_TYPES = [
  {
    value: "simple_trading",
    label: "Jual Beli Barang",
    description: "Untuk toko, reseller, dan bisnis yang punya stok barang.",
  },
  {
    value: "service",
    label: "Penyedia Jasa",
    description: "Untuk jasa profesional, agensi, bengkel, atau layanan lain.",
  },
] as const;

const STEPS = [
  { number: 1, label: "Profil Bisnis", icon: Building2 },
  { number: 2, label: "Atur Saldo", icon: Wallet },
];

function localDate() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().split("T")[0];
}

export function OnboardingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [businessData, setBusinessData] = useState<BusinessForm | null>(null);

  const businessForm = useForm<BusinessForm>({
    resolver: zodResolver(businessSchema),
    defaultValues: {
      businessType: "service",
      booksStartDate: localDate(),
    },
  });

  const cashForm = useForm<CashSetupForm>({
    resolver: zodResolver(cashSetupSchema),
    defaultValues: {
      accounts: [
        { accountCode: "1110", openingBalance: 0 },
        { accountCode: "1120", openingBalance: 0 },
      ],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: cashForm.control,
    name: "accounts",
  });

  const onBusinessSubmit = (data: BusinessForm) => {
    setBusinessData(data);
    setStep(2);
  };

  const onSkipBusinessDetails = () => {
    const values = businessForm.getValues();
    setBusinessData({
      organizationName: values.organizationName?.trim() || "Bisnis Saya",
      businessType: values.businessType || "service",
      booksStartDate: values.booksStartDate || localDate(),
    });
    setStep(2);
  };

  const onCashSubmit = async (data: CashSetupForm) => {
    if (!businessData || !user) return;
    setLoading(true);
    setError(null);

    try {
      const defaultAccountRows = data.accounts.slice(0, 2);
      const mainAccount =
        defaultAccountRows.find((a) => a.openingBalance > 0) ||
        defaultAccountRows[0] ||
        data.accounts[0];
      const mainAccountInfo = CASH_ACCOUNTS.find((a) => a.code === mainAccount.accountCode);
      const extraOpeningBalances: ExtraOpeningBalance[] = [];
      let extraBankNumber = 2;

      for (const [index, account] of data.accounts.entries()) {
        if (account === mainAccount || account.openingBalance <= 0) continue;

        if (index <= 1) {
          const accountInfo = CASH_ACCOUNTS.find((a) => a.code === account.accountCode);
          extraOpeningBalances.push({
            accountCode: account.accountCode,
            openingBalance: account.openingBalance,
            description: `Saldo awal ${accountInfo?.name || "Kas/Bank"}`,
          });
          continue;
        }

        const accountName = `Bank ${extraBankNumber}`;
        extraOpeningBalances.push({
          createBank: true,
          bankNumber: extraBankNumber,
          accountName,
          openingBalance: account.openingBalance,
          description: `Saldo awal ${accountName}`,
        });
        extraBankNumber += 1;
      }

      const { data: orgResponse, error: orgError } = await supabase.rpc("create_organization_with_opening_balances", {
        p_organization_name: businessData.organizationName,
        p_business_type: businessData.businessType,
        p_books_start_date: businessData.booksStartDate,
        p_default_cash_account_name: mainAccountInfo?.name || "Kas",
        p_opening_cash_balance: mainAccount.openingBalance,
        p_extra_opening_balances: extraOpeningBalances as unknown as Json,
      });

      if (orgError) {
        setError(orgError.message || "Gagal membuat organisasi");
        setLoading(false);
        return;
      }

      // Extract organization_id from response
      const orgData = orgResponse as { id?: string; organization_id?: string } | null;
      const orgId = orgData?.id || orgData?.organization_id;
      if (!orgId) {
        setError("Gagal mendapatkan ID organisasi");
        setLoading(false);
        return;
      }

      await queryClient.invalidateQueries({ queryKey: ["organization"] });
      await queryClient.invalidateQueries({ queryKey: ["accounts"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      navigate("/dashboard", { replace: true });
    } catch (err) {
      console.error("Error creating organization:", err);
      setError(translateError(err));
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-cream-100 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-lg space-y-6">
        {/* Header */}
        <div className="text-center">
          <div className="mb-4 flex justify-center">
            <Logo size="md" variant="icon" tone="dark" />
          </div>
          <h1 className="text-2xl font-bold text-wood-800">Selamat datang di Ledjer</h1>
          <p className="mt-1 text-sm text-wood-500">Mari siapkan bisnis Anda dalam 2 langkah mudah</p>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-center gap-2">
          {STEPS.map((s) => (
            <div key={s.number} className="flex items-center gap-2">
              <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors ${
                step >= s.number
                  ? "bg-leaf-500 text-text-on-success"
                  : "bg-cream-200 text-wood-400"
              }`}>
                {step > s.number ? (
                  <CheckCircle className="h-4 w-4" />
                ) : (
                  s.number
                )}
              </div>
              {s.number < STEPS.length && (
                <div className={`w-12 h-0.5 ${step > s.number ? "bg-leaf-500" : "bg-cream-200"}`} />
              )}
            </div>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-md bg-error/10 p-3 text-sm text-error">{error}</div>
        )}

        {/* Step 1: Business Profile */}
        {step === 1 && (
          <Card padding="lg">
            <CardContent>
              <form onSubmit={businessForm.handleSubmit(onBusinessSubmit)} className="space-y-4">
                <div>
                  <h2 className="text-lg font-semibold text-wood-800">Profil Bisnis</h2>
                  <p className="text-sm text-wood-500">Ceritakan tentang bisnis Anda</p>
                </div>

                <Input
                  label="Nama Bisnis"
                  {...businessForm.register("organizationName")}
                  placeholder="Toko Berkah"
                  error={businessForm.formState.errors.organizationName?.message}
                />

                <Controller
                  control={businessForm.control}
                  name="businessType"
                  render={({ field }) => (
                    <div>
                      <p className="mb-2 text-sm font-medium text-text-secondary">Jenis Bisnis</p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {BUSINESS_TYPES.map((type) => (
                          <Button
                            key={type.value}
                            type="button"
                            variant="outline"
                            onClick={() => field.onChange(type.value)}
                            className={`h-auto min-h-[112px] items-start justify-start p-4 text-left shadow-none ${
                              field.value === type.value
                                ? "border-leaf-500 bg-leaf-50 text-leaf-700"
                                : "border-wood-200 bg-surface text-text-secondary hover:bg-cream-100"
                            }`}
                          >
                            <span>
                              <span className="block text-sm font-semibold">{type.label}</span>
                              <span className="mt-1 block text-xs text-text-tertiary">{type.description}</span>
                            </span>
                          </Button>
                        ))}
                      </div>
                      {businessForm.formState.errors.businessType && (
                        <p className="mt-1 text-xs text-error">{businessForm.formState.errors.businessType.message}</p>
                      )}
                    </div>
                  )}
                />

                <div>
                  <Input
                    label="Tanggal Mulai Pencatatan"
                    type="date"
                    {...businessForm.register("booksStartDate")}
                  />
                  <span
                    className="mt-1 inline-flex items-center gap-1 text-xs text-text-tertiary"
                    title="Tanggal ini menjadi hari pertama pencatatan dan dasar perhitungan saldo awal."
                  >
                    <Info className="h-3 w-3" />
                    Dasar saldo awal
                  </span>
                </div>

                <Button type="submit" fullWidth>
                  Selanjutnya
                </Button>
                <Button type="button" variant="link" fullWidth onClick={onSkipBusinessDetails}>
                  Lewati, saya akan atur nanti
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Cash Setup */}
        {step === 2 && (
          <Card padding="lg">
            <CardContent>
              <form onSubmit={cashForm.handleSubmit(onCashSubmit)} className="space-y-4">
                <div>
                  <h2 className="text-lg font-semibold text-wood-800">Atur Saldo</h2>
                  <p className="text-sm text-wood-500">Tentukan saldo awal kas dan/atau rekening bank Anda</p>
                </div>

                <div className="space-y-3">
                  {fields.map((field, index) => {
                    const selectedCode = field.accountCode;
                    const accountInfo = CASH_ACCOUNTS.find((a) => a.code === selectedCode) || CASH_ACCOUNTS[1];

                    return (
                      <div key={field.id} className="p-4 rounded-lg border border-wood-200 bg-cream-50 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-wood-700">
                            {index > 1 ? `Bank ${index}` : accountInfo.name}
                          </span>
                          {index > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-label="Hapus rekening bank"
                              onClick={() => remove(index)}
                              className="h-8 w-8 min-h-0 min-w-0 text-wood-400 hover:text-error"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>

                        <Controller
                          control={cashForm.control}
                          name={`accounts.${index}.openingBalance`}
                          render={({ field }) => (
                            <Input
                              label="Saldo Awal"
                              type="text"
                              inputMode="numeric"
                              value={formatAmountInput(field.value)}
                              onBlur={field.onBlur}
                              onChange={(e) => field.onChange(parseAmountInput(e.target.value, 0))}
                              placeholder="0"
                              helperText="Bisa diisi 0 jika belum ada saldo"
                            />
                          )}
                        />
                      </div>
                    );
                  })}
                </div>

                <Button
                  type="button"
                  variant="link"
                  onClick={() => append({ accountCode: "1120", openingBalance: 0 })}
                >
                  Tambah rekening bank lain
                </Button>

                <div className="flex gap-3">
                  <Button type="button" variant="outline" fullWidth onClick={() => setStep(1)}>
                    Kembali
                  </Button>
                  <Button type="submit" fullWidth loading={loading}>
                    Buat Akun Bisnis
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
