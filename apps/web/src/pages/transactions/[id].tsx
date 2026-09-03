import { useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Undo } from "reicon-react";
import { useOrganization } from "@/hooks/useOrganization";
import { getTransaction, voidTransaction } from "@/lib/api/transactions";
import { queryKeys, invalidateTransactionFinancialCaches } from "@/lib/query-keys";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ErrorState } from "@/components/ui/error-state";
import { toast } from "@/components/ui/toast";
import { formatIDR, formatDateLong } from "@/lib/utils";
import { translateError } from "@/lib/errors";
import { labelForTransactionType } from "@/lib/transactions";
import { getStatus } from "@/lib/status-registry";

export function TransactionDetailPage() {
  const { id = "" } = useParams();
  const queryClient = useQueryClient();
  const { data: orgData } = useOrganization();
  const orgId = orgData?.organization?.id;
  const [voidOpen, setVoidOpen] = useState(false);
  const [voiding, setVoiding] = useState(false);

  const query = useQuery({
    queryKey: queryKeys.transactions.detail(id),
    queryFn: async () => {
      if (!id) throw new Error("Missing id");
      return getTransaction(id);
    },
    enabled: !!id,
  });

  const transaction = query.data;

  const handleVoid = async () => {
    if (!transaction || voiding) return;
    setVoiding(true);
    try {
      await voidTransaction(transaction.id, null);
      invalidateTransactionFinancialCaches(queryClient, orgId);
      toast.success("Transaksi berhasil dibatalkan.");
      setVoidOpen(false);
      query.refetch();
    } catch (err) {
      toast.error(translateError(err));
    } finally {
      setVoiding(false);
    }
  };

  const status = transaction ? getStatus("transactions", transaction.status) : null;

  let detailContent: ReactNode = null;
  if (query.isLoading) {
    detailContent = <div className="h-40 animate-pulse rounded-xl bg-wood-100" />;
  } else if (query.isError) {
    detailContent = (
      <ErrorState
        title="Gagal memuat transaksi"
        message="Transaksi tidak ditemukan atau terjadi kesalahan."
        onRetry={() => query.refetch()}
      />
    );
  } else if (transaction && status) {
    detailContent = (
      <>
        <PageHeader
          title={transaction.transaction_number}
          description={`${labelForTransactionType(transaction.transaction_type)} · ${formatDateLong(transaction.transaction_date)}`}
          actions={[
            {
              key: "void",
              children: transaction.status === "posted" ? (
                <Button variant="danger" onClick={() => setVoidOpen(true)}>
                  <Undo className="h-4 w-4" />
                  Batalkan Transaksi
                </Button>
              ) : (
                <Badge variant={status.variant} size="md">
                  {status.label}
                </Badge>
              ),
            },
          ]}
        />

        {transaction.void_reason && (
          <Card className="border-clay-200">
            <CardContent className="p-4">
              <p className="text-sm text-clay-700">
                Alasan pembatalan: {transaction.void_reason}
              </p>
            </CardContent>
          </Card>
        )}

        <Card elevated>
          <dl className="divide-y divide-wood-100">
            <DetailRow label="Keterangan" value={transaction.description} />
            <DetailRow label="Nominal" value={formatIDR(transaction.amount_idr)} mono />
            <DetailRow label="Kas/Bank" value={transaction.cash_bank_account ?? "-"} />
            <DetailRow label="Akun Lawan" value={transaction.counter_account ?? "-"} />
            <DetailRow label="Status" value={status.label} />
            {transaction.voided_at ? (
              <DetailRow label="Dibatalkan pada" value={formatDateLong(new Date(transaction.voided_at))} />
            ) : null}
          </dl>
        </Card>
      </>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link
        to="/transactions"
        className="inline-flex min-h-[44px] items-center gap-2 text-sm font-medium text-wood-600 hover:text-wood-800"
      >
        <ArrowLeft className="h-4 w-4" />
        Kembali ke Transaksi
      </Link>

      {detailContent}

      <ConfirmDialog
        open={voidOpen}
        onClose={() => setVoidOpen(false)}
        onConfirm={handleVoid}
        loading={voiding}
        title="Batalkan transaksi?"
        message="Transaksi akan ditandai batal. Saldo dan laporan akan disesuaikan otomatis. Tindakan ini tidak dapat dibatalkan."
        confirmLabel="Ya, Batalkan"
      />
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 py-3">
      <dt className="shrink-0 text-sm text-text-secondary">{label}</dt>
      <dd className={`min-w-0 break-words text-right text-sm font-medium text-text-primary ${mono ? "num-mono" : ""}`}>
        {value}
      </dd>
    </div>
  );
}