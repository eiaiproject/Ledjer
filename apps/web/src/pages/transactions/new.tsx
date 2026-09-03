import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod/v3";
import { zodResolver } from "@hookform/resolvers/zod";
import { useOrganization } from "@/hooks/useOrganization";
import { listAccounts, type Account } from "@/lib/api/accounts";
import { postTransaction, type TransactionType } from "@/lib/api/transactions";
import { queryKeys, invalidateTransactionFinancialCaches } from "@/lib/query-keys";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Callout } from "@/components/ui/callout";
import { toast } from "@/components/ui/toast";
import { cn, createClientToken, formatDateInputValue, parseAmountInput } from "@/lib/utils";
import { translateError } from "@/lib/errors";
import { TRANSACTION_TYPES, labelForTransactionType, counterAccountLabel, cashAccountLabel } from "@/lib/transactions";

const transactionSchema = z.object({
  transactionType: z.enum(["cash_in", "cash_out", "transfer", "owner_deposit", "owner_withdrawal"]),
  transactionDate: z.string().min(1, "Tanggal wajib diisi"),
  cashAccountId: z.string().min(1, "Pilih akun kas/bank"),
  counterAccountId: z.string().min(1, "Pilih akun lawan"),
  amountIdr: z.string().min(1, "Nominal wajib diisi"),
  description: z.string().min(1, "Keterangan wajib diisi").max(200, "Maksimal 200 karakter"),
});

type TransactionForm = z.infer<typeof transactionSchema>;

export function NewTransactionPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: orgData } = useOrganization();
  const orgId = orgData?.organization?.id;

  const accountsQuery = useQuery({
    queryKey: queryKeys.accounts.fullList(orgId ?? ""),
    queryFn: async () => {
      if (!orgId) throw new Error("No organization");
      return listAccounts({ includeInactive: false });
    },
    enabled: !!orgId,
  });

  const idempotencyKeyRef = useRef(createClientToken());

  const [selectedType, setSelectedType] = useState<TransactionType>("cash_in");

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<TransactionForm>({
    resolver: zodResolver(transactionSchema),
    defaultValues: {
      transactionType: "cash_in",
      transactionDate: formatDateInputValue(),
      cashAccountId: "",
      counterAccountId: "",
      amountIdr: "",
      description: "",
    },
  });

  const watchType = watch("transactionType");
  const watchCashAccountId = watch("cashAccountId");

  useEffect(() => {
    setSelectedType(watchType);
    // Reset counter account when type changes (its options change).
    setValue("counterAccountId", "");
  }, [watchType, setValue]);

  const accounts = useMemo(() => accountsQuery.data ?? [], [accountsQuery.data]);

  const cashBankAccounts = useMemo(
    () => accounts.filter((a) => a.account_subtype === "cash" || a.account_subtype === "bank"),
    [accounts],
  );
  const incomeAccounts = useMemo(
    () => accounts.filter((a) => a.account_class === "income"),
    [accounts],
  );
  const expenseAccounts = useMemo(
    () => accounts.filter((a) => a.account_class === "expense"),
    [accounts],
  );
  const equityAccounts = useMemo(
    () => accounts.filter((a) => a.account_class === "equity"),
    [accounts],
  );

  const counterOptions = useMemo(() => {
    switch (selectedType) {
      case "cash_in":
        return incomeAccounts;
      case "cash_out":
        return expenseAccounts;
      case "transfer":
        return cashBankAccounts.filter((a) => a.id !== watchCashAccountId);
      case "owner_deposit":
      case "owner_withdrawal":
        return equityAccounts;
    }
  }, [selectedType, incomeAccounts, expenseAccounts, equityAccounts, cashBankAccounts, watchCashAccountId]);

  const onSubmit = async (data: TransactionForm) => {
    if (!orgId) return;
    const amount = parseAmountInput(data.amountIdr);
    if (!amount || amount <= 0) {
      toast.error("Nominal harus lebih dari 0.");
      return;
    }
    try {
      const result = await postTransaction({
        transactionType: data.transactionType,
        transactionDate: data.transactionDate,
        cashAccountId: data.cashAccountId,
        counterAccountId: data.counterAccountId,
        amountIdr: amount,
        description: data.description.trim(),
        idempotencyKey: idempotencyKeyRef.current,
      });
      invalidateTransactionFinancialCaches(queryClient, orgId);
      toast.success(result.replayed ? "Transaksi sudah tercatat sebelumnya." : "Transaksi berhasil dicatat.");
      navigate(`/transactions/${result.transaction_id}`);
    } catch (err) {
      toast.error(translateError(err));
    }
  };

  const accountOptions = (items: Account[]) =>
    items.map((account) => ({
      value: account.id,
      label: `${account.code} · ${account.name}`,
    }));

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader
        title="Transaksi Baru"
        description="Catat uang masuk, uang keluar, transfer, modal masuk, atau pengambilan pemilik."
      />

      {accountsQuery.isError && (
        <Callout variant="error">Gagal memuat daftar akun. Muat ulang halaman dan coba lagi.</Callout>
      )}

      <Card elevated>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Select
              label="Jenis Transaksi"
              required
              error={errors.transactionType?.message}
              placeholder="Pilih jenis transaksi"
              options={TRANSACTION_TYPES.map((type) => ({
                value: type,
                label: labelForTransactionType(type),
              }))}
              {...register("transactionType")}
            />

            <Input
              label="Tanggal"
              type="date"
              required
              error={errors.transactionDate?.message}
              {...register("transactionDate")}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                label={cashAccountLabel(selectedType)}
                required
                error={errors.cashAccountId?.message}
                placeholder="Pilih akun"
                options={accountOptions(cashBankAccounts)}
                {...register("cashAccountId")}
              />
              <Select
                label={counterAccountLabel(selectedType)}
                required
                error={errors.counterAccountId?.message}
                placeholder="Pilih akun"
                options={accountOptions(counterOptions)}
                {...register("counterAccountId")}
              />
            </div>

            <Input
              label="Nominal (Rp)"
              isCurrency
              required
              inputMode="numeric"
              placeholder="0"
              error={errors.amountIdr?.message}
              {...register("amountIdr")}
            />

            <Input
              label="Keterangan"
              required
              error={errors.description?.message}
              placeholder="Contoh: Penjualan tunai 3 Mei"
              {...register("description")}
            />

            <div className={cn("flex items-center justify-end gap-2 pt-2")}>
              <Button type="button" variant="secondary" onClick={() => navigate("/transactions")}>
                Batal
              </Button>
              <Button type="submit" loading={isSubmitting} disabled={!orgId || accountsQuery.isLoading}>
                Simpan Transaksi
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}