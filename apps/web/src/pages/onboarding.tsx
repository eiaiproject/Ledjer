import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Controller, useForm, useFieldArray } from "react-hook-form";
import { z } from "zod/v3";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Json } from "@ledjer/database-types";
import { formatAmountInput, formatDateInputValue, parseAmountInput } from "@/lib/utils";
import { useAuth } from "@/contexts/auth-context";
import { queryKeys } from "@/lib/query-keys";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Logo } from "@/components/ui/logo";
import { translateError } from "@/lib/errors";
import { CheckCircle, Info, Trash2 } from "lucide-react";

const businessSchema = z.object({
  organizationName: z.string().min(2, "Nama bisnis harus minimal 2 karakter"),
  businessType: z.enum(["service", "simple_trading"], {
    message: "Pilih jenis bisnis",
  }),
  booksStartDate: z.string().min(1, "Tanggal wajib diisi"),
});

const accountSchema = z.object({
  accountCode: z.string().min(1, "Pilih akun"),
  openingBalance: z.number().min(0, "Saldo tidak boleh negatif"),
});

const cashSetupSchema = z.object({
  accounts: z.array(accountSchema).min(1, "Minimal satu akun"),
  openingReceivable: z.number().min(0, "Saldo tidak boleh negatif"),
  openingPayable: z.number().min(0, "Saldo tidak boleh negatif"),
  openingEquity: z.number().min(0, "Saldo tidak boleh negatif"),
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

const STEPS = [1, 2] as const;

function localDate() {
  return formatDateInputValue();
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
      openingReceivable: 0,
      openingPayable: 0,
      openingEquity: 0,
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

      // Optional non-cash opening balances for migrating businesses. Each is
      // posted by create_organization_with_opening_balances → post_opening_balance,
      // balanced against Saldo Awal (3200). Only positive amounts are sent.
      if (data.openingReceivable > 0) {
        extraOpeningBalances.push({
          accountCode: "1200",
          openingBalance: data.openingReceivable,
          description: "Saldo awal piutang usaha",
        });
      }
      if (data.openingPayable > 0) {
        extraOpeningBalances.push({
          accountCode: "2100",
          openingBalance: data.openingPayable,
          description: "Saldo awal utang usaha",
        });
      }
      if (data.openingEquity > 0) {
        extraOpeningBalances.push({
          accountCode: "3100",
          openingBalance: data.openingEquity,
          description: "Saldo awal modal pemilik",
        });
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

      await queryClient.invalidateQueries({ queryKey: queryKeys.allOrganization() });
      await queryClient.invalidateQueries({ queryKey: queryKeys.accounts.all(orgId) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(orgId) });
      navigate("/dashboard", { replace: true });
    } catch (err) {
      if (import.meta.env.DEV) console.error("Error creating organization:", err);
      setError(translateError(err));
      setLoading(false);
    }
  };

  return (
    <div className="ledger-page flex min-h-screen items-center justify-center bg-cream-100 px-4 py-8 sm:py-12">
      <div className="w-full max-w-lg space-y-7">
        {/* Header */}
        <div className="space-y-3 text-center">
          <div className="flex justify-center">
            <Logo size="md" variant="icon" />
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-bold text-text-primary">Selamat datang di Ledjer</h1>
            <p className="text-sm text-text-secondary">Siapkan bisnis Anda.</p>
          </div>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-center gap-2.5" aria-label={`Langkah ${step} dari ${STEPS.length}`}>
          {STEPS.map((stepNumber) => (
            <div key={stepNumber} className="flex items-center gap-2.5">
              <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-[background-color,color,transform] duration-200 ease-out ${
                step >= stepNumber
                  ? "bg-leaf-500 text-text-on-success"
                  : "bg-cream-200 text-wood-400"
              }`} aria-current={step === stepNumber ? "step" : undefined}>
                {step > stepNumber ? (
                  <CheckCircle className="h-4 w-4" />
                ) : (
                  stepNumber
                )}
              </div>
              {stepNumber < STEPS.length && (
                <div className={`h-0.5 w-10 transition-colors duration-200 ease-out ${step > stepNumber ? "bg-leaf-500" : "bg-cream-200"}`} />
              )}
            </div>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-md bg-error/10 p-3 text-sm text-error" role="alert">{error}</div>
        )}

        {/* Step 1: Business Profile */}
        {step === 1 && (
          <Card padding="lg">
            <CardContent>
              <form onSubmit={businessForm.handleSubmit(onBusinessSubmit)} className="space-y-6">
                {/* Header section */}
                <div className="space-y-1">
                  <h2 className="text-lg font-semibold text-wood-800">Profil Bisnis</h2>
                  <p className="text-sm text-text-tertiary">Isi informasi dasar bisnis Anda.</p>
                </div>

                {/* Divider */}
                <div className="border-t border-wood-100" />

                {/* Form fields section */}
                <div className="space-y-5">
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
                        <p className="mb-2.5 text-sm font-medium text-text-secondary">Jenis Bisnis</p>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Jenis bisnis" aria-describedby={businessForm.formState.errors.businessType ? "business-type-error" : undefined}>
                          {BUSINESS_TYPES.map((type) => (
                            <button
                              key={type.value}
                              type="button"
                              role="radio"
                              aria-checked={field.value === type.value}
                              onClick={() => field.onChange(type.value)}
                              className={`ledger-interactive inline-flex w-full flex-col items-start justify-start gap-1.5 rounded-md border p-4 text-left shadow-none transition-[background-color,border-color,box-shadow] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wood-500 ${
                                field.value === type.value
                                  ? "border-leaf-500 bg-leaf-50 text-leaf-700 ring-1 ring-leaf-200"
                                  : "border-wood-200 bg-surface text-text-secondary hover:border-wood-300 hover:bg-cream-100"
                              }`}
                            >
                              <span className="text-sm font-semibold">{type.label}</span>
                              <span className="text-xs leading-relaxed text-text-tertiary">{type.description}</span>
                            </button>
                          ))}
                        </div>
                        {businessForm.formState.errors.businessType && (
                          <p id="business-type-error" className="mt-2 text-xs text-error" role="alert">{businessForm.formState.errors.businessType.message}</p>
                        )}
                      </div>
                    )}
                  />

                  <div>
                    <Input
                      label="Tanggal Mulai Pencatatan"
                      type="date"
                      {...businessForm.register("booksStartDate")}
                      aria-describedby="books-start-date-hint"
                    />
                    <span
                      id="books-start-date-hint"
                      className="mt-2 inline-flex items-center gap-1.5 text-xs text-text-tertiary"
                      title="Tanggal ini menjadi hari pertama pencatatan dan dasar perhitungan saldo awal."
                    >
                      <Info className="h-3.5 w-3.5" />
                      Dasar saldo awal
                    </span>
                  </div>
                </div>

                {/* Actions section */}
                <div className="space-y-3 pt-2">
                  <Button type="submit" fullWidth>
                    Selanjutnya
                  </Button>
                  <Button type="button" variant="ghost" fullWidth onClick={onSkipBusinessDetails} disabled={loading} className="text-text-tertiary hover:text-text-secondary">
                    Lewati, saya akan atur nanti
                  </Button>
                </div>
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
                  <p className="text-sm text-wood-500">Saldo awal kas dan bank.</p>
                </div>

                <div className="space-y-3">
                  {fields.map((field, index) => {
                    const selectedCode = field.accountCode;
                    const accountInfo = CASH_ACCOUNTS.find((a) => a.code === selectedCode) || CASH_ACCOUNTS[1];

                    return (
                      <div key={field.id} className="space-y-3 rounded-lg border border-wood-200 bg-cream-50 p-4 transition-colors duration-150 ease-out focus-within:border-wood-300">
                        <div className="flex min-w-0 items-center justify-between gap-3">
                          <span className="min-w-0 break-words text-sm font-medium text-wood-700">
                            {index > 1 ? `Bank ${index}` : accountInfo.name}
                          </span>
                          {index > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-label="Hapus rekening bank"
                              onClick={() => remove(index)}
                              disabled={loading}
                              className="h-10 w-10 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 text-wood-500 hover:text-error"
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
                  disabled={loading}
                  onClick={() => append({ accountCode: "1120", openingBalance: 0 })}
                >
                  Tambah rekening bank lain
                </Button>

                {/* Optional non-cash opening balances for migrating businesses */}
                <div className="space-y-3 rounded-lg border border-wood-200 bg-cream-50 p-4">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium text-wood-700">Saldo awal lainnya</p>
                    <p className="text-xs text-text-tertiary">
                      Opsional. Untuk bisnis yang sudah berjalan: isi piutang, utang, atau modal awal.
                    </p>
                  </div>

                  <Controller
                    control={cashForm.control}
                    name="openingReceivable"
                    render={({ field }) => (
                      <Input
                        label="Piutang Usaha (belum tertagih dari pelanggan)"
                        type="text"
                        inputMode="numeric"
                        value={formatAmountInput(field.value)}
                        onBlur={field.onBlur}
                        onChange={(e) => field.onChange(parseAmountInput(e.target.value, 0))}
                        placeholder="0"
                        error={cashForm.formState.errors.openingReceivable?.message}
                      />
                    )}
                  />

                  <Controller
                    control={cashForm.control}
                    name="openingPayable"
                    render={({ field }) => (
                      <Input
                        label="Utang Usaha (belum dibayar ke pemasok)"
                        type="text"
                        inputMode="numeric"
                        value={formatAmountInput(field.value)}
                        onBlur={field.onBlur}
                        onChange={(e) => field.onChange(parseAmountInput(e.target.value, 0))}
                        placeholder="0"
                        error={cashForm.formState.errors.openingPayable?.message}
                      />
                    )}
                  />

                  <Controller
                    control={cashForm.control}
                    name="openingEquity"
                    render={({ field }) => (
                      <Input
                        label="Modal Pemilik"
                        type="text"
                        inputMode="numeric"
                        value={formatAmountInput(field.value)}
                        onBlur={field.onBlur}
                        onChange={(e) => field.onChange(parseAmountInput(e.target.value, 0))}
                        placeholder="0"
                        error={cashForm.formState.errors.openingEquity?.message}
                      />
                    )}
                  />
                </div>

                <div className="flex gap-3">
                  <Button type="button" variant="outline" fullWidth onClick={() => setStep(1)} disabled={loading}>
                    Kembali
                  </Button>
                  <Button type="submit" fullWidth loading={loading} disabled={loading}>
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
