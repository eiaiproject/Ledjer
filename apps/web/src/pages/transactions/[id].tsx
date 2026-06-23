import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useOrganization, useOrgPermissions } from "@/hooks/useOrganization";
import { formatIDR, formatShortDate } from "@/lib/utils";
import { fetchProfilesByUserIds } from "@/lib/profiles";
import {
  PAYMENT_STATUS_LABELS,
  TRANSACTION_TYPE_LABELS,
  usesCategory,
} from "@/lib/transactions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ErrorState } from "@/components/ui/error-state";
import { PageSpinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast-api";
import { translateError } from "@/lib/errors";
import { ChevronDown, ChevronRight } from "lucide-react";

interface TransactionDetail {
  id: string;
  transaction_number: string;
  transaction_date: string;
  transaction_type: string;
  amount: number;
  category_name: string | null;
  description: string;
  notes: string | null;
  status: string;
  payment_status: string;
  due_date: string | null;
  posted_at: string;
  voided_at: string | null;
  void_reason: string | null;
  created_by: string;
  parties?: { name: string };
}

interface JournalLine {
  id: string;
  account_id: string;
  debit: number;
  credit: number;
  description: string;
  accounts?: { code: number; name: string };
}

interface JournalEntry {
  id: string;
  entry_number: string;
  entry_date: string;
  entry_type: string;
  description: string;
  status: string;
  journal_lines: JournalLine[];
}

function statusVariant(status: string): "success" | "warning" | "error" | "neutral" {
  if (status === "posted") return "success";
  if (status === "voided") return "error";
  if (status === "reversed") return "warning";
  return "neutral";
}

function statusLabel(status: string) {
  if (status === "posted") return "Posted";
  if (status === "voided") return "Dibatalkan";
  if (status === "reversed") return "Reversal";
  return status;
}

export function TransactionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { data: orgData } = useOrganization();
  const { canViewReports, canVoidTransaction } = useOrgPermissions();
  const [showVoidForm, setShowVoidForm] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [showJournal, setShowJournal] = useState(false);

  // P1.3: Allow any member with transaction access to view business details.
  // Journal lines are separately gated by RLS (can_view_reports policy).
  const { data: transaction, isLoading, error, refetch } = useQuery({
    queryKey: ["transaction", id],
    queryFn: async () => {
      if (!id || !orgData?.organization?.id) return null;
      const { data, error } = await supabase
        .from("transactions")
        .select(`
          *,
          parties:parties!transactions_party_same_org_fkey(name)
        `)
        .eq("id", id)
        .eq("organization_id", orgData.organization.id)
        .single();
      if (error) throw error;
      return data as unknown as TransactionDetail;
    },
    enabled: !!id && !!orgData?.organization?.id,
  });

  const { data: createdByProfile } = useQuery({
    queryKey: ["profile", transaction?.created_by],
    queryFn: async () => {
      if (!transaction?.created_by) return null;
      const profiles = await fetchProfilesByUserIds([transaction.created_by]);
      return profiles[transaction.created_by] ?? null;
    },
    enabled: !!transaction?.created_by,
  });

  const { data: journalEntries, error: journalError, refetch: refetchJournal } = useQuery({
    queryKey: ["journal-entries", id],
    queryFn: async () => {
      if (!id || !orgData?.organization?.id) return [];
      const { data, error } = await supabase
        .from("journal_entries")
        .select(`
          *,
          journal_lines:journal_lines!journal_lines_entry_same_org_fkey(
            id,
            account_id,
            debit,
            credit,
            description,
            accounts:accounts!journal_lines_account_same_org_fkey(
              code,
              name
            )
          )
        `)
        .eq("transaction_id", id)
        .eq("organization_id", orgData.organization.id)
        .order("created_at");
      if (error) throw error;
      return (data || []) as unknown as JournalEntry[];
    },
    enabled: !!id && !!orgData?.organization?.id,
  });

  const voidMutation = useMutation({
    mutationFn: async () => {
      if (!id || !orgData?.organization?.id) throw new Error("Missing data");
      const { data, error } = await supabase.rpc("void_transaction", {
        p_organization_id: orgData.organization.id,
        p_transaction_id: id,
        p_void_reason: voidReason,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transaction", id] });
      queryClient.invalidateQueries({ queryKey: ["journal-entries", id] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["monthly-usage"] });
      // P1.5: void reverses stock, COGS, balances → invalidate everything
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["parties"] });
      queryClient.invalidateQueries({ queryKey: ["trial-balance"] });
      queryClient.invalidateQueries({ queryKey: ["profit-loss"] });
      queryClient.invalidateQueries({ queryKey: ["balance-sheet"] });
      queryClient.invalidateQueries({ queryKey: ["general-ledger"] });
      setShowVoidForm(false);
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
        <Link to="/transactions" className="mt-2 inline-block text-sm text-wood-600 hover:text-wood-500">
          ← Kembali ke daftar
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link to="/transactions" className="mb-4 inline-block text-sm text-wood-600 hover:text-wood-500">
        ← Kembali
      </Link>

      <div className="mb-6 flex min-w-0 items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="break-words text-2xl font-bold text-text-primary">
            {TRANSACTION_TYPE_LABELS[transaction.transaction_type as keyof typeof TRANSACTION_TYPE_LABELS] || transaction.transaction_type}
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
              <dd className="mt-1 break-words">{createdByProfile?.full_name || "-"}</dd>
            </div>
          <div>
            <dt className="text-wood-500">Diposting</dt>
            <dd className="mt-1">{transaction.posted_at ? formatShortDate(transaction.posted_at) : "-"}</dd>
          </div>
        </dl>
      </div>

      {/* Void Section */}
      {transaction.status === "posted" && canVoidTransaction && (
        <div className="mt-4">
          {!showVoidForm ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowVoidForm(true)}
              className="border-error-border text-error hover:bg-error-bg"
            >
              Batalkan Transaksi
            </Button>
          ) : (
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
          )}
        </div>
      )}

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
                  <div className="overflow-x-auto">
                  <table className="min-w-[560px] w-full text-sm">
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
                          <td className="max-w-[280px] break-words py-1.5">
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
    </div>
  );
}
