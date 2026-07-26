import { useRef, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useOrganization, useOrgPermissions } from "@/hooks/useOrganization";
import { queryKeys, invalidateTransactionFinancialCaches } from "@/lib/query-keys";
import { formatIDR, formatShortDate, createClientToken } from "@/lib/utils";
import {
  PAYMENT_STATUS_LABELS,
  TRANSACTION_LABELS,
  usesCategory,
  statusVariant,
  statusLabel,
} from "@/lib/transactions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ErrorState } from "@/components/ui/error-state";
import { AttachmentSection } from "@/components/attachment-section";
import { PageSpinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";
import { translateError } from "@/lib/errors";
import { ChevronDown, ChevronRight } from "reicon-react";
import {
  getTransaction,
  listTransactionJournal,
  voidTransaction,
  settleTransaction,
} from "@/lib/api/transactions";
import { listCashBankAccounts } from "@/lib/api/accounts";

export function TransactionDetailPage() { // NOSONAR typescript:S3776 — page component with void/settle/journal UIs; readability over complexity
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { data: orgData } = useOrganization();
  const { canViewReports, canVoidTransaction } = useOrgPermissions();
  const [showVoidForm, setShowVoidForm] = useState(false);
  const [showSettleForm, setShowSettleForm] = useState(false);
  const [settleCashAccountId, setSettleCashAccountId] = useState("");
  const [voidReason, setVoidReason] = useState("");
  const [showJournal, setShowJournal] = useState(false);
  const [voidSuccessId, setVoidSuccessId] = useState<string | null>(null);
  const voidTokenRef = useRef(createClientToken());
  const navigate = useNavigate();

  // P1.3: Allow any member with transaction access to view business details.
  // Journal lines are separately gated by RLS (can_view_reports policy).
  const { data: transaction, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.transactions.detail(id!),
    queryFn: async () => {
      if (!id || !orgData?.organization?.id) return null;
      return getTransaction(id);
    },
    enabled: !!id && !!orgData?.organization?.id && canViewReports,
  });

  const { data: journalEntries, error: journalError, refetch: refetchJournal } = useQuery({
    queryKey: queryKeys.journalEntries.detail(id!),
    queryFn: async () => {
      if (!id || !orgData?.organization?.id) return [];
      return listTransactionJournal(id);
    },
    enabled: !!id && !!orgData?.organization?.id,
  });

  const { data: cashAccounts } = useQuery({
    queryKey: ["cash-bank-accounts"],
    queryFn: listCashBankAccounts,
    enabled: !!orgData?.organization?.id,
  });

  const voidMutation = useMutation({
    mutationFn: async () => {
      if (!id || !orgData?.organization?.id) throw new Error("Missing data");
      return voidTransaction(id, voidReason, voidTokenRef.current);
    },
    onSuccess: (result) => {
      voidTokenRef.current = createClientToken();
      setVoidSuccessId(result.reversal_transaction_id);
      queryClient.invalidateQueries({ queryKey: queryKeys.transactions.detail(id!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.journalEntries.detail(id!) });
      // P1.5: void reverses stock, COGS, balances → invalidate everything
      invalidateTransactionFinancialCaches(queryClient, orgData?.organization?.id);
      setShowVoidForm(false);
    },
    onError: (err) => toast.error(translateError(err)),
  });

  const settleMutation = useMutation({
    mutationFn: async (cashAccountId: string) => {
      if (!id || !orgData?.organization?.id) throw new Error("Missing data");
      return settleTransaction(id, cashAccountId, voidTokenRef.current);
    },
    onSuccess: (result) => {
      voidTokenRef.current = createClientToken();
      queryClient.invalidateQueries({ queryKey: queryKeys.transactions.detail(id!) });
      invalidateTransactionFinancialCaches(queryClient, orgData?.organization?.id);
      toast.success(`Sisa tagihan dilunasi: ${result.settle_transaction_number}`);
      setShowSettleForm(false);
      setSettleCashAccountId("");
    },
    onError: (err) => toast.error(translateError(err)),
  });

  // P1.3: No longer block entire page for non-report users.
  // Journal lines section below is separately gated by canViewReports.

  if (isLoading) {
    return <PageSpinner />;
  }

  if (error) return <ErrorState error={error} onRetry={refetch} />;

  if (!transaction) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 text-center">
        <p className="break-words text-wood-500">Transaksi tidak ditemukan</p>
        <Link to="/transactions" className="mt-2 inline-flex h-11 items-center text-sm text-wood-600 hover:text-wood-500">
          ← Kembali ke daftar
        </Link>
      </div>
    );
  }

  const voidSection = transaction.status === "posted" && canVoidTransaction ? (
    <div className="mt-4">
      {!showVoidForm && !voidSuccessId ? (
        <Button
          type="button"
          variant="outline"
          onClick={() => setShowVoidForm(true)}
          className="border-error-border text-error hover:bg-error-bg"
        >
          Batalkan Transaksi
        </Button>
      ) : !voidSuccessId ? ( // NOSONAR typescript:S3358 — nested ternary for void form states
        <div className="rounded-lg border border-error/30 bg-error/10 p-4">
          <h3 className="text-sm font-medium text-error">Pembatalan Transaksi</h3>
          <p className="mt-1 text-xs text-error">
            Transaksi akan dibalik dengan jurnal reversal. Data tidak akan dihapus.
          </p>
          <Textarea
            label="Alasan pembatalan"
            value={voidReason}
            onChange={(e) => setVoidReason(e.target.value)}
            containerClassName="mt-2"
            placeholder="Alasan pembatalan..."
            rows={2}
            error={voidReason.trim().length > 0 && voidReason.trim().length < 5 ? "Alasan minimal 5 karakter." : undefined}
          />
          <div className="mt-3 flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowVoidForm(false)}
            >
              Batal
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={() => voidMutation.mutate()}
              disabled={voidReason.trim().length < 5 || voidMutation.isPending}
              loading={voidMutation.isPending}
            >
              Batalkan
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-leaf-200 bg-leaf-50 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-leaf-700">
            <svg className="h-5 w-5 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
            </svg>
            Transaksi berhasil dibatalkan
          </div>
          <p className="mt-1 text-xs text-leaf-600">
            Jurnal reversal dan stok telah dikembalikan seperti sebelum transaksi.
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              type="button"
              variant="primary"
              onClick={() => navigate(`/transactions/new?replace=${id}&type=${transaction.transaction_type}&amount=${transaction.amount}&desc=${encodeURIComponent(transaction.description || "Pengganti " + transaction.transaction_number)}`)}
            >
              Buat Transaksi Pengganti
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setVoidSuccessId(null)}
            >
              Tutup
            </Button>
          </div>
        </div>
      )}
    </div>
  ) : null;

  return (
    <div className="ledger-page mx-auto max-w-3xl px-4 py-8">
      <Link to="/transactions" className="mb-4 flex h-11 items-center text-sm text-wood-600 hover:text-wood-500">
        ← Kembali
      </Link>

      <div className="mb-6 flex min-w-0 items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="break-words text-2xl font-bold text-text-primary">
            {TRANSACTION_LABELS[transaction.transaction_type] || transaction.transaction_type}
          </h1>
          <p className="mt-1 break-words font-mono text-sm text-wood-500">{transaction.transaction_number}</p>
        </div>
        <Badge variant={statusVariant(transaction.status)} size="md" className="shrink-0">
          {statusLabel(transaction.status)}
        </Badge>
      </div>

      {/* Transaction Details */}
      <div className="rounded-lg border border-wood-200 bg-cream-50 p-6">
        <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-wood-500">Tanggal</dt>
            <dd className="mt-1 font-medium">{formatShortDate(transaction.transaction_date)}</dd>
          </div>
          <div>
            <dt className="text-wood-500">Nominal</dt>
            <dd className="mt-1 text-lg font-bold text-wood-600">{formatIDR(Number(transaction.amount))}</dd>
          </div>
          {transaction.parties && (
            <div>
              <dt className="text-wood-500">Pihak</dt>
              <dd className="mt-1 break-words font-medium">{transaction.parties.name}</dd>
            </div>
          )}
          <div>
            <dt className="text-wood-500">Pembayaran</dt>
            <dd className="mt-1 font-medium">
              {PAYMENT_STATUS_LABELS[transaction.payment_status as keyof typeof PAYMENT_STATUS_LABELS] || transaction.payment_status}
            </dd>
          </div>
          {usesCategory(transaction.transaction_type) && transaction.category_name && (
            <div>
              <dt className="text-wood-500">Kategori</dt>
              <dd className="mt-1 break-words font-medium">{transaction.category_name}</dd>
            </div>
          )}
          {transaction.due_date && (
            <div>
              <dt className="text-wood-500">Jatuh Tempo</dt>
              <dd className="mt-1 font-medium">{formatShortDate(transaction.due_date)}</dd>
            </div>
          )}
          <div className="sm:col-span-2">
            <dt className="text-wood-500">Deskripsi</dt>
            <dd className="mt-1 break-words">{transaction.description || "-"}</dd>
          </div>
          {transaction.notes && (
            <div className="sm:col-span-2">
              <dt className="text-wood-500">Catatan</dt>
              <dd className="mt-1 break-words">{transaction.notes}</dd>
            </div>
          )}
            <div>
              <dt className="text-wood-500">Dibuat oleh</dt>
              <dd className="mt-1 break-words">{transaction.created_by_profile?.full_name || "-"}</dd>
            </div>
          <div>
            <dt className="text-wood-500">Diposting</dt>
            <dd className="mt-1">{transaction.posted_at ? formatShortDate(transaction.posted_at) : "-"}</dd>
          </div>
        </dl>
      </div>

      {/* Settle Section — for partially paid credit transactions */}
      {transaction.status === "posted" && (transaction.transaction_type === "credit_sale" || transaction.transaction_type === "credit_purchase") && transaction.payment_status === "partial" && (
        <div className="mt-4">
          {!showSettleForm ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowSettleForm(true)}
              className="border-leaf-400 text-leaf-700 hover:bg-leaf-50"
            >
              Lunasi Sisa Tagihan
            </Button>
          ) : (
            <div className="rounded-lg border border-leaf-200 bg-leaf-50 p-4">
              <h3 className="text-sm font-medium text-leaf-700">Lunasi Sisa Tagihan</h3>
              <p className="mt-1 text-xs text-leaf-600">
                Catat pelunasan sisa tagihan transaksi ini. Setelah dilunasi, transaksi dapat dibatalkan jika diperlukan.
              </p>
              <div className="mt-3">
                <select
                  value={settleCashAccountId}
                  onChange={(e) => setSettleCashAccountId(e.target.value)}
                  className="h-11 min-h-[44px] w-full rounded-md border border-wood-200 bg-surface px-3 text-sm text-text-primary focus:outline-2 focus:outline-offset-2 focus:outline-wood-500 sm:h-10 sm:min-h-0"
                  aria-label="Pilih akun kas/bank"
                >
                  <option value="">Pilih akun kas/bank...</option>
                  {cashAccounts?.map((acct) => (
                    <option key={acct.id} value={acct.id}>
                      {acct.code} — {acct.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mt-3 flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => { setShowSettleForm(false); setSettleCashAccountId(""); }}
                >
                  Batal
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => settleMutation.mutate(settleCashAccountId)}
                  disabled={!settleCashAccountId || settleMutation.isPending}
                  loading={settleMutation.isPending}
                >
                  Lunasi
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Void Section */}
      {voidSection}

      {/* Journal Entries */}
      {canViewReports && journalError && (
        <div className="mt-6">
          <ErrorState error={journalError} onRetry={refetchJournal} />
        </div>
      )}

      {canViewReports && !journalError && journalEntries && journalEntries.length > 0 && (
        <div className="mt-6">
          <Button
            type="button"
            variant="link"
            onClick={() => setShowJournal(!showJournal)}
            className="flex items-center gap-2 text-sm font-medium text-wood-600 hover:text-wood-500"
            aria-expanded={showJournal}
          >
            {showJournal ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            Lihat jurnal akuntansi
          </Button>
          {showJournal && (
            <div className="mt-3 space-y-3">
              {journalEntries.map((je) => (
                <div key={je.id} className="rounded-lg border border-wood-200 bg-cream-50 p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-mono text-xs text-wood-500">{je.entry_number}</span>
                    <Badge variant={statusVariant(je.status)}>{statusLabel(je.status)}</Badge>
                  </div>
                  <div className="ledger-scroll-x">
                  <table className="min-w-0 sm:min-w-[560px] w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-wood-500">
                        <th className="pb-1">Akun</th>
                        <th className="pb-1 text-right">Debit</th>
                        <th className="pb-1 text-right">Kredit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {je.journal_lines.map((line) => (
                        <tr key={line.id} className="border-b border-wood-50">
                          <td className="sm:max-w-[280px] break-words py-1.5">
                            <span className="font-mono text-xs text-wood-500">{line.accounts?.code}</span>{" "}
                            {line.accounts?.name}
                          </td>
                          <td className="py-1.5 text-right">
                            {Number(line.debit) > 0 ? formatIDR(Number(line.debit)) : ""}
                          </td>
                          <td className="py-1.5 text-right">
                            {Number(line.credit) > 0 ? formatIDR(Number(line.credit)) : ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Attachments */}
      {transaction && (
        <div className="mt-8">
          <AttachmentSection entityType="transaction" entityId={transaction.id} />
        </div>
      )}
    </div>
  );
}
