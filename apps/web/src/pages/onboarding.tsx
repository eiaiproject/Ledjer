import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Controller, useForm, useFieldArray } from "react-hook-form";
import { z } from "zod/v4";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { formatAmountInput, parseAmountInput } from "@/lib/utils";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { BookOpen, Building2, Wallet, CheckCircle, Plus, Trash2, Info } from "lucide-react";

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

// Default cash/bank accounts from chart of accounts
const CASH_ACCOUNTS = [
  { code: "1110", name: "Kas", type: "cash" },
  { code: "1120", name: "Bank", type: "bank" },
];

const STEPS = [
  { number: 1, label: "Profil Bisnis", icon: Building2 },
  { number: 2, label: "Atur Saldo", icon: Wallet },
  { number: 3, label: "Selesai", icon: CheckCircle },
];

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
      booksStartDate: new Date().toISOString().split("T")[0],
    },
  });

  const cashForm = useForm<CashSetupForm>({
    resolver: zodResolver(cashSetupSchema),
    defaultValues: {
      accounts: [
        { accountCode: "1110", openingBalance: 0 },
      ],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: cashForm.control,
    name: "accounts",
  });

  // Get available accounts (not already selected)
  const getAvailableAccounts = () => {
    const selectedCodes = fields.map((f) => cashForm.watch(`accounts.${fields.indexOf(f)}.accountCode`));
    return CASH_ACCOUNTS.filter((a) => !selectedCodes.includes(a.code));
  };

  const onBusinessSubmit = (data: BusinessForm) => {
    setBusinessData(data);
    setStep(2);
  };

  const onCashSubmit = async (data: CashSetupForm) => {
    if (!businessData || !user) return;
    setLoading(true);
    setError(null);

    try {
      // Find the main cash account (first one with balance > 0, or first one)
      const mainAccount = data.accounts.find((a) => a.openingBalance > 0) || data.accounts[0];
      const mainAccountInfo = CASH_ACCOUNTS.find((a) => a.code === mainAccount.accountCode);

      // Create organization with main cash account
      const { data: orgResponse, error: orgError } = await supabase.rpc("create_organization_with_template", {
        p_organization_name: businessData.organizationName,
        p_business_type: businessData.businessType,
        p_books_start_date: businessData.booksStartDate,
        p_default_cash_account_name: mainAccountInfo?.name || "Kas",
        p_opening_cash_balance: mainAccount.openingBalance,
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
      setStep(3);
    } catch (err) {
      console.error("Error creating organization:", err);
      setError("Terjadi kesalahan, coba lagi");
      setLoading(false);
    }
  };

  if (step === 3) {
    return (
      <div className="min-h-screen bg-cream-100 flex items-center justify-center px-4">
        <div className="w-full max-w-md space-y-6 text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-leaf-100">
            <CheckCircle className="h-10 w-10 text-leaf-600" />
          </div>
          <h1 className="text-3xl font-bold text-wood-800">Siap digunakan!</h1>
          <p className="text-wood-600">
            Akun bisnis Anda sudah dibuat. Sekarang Anda bisa mulai mencatat transaksi.
          </p>
          <Button fullWidth size="lg" onClick={() => navigate("/dashboard")}>
            Masuk ke Dashboard
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream-100 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-lg space-y-6">
        {/* Header */}
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-leaf-500">
            <BookOpen className="h-6 w-6 text-white" />
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
                  ? "bg-leaf-500 text-white"
                  : "bg-cream-200 text-wood-400"
              }`}>
                {step > s.number ? (
                  <CheckCircle className="h-4 w-4" />
                ) : (
                  s.number
                )}
              </div>
              {s.number < 3 && (
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
          <Card>
            <CardContent className="p-6">
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

                <Select
                  label="Jenis Bisnis"
                  {...businessForm.register("businessType")}
                  options={[
                    { value: "simple_trading", label: "Jual Beli Barang" },
                    { value: "service", label: "Penyedia Jasa" },
                  ]}
                  error={businessForm.formState.errors.businessType?.message}
                />

                <div>
                  <Input
                    label="Tanggal Mulai Pencatatan"
                    type="date"
                    {...businessForm.register("booksStartDate")}
                  />
                  <p className="mt-1 text-xs text-wood-400 flex items-center gap-1">
                    <Info className="h-3 w-3" />
                    Tanggal mulai pencatatan adalah hari pertama Anda mulai mencatat keuangan bisnis di Ledjer. Saldo awal akan dihitung mulai dari tanggal ini.
                  </p>
                </div>

                <Button type="submit" fullWidth>
                  Selanjutnya
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Cash Setup */}
        {step === 2 && (
          <Card>
            <CardContent className="p-6">
              <form onSubmit={cashForm.handleSubmit(onCashSubmit)} className="space-y-4">
                <div>
                  <h2 className="text-lg font-semibold text-wood-800">Atur Saldo</h2>
                  <p className="text-sm text-wood-500">Tentukan saldo awal kas dan/atau rekening bank Anda</p>
                </div>

                <div className="space-y-3">
                  {fields.map((field, index) => {
                    const selectedCode = cashForm.watch(`accounts.${index}.accountCode`);
                    const accountInfo = CASH_ACCOUNTS.find((a) => a.code === selectedCode);

                    return (
                      <div key={field.id} className="p-4 rounded-lg border border-wood-200 bg-cream-50 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-wood-700">
                            {accountInfo?.name || `Akun ${index + 1}`}
                          </span>
                          {fields.length > 1 && (
                            <button
                              type="button"
                              onClick={() => remove(index)}
                              className="p-1 text-wood-400 hover:text-error transition-colors"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>

                        <Select
                          label="Pilih Akun"
                          {...cashForm.register(`accounts.${index}.accountCode`)}
                          options={CASH_ACCOUNTS.map((a) => ({
                            value: a.code,
                            label: `${a.name} (${a.type === "cash" ? "Kas" : "Bank"})`,
                          }))}
                        />

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

                {getAvailableAccounts().length > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    fullWidth
                    onClick={() => {
                      const available = getAvailableAccounts();
                      if (available.length > 0) {
                        append({ accountCode: available[0].code, openingBalance: 0 });
                      }
                    }}
                    className="gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    Tambah Akun Lain
                  </Button>
                )}

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
