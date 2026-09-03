import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Download, Plus } from "reicon-react";
import { useOrganization } from "@/hooks/useOrganization";
import { listTransactions, type Transaction } from "@/lib/api/transactions";
import { downloadTransactionsCsv } from "@/lib/api/exports";
import { queryKeys } from "@/lib/query-keys";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { toast } from "@/components/ui/toast";
import { formatIDR, formatShortDate } from "@/lib/utils";
import { labelForTransactionType, directionSign, TRANSACTION_TYPES } from "@/lib/transactions";
import { getStatus } from "@/lib/status-registry";

const PAGE_SIZE = 25;

export function TransactionListPage() {
  const { data: orgData } = useOrganization();
  const orgId = orgData?.organization?.id;

  const [search, setSearch] = useState("");
  const [transactionType, setTransactionType] = useState("");
  const [status, setStatus] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [offset, setOffset] = useState(0);
  const [exporting, setExporting] = useState(false);

  const filters = useMemo(
    () => ({
      search: search || undefined,
      transactionType: transactionType || undefined,
      status: status || undefined,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
      limit: PAGE_SIZE,
      offset,
    }),
    [search, transactionType, status, fromDate, toDate, offset],
  );

  const query = useQuery({
    queryKey: queryKeys.transactions.list(orgId, filters),
    queryFn: async () => {
      if (!orgId) throw new Error("No organization");
      return listTransactions(filters);
    },
    enabled: !!orgId,
  });

  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      await downloadTransactionsCsv(filters);
      toast.success("Export CSV berhasil diunduh.");
    } catch {
      toast.error("Gagal mengunduh CSV. Coba lagi.");
    } finally {
      setExporting(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil((query.data?.total ?? 0) / PAGE_SIZE));
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  let rowsContent: ReactNode;
  if (query.isLoading) {
    rowsContent = (
      <div className="space-y-3 p-5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-12 animate-pulse rounded-md bg-wood-100" />
        ))}
      </div>
    );
  } else if (query.isError) {
    rowsContent = (
      <ErrorState
        title="Gagal memuat transaksi"
        message="Terjadi kesalahan saat mengambil daftar transaksi."
        onRetry={() => query.refetch()}
      />
    );
  } else if (query.data && query.data.transactions.length > 0) {
    rowsContent = (
      <ul className="divide-y divide-wood-100">
        {query.data.transactions.map((transaction) => (
          <TransactionRow key={transaction.id} transaction={transaction} />
        ))}
      </ul>
    );
  } else {
    rowsContent = (
      <EmptyState
        title="Tidak ada transaksi"
        description="Belum ada transaksi yang cocok dengan filter ini."
        action={
          <Link to="/transactions/new">
            <Button>Catat Transaksi</Button>
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Transaksi"
        description="Semua catatan uang masuk dan keluar."
        actions={[
          {
            key: "export",
            children: (
              <Button variant="secondary" onClick={handleExport} loading={exporting}>
                <Download className="h-4 w-4" />
                Export CSV
              </Button>
            ),
          },
          {
            key: "new",
            children: (
              <Link to="/transactions/new">
                <Button>
                  <Plus className="h-4 w-4" />
                  Transaksi Baru
                </Button>
              </Link>
            ),
          },
        ]}
      />

      <Card elevated>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
          <Input
            label="Cari"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setOffset(0);
            }}
            placeholder="Keterangan atau nomor transaksi"
            className="lg:col-span-2"
          />
          <Select
            label="Jenis"
            value={transactionType}
            onChange={(e) => {
              setTransactionType(e.target.value);
              setOffset(0);
            }}
            placeholder="Semua jenis"
            options={TRANSACTION_TYPES.map((type) => ({
              value: type,
              label: labelForTransactionType(type),
            }))}
          />
          <Select
            label="Status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setOffset(0);
            }}
            placeholder="Semua status"
            options={[
              { value: "posted", label: "Posted" },
              { value: "voided", label: "Dibatalkan" },
            ]}
          />
          <div className="grid grid-cols-2 gap-2">
            <Input label="Dari" type="date" value={fromDate} onChange={(e) => { setFromDate(e.target.value); setOffset(0); }} />
            <Input label="Sampai" type="date" value={toDate} onChange={(e) => { setToDate(e.target.value); setOffset(0); }} />
          </div>
        </CardContent>
      </Card>

      <Card elevated>
        <CardContent className="p-0">{rowsContent}</CardContent>
      </Card>

      {query.data && query.data.total > PAGE_SIZE && (
        <nav aria-label="Navigasi halaman" className="flex items-center justify-between gap-4">
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage <= 1}
            onClick={() => setOffset((currentPage - 2) * PAGE_SIZE)}
          >
            Sebelumnya
          </Button>
          <p className="text-sm text-text-secondary">
            Halaman {currentPage} dari {totalPages}
          </p>
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage >= totalPages}
            onClick={() => setOffset(currentPage * PAGE_SIZE)}
          >
            Berikutnya
          </Button>
        </nav>
      )}
    </div>
  );
}

function TransactionRow({ transaction }: { readonly transaction: Transaction }) {
  const status = getStatus("transactions", transaction.status);
  const isNegative = transaction.direction === "out";

  return (
    <li>
      <Link
        to={`/transactions/${transaction.id}`}
        className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-cream-100 sm:px-5"
      >
        <div className="min-w-0">
          <p className="break-words text-sm font-medium text-text-primary">{transaction.description}</p>
          <p className="mt-0.5 text-xs text-text-tertiary">
            {transaction.transaction_number} · {formatShortDate(transaction.transaction_date)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <p
            className={`num-mono text-sm font-semibold ${
              isNegative ? "text-clay-700" : "text-leaf-700"
            }`}
          >
            {directionSign(transaction.direction)} {formatIDR(transaction.amount_idr)}
          </p>
          <Badge variant={status.variant} size="sm">
            {status.label}
          </Badge>
        </div>
      </Link>
    </li>
  );
}