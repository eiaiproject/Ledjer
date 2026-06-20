import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useOrganization, useOrgPermissions } from "@/hooks/useOrganization";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PageSpinner } from "@/components/ui/spinner";
import { ErrorState } from "@/components/ui/error-state";
import { formatIDR, formatDate } from "@/lib/utils";

interface BalanceSheetItem {
  section: string;
  account_code: number;
  account_name: string;
  amount: number;
}

export function BalanceSheetPage() {
  const { data: orgData } = useOrganization();
  const { canViewReports } = useOrgPermissions();
  
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().split("T")[0]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["balance-sheet", orgData?.organization?.id, asOfDate],
    queryFn: async () => {
      if (!orgData?.organization?.id) return [];
      const { data, error } = await supabase.rpc("get_balance_sheet", {
        p_organization_id: orgData.organization.id,
        p_as_of_date: asOfDate,
      });
      if (error) throw error;
      return data as BalanceSheetItem[];
    },
    enabled: !!orgData?.organization?.id && canViewReports,
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

  const assets = (data || []).filter((i) => i.section === "asset");
  const liabilities = (data || []).filter((i) => i.section === "liability");
  const equity = (data || []).filter((i) => i.section === "equity");

  const totalAssets = assets.reduce((sum, i) => sum + i.amount, 0);
  const totalLiabilities = liabilities.reduce((sum, i) => sum + i.amount, 0);
  const totalEquity = equity.reduce((sum, i) => sum + i.amount, 0);
  const totalLiabEquity = totalLiabilities + totalEquity;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-wood-800">Neraca (Balance Sheet)</h1>
        <p className="text-sm text-wood-500 mt-1">Posisi keuangan per {formatDate(asOfDate)}</p>
      </div>

      <Card>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4 items-end">
            <Input
              label="Per Tanggal"
              type="date"
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
            />
            <Button type="button" variant="outline" aria-label="Muat ulang data" onClick={() => void refetch()} loading={isLoading}>
              Muat Ulang
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <PageSpinner />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Assets */}
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold text-wood-800">Aset</h2>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <tbody>
                  {assets.map((item) => (
                    <tr key={item.account_code} className="border-b border-wood-50">
                      <td className="px-5 py-2 text-wood-600">
                        <span className="font-mono text-xs text-wood-400 mr-2">{item.account_code}</span>
                        {item.account_name}
                      </td>
                      <td className="px-5 py-2 text-right tabular-nums text-wood-800">{formatIDR(item.amount)}</td>
                    </tr>
                  ))}
                  <tr className="bg-leaf-50 font-bold">
                    <td className="px-5 py-3 text-leaf-800">Total Aset</td>
                    <td className="px-5 py-3 text-right tabular-nums text-leaf-800">{formatIDR(totalAssets)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>

          {/* Liabilities & Equity */}
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold text-wood-800">Kewajiban & Ekuitas</h2>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <tbody>
                  {liabilities.length > 0 && (
                    <>
                      <tr className="bg-cream-100/50">
                        <td colSpan={2} className="px-5 py-2 font-semibold text-wood-700">Kewajiban</td>
                      </tr>
                      {liabilities.map((item) => (
                        <tr key={item.account_code} className="border-b border-wood-50">
                          <td className="px-5 py-2 pl-8 text-wood-600">
                            <span className="font-mono text-xs text-wood-400 mr-2">{item.account_code}</span>
                            {item.account_name}
                          </td>
                          <td className="px-5 py-2 text-right tabular-nums text-wood-800">{formatIDR(item.amount)}</td>
                        </tr>
                      ))}
                    </>
                  )}
                  {equity.length > 0 && (
                    <>
                      <tr className="bg-cream-100/50">
                        <td colSpan={2} className="px-5 py-2 font-semibold text-wood-700">Ekuitas</td>
                      </tr>
                      {equity.map((item) => (
                        <tr key={item.account_code} className="border-b border-wood-50">
                          <td className="px-5 py-2 pl-8 text-wood-600">
                            <span className="font-mono text-xs text-wood-400 mr-2">{item.account_code}</span>
                            {item.account_name}
                          </td>
                          <td className="px-5 py-2 text-right tabular-nums text-wood-800">{formatIDR(item.amount)}</td>
                        </tr>
                      ))}
                    </>
                  )}
                  <tr className="bg-sky-500/10 font-bold">
                    <td className="px-5 py-3 text-sky-700">Total Kewajiban & Ekuitas</td>
                    <td className="px-5 py-3 text-right tabular-nums text-sky-700">{formatIDR(totalLiabEquity)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* Balance Check */}
      {data && data.length > 0 && (
        <Card>
          <CardContent>
            <div className="flex items-center justify-between">
              <span className="text-sm text-wood-600">Total Aset</span>
              <span className="font-bold tabular-nums text-wood-800">{formatIDR(totalAssets)}</span>
            </div>
            <div className="flex items-center justify-between mt-2">
              <span className="text-sm text-wood-600">Total Kewajiban + Ekuitas</span>
              <span className="font-bold tabular-nums text-wood-800">{formatIDR(totalLiabEquity)}</span>
            </div>
            <div className="mt-3 pt-3 border-t border-wood-200">
              {Math.abs(totalAssets - totalLiabEquity) < 1 ? (
                <p className="text-sm text-leaf-600 font-medium">✓ Neraca seimbang</p>
              ) : (
                <p className="text-sm text-error font-medium">
                  ⚠ Selisih: {formatIDR(Math.abs(totalAssets - totalLiabEquity))}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
