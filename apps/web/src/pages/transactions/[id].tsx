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

export function TransactionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { data: orgData } = useOrganization();
  const { canVoidTransaction } = useOrgPermissions();
  const [showVoidForm, setShowVoidForm] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [showJournal, setShowJournal] = useState(false);

  const { data: transaction, isLoading } = useQuery({
    queryKey: ["transaction", id],
    queryFn: async () => {
      if (!id || !orgData?.organization?.id) return null;
      const { data, error } = await supabase
        .from("transactions")
        .select("*, parties(name)")
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

  const { data: journalEntries } = useQuery({
    queryKey: ["journal-entries", id],
    queryFn: async () => {
      if (!id || !orgData?.organization?.id) return [];
      const { data, error } = await supabase
        .from("journal_entries")
        .select("*, journal_lines(*, accounts(code, name))")
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
      setShowVoidForm(false);
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-wood-500 border-t-transparent" />
      </div>
    );
  }

  if (!transaction) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 text-center">
        <p className="text-wood-500">Transaksi tidak ditemukan</p>
        <Link to="/transactions" className="mt-2 text-sm text-wood-600 hover:text-wood-500">
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

      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-wood-900">
            {TRANSACTION_TYPE_LABELS[transaction.transaction_type as keyof typeof TRANSACTION_TYPE_LABELS] || transaction.transaction_type}
          </h1>
          <p className="mt-1 font-mono text-sm text-wood-500">{transaction.transaction_number}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${
          transaction.status === "posted" ? "bg-leaf-100 text-leaf-700" :
          transaction.status === "voided" ? "bg-error/10 text-error" :
          "bg-wood-100 text-wood-800"
        }`}>
          {transaction.status === "posted" ? "Posted" : transaction.status === "voided" ? "Dibatalkan" : transaction.status}
        </span>
      </div>

      {/* Transaction Details */}
      <div className="rounded-lg border border-wood-200 bg-cream-50 p-6">
        <dl className="grid grid-cols-2 gap-4 text-sm">
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
              <dd className="mt-1 font-medium">{transaction.parties.name}</dd>
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
              <dd className="mt-1 font-medium">{transaction.category_name}</dd>
            </div>
          )}
          {transaction.due_date && (
            <div>
              <dt className="text-wood-500">Jatuh Tempo</dt>
              <dd className="mt-1 font-medium">{formatShortDate(transaction.due_date)}</dd>
            </div>
          )}
          <div className="col-span-2">
            <dt className="text-wood-500">Deskripsi</dt>
            <dd className="mt-1">{transaction.description || "-"}</dd>
          </div>
          {transaction.notes && (
            <div className="col-span-2">
              <dt className="text-wood-500">Catatan</dt>
              <dd className="mt-1">{transaction.notes}</dd>
            </div>
          )}
            <div>
              <dt className="text-wood-500">Dibuat oleh</dt>
              <dd className="mt-1">{createdByProfile?.full_name || "-"}</dd>
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
            <button
              onClick={() => setShowVoidForm(true)}
              className="rounded-md border border-error/30 px-4 py-2 text-sm font-medium text-error hover:bg-error/10"
            >
              Batalkan Transaksi
            </button>
          ) : (
            <div className="rounded-lg border border-error/30 bg-error/10 p-4">
              <h3 className="text-sm font-medium text-error">Pembatalan Transaksi</h3>
              <p className="mt-1 text-xs text-error">
                Transaksi akan dibalik dengan jurnal reversal. Data tidak akan dihapus.
              </p>
              <textarea
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                className="mt-2 block w-full rounded-md border border-error/30 bg-cream-50 px-3 py-2 text-sm focus:border-error focus:outline-none focus:ring-1 focus:ring-error"
                placeholder="Alasan pembatalan..."
                rows={2}
              />
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => setShowVoidForm(false)}
                  className="rounded-md border border-wood-300 px-3 py-1.5 text-sm text-wood-700 hover:bg-cream-100"
                >
                  Batal
                </button>
                <button
                  onClick={() => voidMutation.mutate()}
                  disabled={!voidReason || voidMutation.isPending}
                  className="rounded-md bg-error px-3 py-1.5 text-sm font-medium text-cream-50 hover:opacity-90 disabled:opacity-50"
                >
                  {voidMutation.isPending ? "Memproses..." : "Batalkan"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Journal Entries */}
      {journalEntries && journalEntries.length > 0 && (
        <div className="mt-6">
          <button
            onClick={() => setShowJournal(!showJournal)}
            className="flex items-center gap-2 text-sm font-medium text-wood-600 hover:text-wood-500"
          >
            <span>{showJournal ? "▼" : "▶"}</span>
            Lihat jurnal akuntansi
          </button>
          {showJournal && (
            <div className="mt-3 space-y-3">
              {journalEntries.map((je) => (
                <div key={je.id} className="rounded-lg border border-wood-200 bg-cream-50 p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-mono text-xs text-wood-500">{je.entry_number}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${
                      je.status === "posted" ? "bg-leaf-100 text-leaf-700" : "bg-error/10 text-error"
                    }`}>
                      {je.status}
                    </span>
                  </div>
                  <table className="w-full text-sm">
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
                          <td className="py-1.5">
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
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
