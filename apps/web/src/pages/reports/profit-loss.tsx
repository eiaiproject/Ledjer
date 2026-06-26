import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useOrganization, useOrgPermissions } from "@/hooks/useOrganization";
import { queryKeys } from "@/lib/query-keys";
import { exportProfitLossCsv } from "@/lib/csv-export";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PageSpinner } from "@/components/ui/spinner";
import { ErrorState } from "@/components/ui/error-state";
import { formatDate, formatDateInputValue, formatIDR } from "@/lib/utils";
import { Download } from "lucide-react";

interface ProfitLossItem {
  section: string;
  account_code: number;
  account_name: string;
  amount: number;
}

const SECTION_LABELS: Record<string, { label: string; color: string }> = {
  revenue: { label: "Pendapatan", color: "text-success" },
  cogs: { label: "Harga Pokok Penjualan", color: "text-warning" },
  gross_profit: { label: "Laba Kotor", color: "text-text-primary font-bold" },
  expense: { label: "Beban Operasional", color: "text-warning" },
  operating_profit: { label: "Laba Operasional", color: "text-text-primary font-bold" },
  other_income: { label: "Pendapatan Lain", color: "text-success" },
  other_expense: { label: "Beban Lain", color: "text-warning" },
  net_income: { label: "Laba Bersih", color: "text-text-primary font-bold border-t-2 border-wood-800" },
};

export function ProfitLossPage() {
  const { data: orgData } = useOrganization();
  const { canViewReports } = useOrgPermissions();
  
  const today = new Date();
  const firstDayOfMonth = formatDateInputValue(new Date(today.getFullYear(), today.getMonth(), 1));
  const [fromDate, setFromDate] = useState(firstDayOfMonth);
  const [toDate, setToDate] = useState(formatDateInputValue(today));
  const dateRangeInvalid = fromDate > toDate;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.reports.profitLoss(orgData?.organization?.id, fromDate, toDate),
    queryFn: async () => {
      if (!orgData?.organization?.id) return [];
      const { data, error } = await supabase.rpc("get_profit_loss", {
        p_organization_id: orgData.organization.id,
        p_from_date: fromDate,
        p_to_date: toDate,
      });
      if (error) throw error;
      return data as ProfitLossItem[];
    },
    enabled: !!orgData?.organization?.id && canViewReports && !dateRangeInvalid,
  });

  if (!canViewReports) {
    return (
      <Card>
        <CardContent className="text-center py-8">
          <p className="text-wood-500">Anda tidak memiliki izin untuk melihat laporan ini.</p>
        </CardContent>
      </Card>
    );
  }

  if (error) return <ErrorState error={error} onRetry={refetch} />;

  const groupedData = (data || []).reduce((acc, item) => {
    if (!acc[item.section]) acc[item.section] = [];
    acc[item.section].push(item);
    return acc;
  }, {} as Record<string, ProfitLossItem[]>);

  const sectionTotal = (section: string) =>
    (groupedData[section] || []).reduce((sum, item) => sum + item.amount, 0);

  const revenueTotal = sectionTotal("revenue");
  const cogsTotal = sectionTotal("cogs");
  const expenseTotal = sectionTotal("expense");
  const otherIncomeTotal = sectionTotal("other_income");
  const otherExpenseTotal = sectionTotal("other_expense");
  const grossProfit = revenueTotal - cogsTotal;
  const operatingProfit = grossProfit - expenseTotal;
  const netIncome = operatingProfit + otherIncomeTotal - otherExpenseTotal;

  const sections: { key: string; items: ProfitLossItem[]; total?: number }[] = [
    { key: "revenue", items: groupedData.revenue || [] },
    { key: "cogs", items: groupedData.cogs || [] },
    { key: "gross_profit", items: [], total: grossProfit },
    { key: "expense", items: groupedData.expense || [] },
    { key: "operating_profit", items: [], total: operatingProfit },
    { key: "other_income", items: groupedData.other_income || [] },
    { key: "other_expense", items: groupedData.other_expense || [] },
    { key: "net_income", items: [], total: netIncome },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Laba Rugi</h1>
          <p className="text-sm text-text-secondary mt-1">
            Periode: {formatDate(fromDate)} - {formatDate(toDate)}
          </p>
        </div>
      </div>

      {/* Date Range */}
      <Card>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4 items-end">
            <Input
              label="Dari Tanggal"
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              error={dateRangeInvalid ? "Tanggal awal tidak boleh setelah tanggal akhir." : undefined}
            />
            <Input
              label="Sampai Tanggal"
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              error={dateRangeInvalid ? "Tanggal akhir harus sama atau setelah tanggal awal." : undefined}
            />
            <Button type="button" variant="outline" aria-label="Muat ulang data" onClick={() => void refetch()} loading={isLoading}>
              {isLoading ? "Memuat..." : "Muat Ulang"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => orgData?.organization?.id && exportProfitLossCsv(orgData.organization.id, fromDate, toDate).catch(() => {})}
              disabled={!data?.length || dateRangeInvalid}
            >
              <Download className="h-4 w-4" />
              CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Report */}
      {dateRangeInvalid ? (
        <ErrorState message="Perbaiki rentang tanggal untuk melihat laporan laba rugi." />
      ) : isLoading ? (
        <PageSpinner />
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="min-w-[680px] w-full text-sm">
              <thead>
                <tr className="border-b border-wood-200">
                  <th className="px-5 py-3 text-left font-medium text-wood-600">Akun</th>
                  <th className="px-5 py-3 text-right font-medium text-wood-600">Jumlah</th>
                </tr>
              </thead>
              <tbody>
                {sections.map((section) => {
                  const sectionInfo = SECTION_LABELS[section.key];
                  if (section.items.length === 0 && !sectionInfo) return null;

                  return (
                    <SectionBlock
                      key={section.key}
                      section={section.key}
                      label={sectionInfo?.label || section.key}
                      color={sectionInfo?.color || ""}
                      items={section.items}
                      totalOverride={section.total}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function SectionBlock({
  section,
  label,
  color,
  items,
  totalOverride,
}: {
  section: string;
  label: string;
  color: string;
  items: ProfitLossItem[];
  totalOverride?: number;
}) {
  const total = totalOverride ?? items.reduce((sum, item) => sum + item.amount, 0);
  const isSummaryRow = section === "gross_profit" || section === "operating_profit" || section === "net_income";

  return (
    <>
      <tr className="border-b border-wood-100 bg-cream-100/50">
        <td colSpan={2} className="px-5 py-2 font-semibold text-wood-700">{label}</td>
      </tr>
      {items.map((item) => (
        <tr key={item.account_code} className="border-b border-wood-50">
          <td className="min-w-[280px] max-w-[520px] break-words px-5 py-2 pl-8 text-wood-600">
            <span className="font-mono text-xs text-wood-500 mr-2">{item.account_code}</span>
            {item.account_name}
          </td>
          <td className={`px-5 py-2 text-right tabular-nums ${color}`}>
            {formatIDR(item.amount)}
          </td>
        </tr>
      ))}
      {isSummaryRow && (
        <tr className={`border-b border-wood-200 ${color}`}>
          <td className="px-5 py-3 font-bold">Total {label}</td>
          <td className="px-5 py-3 text-right font-bold tabular-nums">{formatIDR(total)}</td>
        </tr>
      )}
    </>
  );
}
