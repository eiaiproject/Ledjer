import { useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useOrgPermissions } from "@/hooks/useOrganization";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ErrorState } from "@/components/ui/error-state";
import { toast } from "@/components/ui/toast";
import { translateError } from "@/lib/errors";
import { cn } from "@/lib/utils";
import {
  listApprovalConfigs,
  upsertApprovalConfig,
  type ActionType,
  type ApprovalConfig,
} from "@/lib/api/approvals";
import {
  Shield,
} from "reicon-react";

const ACTION_LABELS: Record<ActionType, string> = {
  transaction_create: "Transaksi Baru",
  transaction_void: "Pembatalan Transaksi",
  period_reopen: "Pembukaan Periode",
  stock_adjustment: "Penyesuaian Stok",
  manual_journal: "Jurnal Manual",
};

const ACTION_DESCRIPTIONS: Record<ActionType, string> = {
  transaction_create: "Mewajibkan persetujuan untuk transaksi baru di atas ambang batas.",
  transaction_void: "Mewajibkan persetujuan untuk pembatalan transaksi.",
  period_reopen: "Mewajibkan persetujuan untuk membuka kembali periode yang sudah dikunci.",
  stock_adjustment: "Mewajibkan persetujuan untuk penyesuaian stok manual.",
  manual_journal: "Mewajibkan persetujuan untuk jurnal manual.",
};

const ALL_ACTIONS: ActionType[] = [
  "transaction_create",
  "transaction_void",
  "period_reopen",
  "stock_adjustment",
  "manual_journal",
];

export function ApprovalSettingsPage() {
  const queryClient = useQueryClient();
  const { isOwner, canManageTeam } = useOrgPermissions();
  const canManage = isOwner || canManageTeam;

  const {
    data: configs = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["approvals", "configs"],
    queryFn: listApprovalConfigs,
    enabled: canManage,
  });

  const configMap = new Map(configs.map((c) => [c.actionType, c]));

  const upsertMutation = useMutation({
    mutationFn: ({ actionType, thresholdMinor, enabled }: {
      actionType: ActionType;
      thresholdMinor: number;
      enabled: boolean;
    }) => upsertApprovalConfig(actionType, thresholdMinor, enabled),
    onError: (err) => toast.error(translateError(err)),
  });

  const handleToggle = useCallback((actionType: ActionType) => {
    const current = configMap.get(actionType);
    const enabled = !current?.enabled;
    upsertMutation.mutate({ actionType, thresholdMinor: current?.thresholdMinor ?? 0, enabled });
    // Optimistic update
    queryClient.setQueryData(["approvals", "configs"], (old: ApprovalConfig[] | undefined) => {
      if (!old) return old;
      return old.map((c) =>
        c.actionType === actionType ? { ...c, enabled } : c,
      );
    });
    setTimeout(() => queryClient.invalidateQueries({ queryKey: ["approvals", "configs"] }), 500);
  }, [configMap, upsertMutation, queryClient]);

  const handleThresholdChange = useCallback((actionType: ActionType, value: string) => {
    const thresholdMinor = Math.round(parseFloat(value) * 100);
    if (isNaN(thresholdMinor) || thresholdMinor < 0) return;
    const current = configMap.get(actionType);
    upsertMutation.mutate({ actionType, thresholdMinor, enabled: current?.enabled ?? false });
    setTimeout(() => queryClient.invalidateQueries({ queryKey: ["approvals", "configs"] }), 500);
  }, [configMap, upsertMutation, queryClient]);

  if (!canManage) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Pengaturan Persetujuan</h1>
          <p className="mt-1 text-sm text-text-secondary">
            Atur ambang batas dan persyaratan persetujuan.
          </p>
        </div>
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-sm text-wood-500">
              Hanya pemilik dan admin yang dapat mengatur persetujuan.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Pengaturan Persetujuan</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Atur kapan persetujuan diperlukan untuk setiap tindakan.
        </p>
      </div>

      {error && <ErrorState error={error} onRetry={refetch} />}

      {isLoading && (
        <div className="space-y-3">
          {ALL_ACTIONS.map((action) => (
            <Card key={action}>
              <CardContent className="py-4">
                <div className="h-16 animate-pulse rounded bg-cream-200" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!isLoading && (
        <div className="space-y-3">
          {ALL_ACTIONS.map((action) => {
            const config = configMap.get(action);
            const enabled = config?.enabled ?? false;
            const thresholdMinor = config?.thresholdMinor ?? 0;
            const thresholdDisplay = (thresholdMinor / 100).toLocaleString("id-ID");

            return (
              <Card key={action}>
                <CardContent className="py-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-wood-500" />
                        <p className="text-sm font-semibold text-text-primary">
                          {ACTION_LABELS[action]}
                        </p>
                        <Badge variant={enabled ? "info" : "neutral"} size="sm">
                          {enabled ? "Aktif" : "Nonaktif"}
                        </Badge>
                      </div>
                      <p className="text-xs text-text-tertiary">
                        {ACTION_DESCRIPTIONS[action]}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-4 self-end sm:self-auto">
                      {enabled && (
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-wood-500 whitespace-nowrap">
                            Ambang batas:
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="10000"
                            defaultValue={thresholdMinor / 100}
                            onChange={(e) => handleThresholdChange(action, e.target.value)}
                            className="w-28 rounded-md border border-wood-200 bg-cream-50 px-2 py-1.5 text-xs text-wood-700 focus:border-wood-500 focus:outline-none focus:ring-2 focus:ring-wood-200"
                            aria-label={`Ambang batas untuk ${ACTION_LABELS[action]}`}
                          />
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => handleToggle(action)}
                        disabled={upsertMutation.isPending}
                        className={cn(
                          "flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition",
                          enabled
                            ? "bg-leaf-100 text-leaf-700 hover:bg-leaf-200"
                            : "bg-wood-100 text-wood-600 hover:bg-wood-200",
                        )}
                        aria-label={enabled ? `Nonaktifkan ${ACTION_LABELS[action]}` : `Aktifkan ${ACTION_LABELS[action]}`}
                      >
                        {enabled ? (
                          <span className="h-4 w-4 flex items-center justify-center text-leaf-600">
                            <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4"><path d="M17 7l-5 5-5-5-2 2 7 7 7-7z"/></svg>
                          </span>
                        ) : (
                          <span className="h-4 w-4 flex items-center justify-center text-wood-400">
                            <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4"><path d="M7 7l5 5 5-5 2 2-7 7-7-7z"/></svg>
                          </span>
                        )}
                        {enabled ? "Aktif" : "Nonaktif"}
                      </button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
