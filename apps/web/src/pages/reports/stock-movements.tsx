import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useOrganization } from "@/hooks/useOrganization";
import { getStockMovementReport, type StockMovementReportLine } from "@/lib/api/reports";
import { listProducts } from "@/lib/api/products";
import { queryKeys } from "@/lib/query-keys";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { formatQuantity, formatShortDate, monthRange } from "@/lib/utils";

interface ProductGroup {
  productId: string;
  name: string;
  unit: string;
  lines: StockMovementReportLine[];
}

function formatUnits(milli: number): string {
  return formatQuantity(milli / 1000);
}

export function StockMovementsPage() {
  const { data: orgData } = useOrganization();
  const orgId = orgData?.organization?.id;
  const initialRange = monthRange();

  const [fromDate, setFromDate] = useState(initialRange.from);
  const [toDate, setToDate] = useState(initialRange.to);
  const [productId, setProductId] = useState("");
  const [submitted, setSubmitted] = useState({
    fromDate: initialRange.from,
    toDate: initialRange.to,
    productId: "",
  });

  const productsQuery = useQuery({
    queryKey: queryKeys.products.all(orgId),
    queryFn: async () => {
      if (!orgId) throw new Error("No organization");
      return listProducts();
    },
    enabled: !!orgId,
  });

  const query = useQuery({
    queryKey: queryKeys.reports.stockMovements(
      orgId,
      submitted.fromDate,
      submitted.toDate,
      submitted.productId || undefined,
    ),
    queryFn: async () => {
      if (!orgId) throw new Error("No organization");
      return getStockMovementReport(
        submitted.fromDate,
        submitted.toDate,
        submitted.productId || undefined,
      );
    },
    enabled: !!orgId,
  });

  const report = query.data;

  const groups = useMemo<ProductGroup[]>(() => {
    const out: ProductGroup[] = [];
    for (const line of report?.lines ?? []) {
      const last = out.at(-1);
      if (!last || last.productId !== line.product_id) {
        out.push({
          productId: line.product_id,
          name: line.product_name,
          unit: line.unit,
          lines: [line],
        });
      } else {
        last.lines.push(line);
      }
    }
    return out;
  }, [report]);

  const productOptions = useMemo(
    () => [
      { value: "", label: "Semua Produk" },
      ...(productsQuery.data ?? []).map((product) => ({
        value: product.id,
        label: product.name,
      })),
    ],
    [productsQuery.data],
  );

  const applyFilters = () => {
    setSubmitted({ fromDate, toDate, productId });
  };

  let reportContent: ReactNode = null;
  if (query.isLoading) {
    reportContent = <div className="h-48 animate-pulse rounded-xl bg-wood-100" />;
  } else if (query.isError) {
    reportContent = (
      <ErrorState
        title="Gagal memuat mutasi stok"
        message="Terjadi kesalahan saat mengambil riwayat pergerakan barang."
        onRetry={() => query.refetch()}
      />
    );
  } else if (report && report.lines.length > 0) {
    reportContent = (
      <Card elevated>
        <CardContent className="p-0">
          <div className="ledger-scroll-x">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Tanggal</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Transaksi</th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide">Jenis</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide">Masuk</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide">Keluar</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide">Sisa</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => (
                  <ProductGroupRows key={group.productId} group={group} />
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    );
  } else if (report) {
    reportContent = (
      <EmptyState
        title="Tidak ada mutasi pada periode ini"
        description="Belum ada pembelian atau penjualan barang yang cocok dengan filter ini."
      />
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Mutasi Stok"
        description="Riwayat keluar-masuk barang per produk dengan sisa berjalan."
      />

      <Card elevated>
        <CardContent className="p-4">
          <form
            className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]"
            onSubmit={(e) => {
              e.preventDefault();
              applyFilters();
            }}
          >
            <Input label="Dari" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            <Input label="Sampai" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
            <Select
              label="Produk"
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              options={productOptions}
            />
            <Button type="submit">Tampilkan</Button>
          </form>
        </CardContent>
      </Card>

      {reportContent}
    </div>
  );
}

function ProductGroupRows({ group }: { readonly group: ProductGroup }) {
  return (
    <>
      <tr className="border-t-2 border-wood-300 bg-cream-100">
        <td colSpan={6} className="px-4 py-2 text-sm font-semibold text-text-primary">
          {group.name} · {group.unit}
        </td>
      </tr>
      {group.lines.map((line) => {
        const incoming = line.quantity_in_milli > 0;
        return (
          <tr key={line.transaction_id}>
            <td className="px-4 py-2.5 text-sm whitespace-nowrap text-text-secondary">
              {formatShortDate(line.entry_date)}
            </td>
            <td className="px-4 py-2.5 text-sm break-words text-text-primary">
              <span className="font-mono text-xs whitespace-nowrap text-text-tertiary">
                {line.transaction_number}
              </span>
              <span className="block text-xs text-text-tertiary">{line.description}</span>
            </td>
            <td className="px-4 py-2.5 text-sm whitespace-nowrap">
              <Badge variant={incoming ? "success" : "warning"} size="sm">
                {incoming ? "Masuk" : "Keluar"}
              </Badge>
            </td>
            <td className="num-mono px-4 py-2.5 text-right text-sm text-text-primary">
              {line.quantity_in_milli > 0 ? formatUnits(line.quantity_in_milli) : ""}
            </td>
            <td className="num-mono px-4 py-2.5 text-right text-sm text-text-primary">
              {line.quantity_out_milli > 0 ? formatUnits(line.quantity_out_milli) : ""}
            </td>
            <td className="num-mono px-4 py-2.5 text-right text-sm font-semibold text-text-primary">
              {formatUnits(line.running_stock_milli)}
            </td>
          </tr>
        );
      })}
    </>
  );
}
