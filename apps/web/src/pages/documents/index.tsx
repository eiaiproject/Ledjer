import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { listDocuments, type DocumentType, type DocumentOutput } from "@/lib/api/documents";
import { useOrganization } from "@/hooks/useOrganization";
import { queryKeys } from "@/lib/query-keys";
import { EmptyState } from "@/components/ui/empty-state";
import { FileText, Plus, Search } from "reicon-react";
import { Badge } from "@/components/ui/badge";
import { getStatus } from "@/lib/status-registry";
import { PageShell } from "@/components/ui/page-shell";

const DOCUMENT_TYPES: { value: DocumentType | ""; label: string }[] = [
  { value: "", label: "Semua" },
  { value: "quotation", label: "Penawaran" },
  { value: "purchase_order", label: "PO" },
  { value: "delivery_note", label: "Surat Jalan" },
  { value: "payment_receipt", label: "Tanda Terima" },
  { value: "cash_receipt", label: "Kas Masuk" },
  { value: "cash_payment_voucher", label: "Kas Keluar" },
  { value: "return_note", label: "Retur" },
];

const DOCUMENT_LABELS: Record<string, string> = {
  quotation: "Penawaran Harga",
  purchase_order: "Pesanan Pembelian",
  delivery_note: "Surat Jalan",
  payment_receipt: "Tanda Terima Pembayaran",
  cash_receipt: "Bukti Kas Masuk",
  cash_payment_voucher: "Bukti Kas Keluar",
  return_note: "Nota Retur",
};



const TYPE_COLORS: Record<string, string> = {
  quotation: "border-l-blue-400",
  purchase_order: "border-l-amber-400",
  delivery_note: "border-l-green-400",
  payment_receipt: "border-l-emerald-400",
  cash_receipt: "border-l-teal-400",
  cash_payment_voucher: "border-l-orange-400",
  return_note: "border-l-red-400",
};

const TYPE_ICON_COLORS: Record<string, string> = {
  quotation: "text-blue-500 bg-blue-50",
  purchase_order: "text-amber-500 bg-amber-50",
  delivery_note: "text-green-500 bg-green-50",
  payment_receipt: "text-emerald-500 bg-emerald-50",
  cash_receipt: "text-teal-500 bg-teal-50",
  cash_payment_voucher: "text-orange-500 bg-orange-50",
  return_note: "text-red-500 bg-red-50",
};

function formatRupiah(n: number): string {
  return `Rp ${(n / 100).toLocaleString("id-ID")}`;
}

export function DocumentsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: orgData } = useOrganization();
  const orgId = orgData?.organization?.id;
  const activeType = (searchParams.get("type") as DocumentType) || "";
  const [search, setSearch] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: [...queryKeys.documents.list(activeType || undefined), orgId],
    queryFn: () => listDocuments(activeType || undefined),
    enabled: !!orgId,
  });

  const filtered = (data?.documents ?? []).filter((doc) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      doc.documentNumber.toLowerCase().includes(q) ||
      doc.partyId?.toLowerCase().includes(q) ||
      doc.lines.some((l) => l.description.toLowerCase().includes(q))
    );
  });

  let content;
  if (isLoading) {
    content = (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-wood-100" />
        ))}
      </div>
    );
  } else if (error) {
    content = (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-sm text-red-600">Gagal memuat dokumen. Silakan coba lagi.</p>
      </div>
    );
  } else if (filtered.length === 0) {
    content = (
      <EmptyState
        icon={<FileText className="h-8 w-8" />}
        title={search ? "Tidak ada hasil" : "Belum ada dokumen"}
        description={
          search
            ? `Tidak ditemukan dokumen dengan kata kunci "${search}"`
            : "Buat dokumen pertama Anda untuk memulai."
        }
        action={{ label: "Buat Dokumen", onClick: () => navigate("/documents/new") }}
      />
    );
  } else {
    content = (
      <div className="space-y-2">
        {filtered.map((doc) => (
          <DocumentCard key={doc.id} doc={doc} />
        ))}
      </div>
    );
  }

  return (
    <PageShell
      header={{
        title: "Dokumen Bisnis",
        description: "Kelola penawaran, pesanan, surat jalan, dan bukti pembayaran",
        actions: [{ key: "create", children: (
          <Link
            to="/documents/new"
            className="inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2.5 text-sm font-medium text-white transition-all hover:bg-ink/90 focus:outline-none focus:ring-2 focus:ring-ink/30"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Buat Dokumen
          </Link>
        ) }],
      }}
    >


      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {/* Type filter */}
        <div className="flex flex-wrap gap-1.5">
          {DOCUMENT_TYPES.map((t) => (
            <button type="button"
              key={t.value}
              onClick={() => {
                const params = new URLSearchParams(searchParams);
                if (t.value) params.set("type", t.value);
                else params.delete("type");
                setSearchParams(params);
              }}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                (t.value === "" && !activeType) || activeType === t.value
                  ? "bg-wood-500 text-white"
                  : "bg-wood-100 text-wood-700 hover:bg-wood-200"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative sm:ml-auto sm:w-56">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-wood-500" aria-hidden="true" />
          <input
            type="text"
            placeholder="Cari dokumen..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-wood-200 bg-surface py-2 pl-9 pr-3 text-sm placeholder:text-wood-500 focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink/20"
          />
        </div>
      </div>

      {/* Content */}
      {content}

      {/* Summary */}
      {data && !isLoading && (
        <p className="text-center text-xs text-wood-500">
          Menampilkan {filtered.length} dari {data.total} dokumen
        </p>
      )}
    </PageShell>
  );
}

function DocumentCard({ doc }: { readonly doc: DocumentOutput }) {
  return (
    <Link
      to={`/documents/${doc.id}`}
      className={`block rounded-xl border border-wood-200 border-l-4 bg-surface p-4 shadow-sm transition-all hover:border-wood-300 hover:shadow-md ${
        TYPE_COLORS[doc.documentType] ?? "border-l-wood-400"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div
            className={`mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold ${
              TYPE_ICON_COLORS[doc.documentType] ?? "bg-wood-100 text-wood-600"
            }`}
          >
            {doc.documentNumber.slice(0, 2)}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-text-primary">
                {doc.documentNumber}
              </span>
              <Badge variant={getStatus("documents", doc.status).variant} size="sm">
                {getStatus("documents", doc.status).label}
              </Badge>
            </div>
            <p className="mt-0.5 text-xs text-text-secondary">
              {DOCUMENT_LABELS[doc.documentType] ?? doc.documentType}
            </p>
            <p className="mt-0.5 text-xs text-wood-500">
              {doc.documentDate}
              {doc.partyId ? ` • ${doc.partyId}` : ""}
              {doc.lines.length > 0 ? ` • ${doc.lines.length} item` : ""}
            </p>
          </div>
        </div>
        <div className="text-right text-sm font-semibold text-text-primary">
          {formatRupiah(doc.totalMinor)}
        </div>
      </div>
    </Link>
  );
}
