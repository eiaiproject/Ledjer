import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useOrganization, useOrgPermissions } from "@/hooks/useOrganization";
import { queryKeys } from "@/lib/query-keys";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatIDR, formatShortDate } from "@/lib/utils";
import { exportGeneralLedgerCsv } from "@/lib/csv-export";
import { Download, ChevronDown, ChevronRight, BookOpen } from "reicon-react";
import { listAccounts } from "@/lib/api/accounts";
import { getGeneralLedger, type LedgerEntry } from "@/lib/api/reports";
import { useReportDateRange, ReportPermissionGate, handleReportExport } from "./_components";
import { ReportShell } from "@/components/ui/report-shell";

/* ------------------------------------------------------------------ */
/*  Types & Helpers                                                    */
/* ------------------------------------------------------------------ */

interface AccountGroup {
  code: number;
  name: string;
  normalBalance: string;
  entries: LedgerEntry[];
  totalDebit: number;
  totalCredit: number;
  runningBalance: number;
}

function formatDateRange(from: string, to: string): string {
  const fromParts = from.split("-");
  const toParts = to.split("-");
  if (fromParts.length < 3 || toParts.length < 3) return `${from} — ${to}`;
  const months = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  const fromMonth = months[Number.parseInt(fromParts[1], 10) - 1];
  const toMonth = months[Number.parseInt(toParts[1], 10) - 1];
  const fromDay = Number.parseInt(fromParts[2], 10);
  const toDay = Number.parseInt(toParts[2], 10);
  const fromYear = fromParts[0];
  const toYear = toParts[0];
  if (fromYear === toYear && fromMonth === toMonth) {
    return `${fromDay}–${toDay} ${fromMonth} ${fromYear}`;
  }
  if (fromYear === toYear) {
    return `${fromDay} ${fromMonth} — ${toDay} ${toMonth} ${toYear}`;
  }
  return `${fromDay} ${fromMonth} ${fromYear} — ${toDay} ${toMonth} ${toYear}`;
}

function buildAccountGroups(ledger: LedgerEntry[] | undefined, showAllAccounts: boolean): AccountGroup[] | null {
  if (!ledger || !showAllAccounts) return null;
  const groups: Record<string, AccountGroup> = {};
  for (const entry of ledger) {
    const key = String(entry.account_code);
    if (!groups[key]) {
      groups[key] = {
        code: entry.account_code,
        name: entry.account_name,
        normalBalance: "debit", // Will be set from first entry's data
        entries: [],
        totalDebit: 0,
        totalCredit: 0,
        runningBalance: 0,
      };
    }
    groups[key].entries.push(entry);
    groups[key].totalDebit += entry.debit;
    groups[key].totalCredit += entry.credit;
    groups[key].runningBalance = entry.running_balance;
  }
  return Object.values(groups).sort((a, b) => a.code - b.code);
}

/* ------------------------------------------------------------------ */
/*  Mobile Entry Card                                                  */
/* ------------------------------------------------------------------ */

function LedgerMobileCard({ entry }: { readonly entry: LedgerEntry }) {
  return (
    <div className="px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-text-secondary">{formatShortDate(entry.entry_date)}</span>
        <span className="font-mono text-xs text-text-tertiary">
          {entry.transaction_number || "—"}
        </span>
      </div>
      <p className="mt-1 break-words text-sm font-medium text-text-primary line-clamp-2">{entry.description}</p>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        <span className="text-xs text-text-tertiary">
          Debit: <span className="font-mono font-medium text-text-primary">{entry.debit > 0 ? formatIDR(entry.debit) : "—"}</span>
        </span>
        <span className="text-xs text-text-tertiary">
          Kredit: <span className="font-mono font-medium text-text-primary">{entry.credit > 0 ? formatIDR(entry.credit) : "—"}</span>
        </span>
        <span className="text-xs text-text-tertiary">
          Saldo: <span className={cn("font-mono font-medium", entry.running_balance >= 0 ? "text-text-primary" : "text-clay-600")}>
            {formatIDR(entry.running_balance)}
          </span>
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Mobile Subtotal                                                    */
/* ------------------------------------------------------------------ */

function MobileSubtotalRow({ group }: { readonly group: AccountGroup }) {
  const isPositive = group.runningBalance >= 0;
  const net = group.totalDebit - group.totalCredit;
  return (
    <div className="border-t border-wood-200 bg-cream-50 px-3 py-2.5">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <span className="text-text-tertiary">
          Total Debit: <span className="font-mono font-medium text-text-primary">{formatIDR(group.totalDebit)}</span>
        </span>
        <span className="text-text-tertiary">
          Total Kredit: <span className="font-mono font-medium text-text-primary">{formatIDR(group.totalCredit)}</span>
        </span>
        <span className="text-text-tertiary">
          Perubahan: <span className={cn("font-mono font-medium", net >= 0 ? "text-text-primary" : "text-clay-600")}>{formatIDR(net)}</span>
        </span>
        <span className="font-medium text-text-primary">
          Saldo Akhir: <span className={cn("font-mono", isPositive ? "" : "text-clay-600")}>{formatIDR(group.runningBalance)}</span>
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Loading Skeleton                                                   */
/* ------------------------------------------------------------------ */

function LedgerSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex gap-4 rounded-lg border border-wood-200 bg-surface-elevated px-4 py-3">
        <Skeleton className="h-4 w-16" /><Skeleton className="h-4 w-24" /><Skeleton className="h-4 w-24" />
      </div>
      <Card>
        <CardContent className="space-y-4 py-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="flex justify-between"><Skeleton className="h-4 w-32" /><Skeleton className="h-4 w-16" /></div>
              <Skeleton className="h-4 w-48" />
              <div className="flex gap-4"><Skeleton className="h-4 w-20" /><Skeleton className="h-4 w-20" /><Skeleton className="h-4 w-20" /></div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components (reduce cognitive complexity)                       */
/* ------------------------------------------------------------------ */

function ExportButtons({ disabled, isExporting, onExport }: {
  readonly disabled: boolean;
  readonly isExporting: boolean;
  readonly onExport: () => void;
}) {
  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={onExport}
        disabled={disabled} className="hidden sm:inline-flex" aria-busy={isExporting || undefined}>
        <Download className="h-4 w-4" aria-hidden="true" />
        {isExporting ? "Mengekspor..." : "Ekspor CSV"}
      </Button>
      <Button type="button" variant="outline" size="icon" onClick={onExport}
        disabled={disabled} className="sm:hidden min-h-[44px] min-w-[44px]"
        aria-label={isExporting ? "Mengekspor buku besar ke CSV" : "Ekspor buku besar ke CSV"}
        aria-busy={isExporting || undefined}>
        <Download className="h-4 w-4" aria-hidden="true" />
      </Button>
    </>
  );
}

function SummaryBar({ ledger, totals, isGlobalScope, isBalanced }: {
  readonly ledger: LedgerEntry[] | undefined;
  readonly totals: { debit: number; credit: number };
  readonly isGlobalScope: boolean;
  readonly isBalanced: boolean;
}) {
  if ((ledger?.length ?? 0) === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-wood-200 bg-surface-elevated px-4 py-2.5">
      <span className="text-xs text-text-tertiary">{ledger?.length} entri</span>
      <span className="text-xs text-text-tertiary">
        Debit: <span className="font-mono font-medium text-text-primary">{formatIDR(totals.debit)}</span>
      </span>
      <span className="text-xs text-text-tertiary">
        Kredit: <span className="font-mono font-medium text-text-primary">{formatIDR(totals.credit)}</span>
      </span>
      {isGlobalScope ? (
        <span className={cn("text-xs font-medium", isBalanced ? "text-success" : "text-error")}>
          {isBalanced ? "Total jurnal seimbang" : "Total jurnal tidak seimbang"}
        </span>
      ) : (
        <span className="text-xs text-text-tertiary">
          Perubahan bersih: <span className={cn("font-mono font-medium", (totals.debit - totals.credit) >= 0 ? "text-text-primary" : "text-clay-600")}>
            {formatIDR(totals.debit - totals.credit)}
          </span>
        </span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

const FILTER_PANEL_ID = "general-ledger-filters";

export function GeneralLedgerPage() { // NOSONAR typescript:S3776 — complexity 16/15; sub-components already extracted
  const { data: orgData } = useOrganization();
  const { canViewReports, canCreateExports } = useOrgPermissions();

  const {
    pendingFrom, setPendingFrom,
    pendingTo, setPendingTo,
    appliedFrom, appliedTo,
    dateRangeInvalid,
  } = useReportDateRange();
  const [accountId, setAccountId] = useState("all");
  const [showFilters, setShowFilters] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const { data: accounts, isLoading: accountsLoading, error: accountsError, refetch: refetchAccounts } = useQuery({
    queryKey: queryKeys.accounts.ledgerOptions(orgData?.organization?.id ?? ""),
    queryFn: async () => {
      if (!orgData?.organization?.id) return [];
      return listAccounts({ active: true });
    },
    enabled: !!orgData?.organization?.id,
  });

  const { data: ledger, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.reports.generalLedger(orgData?.organization?.id, accountId, appliedFrom, appliedTo),
    queryFn: async () => {
      if (!orgData?.organization?.id) return [];
      return getGeneralLedger({ accountId: accountId === "all" ? undefined : accountId, fromDate: appliedFrom, toDate: appliedTo });
    },
    enabled: !!orgData?.organization?.id && canViewReports && !dateRangeInvalid,
  });

  const selectedAccount = accounts?.find((a) => a.id === accountId);
  const showAllAccounts = accountId === "all";

  const accountGroups = useMemo(() => buildAccountGroups(ledger, showAllAccounts), [ledger, showAllAccounts]);

  // For single-account view, use entries directly (server provides running_balance)
  const entriesWithBalance = useMemo(() => ledger || [], [ledger]);

  // Totals
  const totals = useMemo(() => {
    if (!ledger) return { debit: 0, credit: 0 };
    return ledger.reduce((acc, e) => ({ debit: acc.debit + e.debit, credit: acc.credit + e.credit }), { debit: 0, credit: 0 });
  }, [ledger]);

  // Global balance: only valid when showing all accounts and all entries loaded
  const isGlobalScope = showAllAccounts && (ledger?.length ?? 0) > 0;
  const isBalanced = totals.debit === totals.credit;

  const handleExport = useCallback(async () => {
    await handleReportExport({
      orgId: orgData?.organization?.id,
      disabled: dateRangeInvalid || isExporting,
      exportFn: () => exportGeneralLedgerCsv(accountId, appliedFrom, appliedTo),
      onFinally: () => setIsExporting(false),
    });
  }, [orgData?.organization?.id, dateRangeInvalid, isExporting, accountId, appliedFrom, appliedTo]);

  const toggleFilters = useCallback(() => setShowFilters((s) => !s), []);

  // ── Permission guard ──
  if (!canViewReports) {
    return (
      <ReportPermissionGate>
        <div />
      </ReportPermissionGate>
    );
  }

  // ── Errors ──
  if (accountsError) return <ErrorState error={accountsError} message="Akun gagal dimuat." onRetry={refetchAccounts} />;
  if (error) return <ErrorState error={error} message="Buku besar gagal dimuat. Periksa koneksi Anda, lalu coba lagi." onRetry={refetch} />;

  return (
    <ReportShell
      title="Buku Besar"
      description="Rincian transaksi per akun"
      helpTopic="general_ledger"
      guide="reports/general-ledger"
      actions={canCreateExports ? (
        <ExportButtons
          disabled={!ledger?.length || dateRangeInvalid || isExporting}
          isExporting={isExporting}
          onExport={handleExport}
        />
      ) : undefined}
    >

      {/* Filter summary + toggle */}
      <div className="rounded-xl border border-wood-200 bg-surface-elevated px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-text-tertiary">Periode</p>
            <p className="text-sm font-medium text-text-primary">
              {dateRangeInvalid ? "Rentang tidak valid" : formatDateRange(appliedFrom, appliedTo)}
            </p>
            {!showAllAccounts && selectedAccount ? (
              <p className="mt-0.5 font-mono text-xs text-text-tertiary">{selectedAccount.code} — {selectedAccount.name}</p>
            ) : (
              <p className="mt-0.5 text-xs text-text-tertiary">Semua akun</p>
            )}
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={toggleFilters}
            className="min-h-[44px]" aria-expanded={showFilters} aria-controls={FILTER_PANEL_ID}>
            {showFilters ? "Tutup filter" : "Filter"}
            {showFilters
              ? <ChevronDown className="ml-1 h-4 w-4" aria-hidden="true" />
              : <ChevronRight className="ml-1 h-4 w-4" aria-hidden="true" />}
          </Button>
        </div>

        {/* Filter panel */}
        <div id={FILTER_PANEL_ID} className={cn(
          "mt-3 grid gap-3 border-t border-wood-100 pt-3 sm:block sm:border-0 sm:p-0 sm:pt-0",
          showFilters ? "block" : "hidden sm:block",
        )}>
          <div className="grid gap-3 sm:grid-cols-3">
            <Select label="Akun" value={accountId} onChange={(e) => setAccountId(e.target.value)}
              placeholder={accountsLoading ? "Memuat akun..." : undefined} disabled={accountsLoading}
              options={[
                { value: "all", label: "Semua akun" },
                ...(accounts || []).map((a) => ({ value: a.id, label: `${a.code} — ${a.name}` })),
              ]} />
            <Input label="Dari tanggal" type="date" value={pendingFrom}
              onChange={(e) => setPendingFrom(e.target.value)}
              error={dateRangeInvalid ? "Tanggal awal tidak boleh setelah tanggal akhir." : undefined}
              aria-invalid={dateRangeInvalid || undefined} />
            <Input label="Sampai tanggal" type="date" value={pendingTo}
              onChange={(e) => setPendingTo(e.target.value)}
              error={dateRangeInvalid ? "Tanggal akhir tidak valid." : undefined}
              aria-invalid={dateRangeInvalid || undefined} />
          </div>
        </div>
      </div>

      {/* Invalid date range */}
      {dateRangeInvalid && (
        <ErrorState message="Tanggal awal tidak boleh setelah tanggal akhir. Perbaiki rentang tanggal untuk melihat buku besar." />
      )}

      {/* Loading */}
      {!dateRangeInvalid && isLoading && <LedgerSkeleton />}

      {/* Content */}
      {!dateRangeInvalid && !isLoading && (
        <>
          {/* Summary bar */}
          <SummaryBar ledger={ledger} totals={totals} isGlobalScope={isGlobalScope} isBalanced={isBalanced} />

          {/* Empty state */}
          {(!ledger || ledger.length === 0) && (
            <EmptyState
              icon={<BookOpen className="h-7 w-7 text-wood-500" aria-hidden="true" />}
              title="Belum ada transaksi pada periode ini"
              description="Ubah periode atau catat transaksi baru."
            />
          )}

          {/* Ledger data */}
          {(ledger?.length ?? 0) > 0 && (
            <Card>
              {/* Mobile */}
              <div className="space-y-3 p-4 lg:hidden">
                {showAllAccounts && accountGroups?.map((group) => (
                  <AccountGroupSection key={group.code} group={group} />
                ))}
                {!showAllAccounts && (
                  <div className="divide-y divide-wood-100 rounded-xl border border-wood-200">
                    {entriesWithBalance.map((entry) => (
                      <LedgerMobileCard key={entry.journal_entry_id} entry={entry} />
                    ))}
                  </div>
                )}
              </div>

              {/* Desktop */}
              <div className="hidden lg:block space-y-4">
                {showAllAccounts && accountGroups?.map((group) => (
                  <AccountGroupTableSection key={group.code} group={group} />
                ))}
                {!showAllAccounts && selectedAccount && (
                  <SingleAccountTable entries={entriesWithBalance} accountName={`${selectedAccount.code} — ${selectedAccount.name}`} />
                )}
              </div>
            </Card>
          )}
        </>
      )}
    </ReportShell>
  );
}

/* ------------------------------------------------------------------ */
/*  Shared: Account Group Trigger Header                               */
/* ------------------------------------------------------------------ */

function AccountGroupTrigger({
  group,
  expanded,
  onToggle,
  className,
}: {
  readonly group: AccountGroup;
  readonly expanded: boolean;
  readonly onToggle: () => void;
  readonly className: string;
}) {
  const isPositive = group.runningBalance >= 0;
  const panelId = `ledger-account-${group.code}-panel`;
  const triggerId = `ledger-account-${group.code}-trigger`;

  return (
    <button type="button" id={triggerId} onClick={onToggle}
      aria-expanded={expanded} aria-controls={panelId}
      className={cn(
        className,
        expanded ? "rounded-t-xl" : "rounded-xl",
      )}>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-text-primary">{group.code} — {group.name}</p>
        <p className="mt-0.5 text-xs text-text-tertiary">
          {group.entries.length} entri · Saldo:{" "}
          <span className={cn("font-mono font-medium", isPositive ? "text-text-primary" : "text-clay-600")}>
            {formatIDR(group.runningBalance)}
          </span>
        </p>
      </div>
      {expanded
        ? <ChevronDown className="h-4 w-4 shrink-0 text-text-tertiary" aria-hidden="true" />
        : <ChevronRight className="h-4 w-4 shrink-0 text-text-tertiary" aria-hidden="true" />}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Shared: Ledger Table Header (6 columns)                            */
/* ------------------------------------------------------------------ */

function LedgerTableHeader() {
  return (
    <thead>
      <tr className="border-b border-wood-200 bg-cream-50">
        <th scope="col" className="px-4 py-2.5 text-left text-xs font-medium text-text-secondary">Tanggal</th>
        <th scope="col" className="px-4 py-2.5 text-left text-xs font-medium text-text-secondary">No. Ref</th>
        <th scope="col" className="px-4 py-2.5 text-left text-xs font-medium text-text-secondary">Keterangan</th>
        <th scope="col" className="px-4 py-2.5 text-right text-xs font-medium text-text-secondary">Debit</th>
        <th scope="col" className="px-4 py-2.5 text-right text-xs font-medium text-text-secondary">Kredit</th>
        <th scope="col" className="px-4 py-2.5 text-right text-xs font-medium text-text-secondary">Saldo</th>
      </tr>
    </thead>
  );
}

/* ------------------------------------------------------------------ */
/*  Account Group Section (Mobile)                                     */
/* ------------------------------------------------------------------ */

function AccountGroupSection({ group }: { readonly group: AccountGroup }) {
  const [expanded, setExpanded] = useState(true);
  const panelId = `ledger-account-${group.code}-panel`;
  const triggerId = `ledger-account-${group.code}-trigger`;

  return (
    <div className="rounded-xl border border-wood-200">
      <AccountGroupTrigger
        group={group}
        expanded={expanded}
        onToggle={() => setExpanded(!expanded)}
        className="sticky top-[56px] z-10 flex w-full items-center justify-between bg-cream-100 px-3 py-2.5 text-left min-h-[44px]"
      />

      {expanded && (
        <section id={panelId} aria-labelledby={triggerId} className="divide-y divide-wood-100 border-t border-wood-200">
          {group.entries.map((entry) => (
            <LedgerMobileCard key={`${group.code}-${entry.journal_entry_id}`} entry={entry} />
          ))}
          <MobileSubtotalRow group={group} />
        </section>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Desktop Entry Row                                                  */
/* ------------------------------------------------------------------ */

function DesktopEntryRow({ entry }: { readonly entry: LedgerEntry }) {
  return (
    <tr className="border-b border-wood-50 hover:bg-cream-50/50">
      <td className="px-4 py-2 text-xs text-text-secondary whitespace-nowrap">{formatShortDate(entry.entry_date)}</td>
      <td className="px-4 py-2 font-mono text-xs text-text-tertiary whitespace-nowrap">{entry.transaction_number || "—"}</td>
      <td className="max-w-[280px] px-4 py-2 text-xs text-text-primary">
        <span className="line-clamp-2 break-words">{entry.description}</span>
      </td>
      <td className="px-4 py-2 text-right font-mono text-xs text-text-primary whitespace-nowrap">
        {entry.debit > 0 ? formatIDR(entry.debit) : ""}
      </td>
      <td className="px-4 py-2 text-right font-mono text-xs text-text-primary whitespace-nowrap">
        {entry.credit > 0 ? formatIDR(entry.credit) : ""}
      </td>
      <td className={cn("px-4 py-2 text-right font-mono text-xs font-medium whitespace-nowrap",
        entry.running_balance >= 0 ? "text-text-primary" : "text-clay-600")}>
        {formatIDR(entry.running_balance)}
      </td>
    </tr>
  );
}

/* ------------------------------------------------------------------ */
/*  Desktop: Single Account Table                                      */
/* ------------------------------------------------------------------ */

function SingleAccountTable({ entries, accountName }: { readonly entries: LedgerEntry[]; readonly accountName: string }) {
  return (
    <section className="overflow-hidden rounded-xl border border-wood-200">
      <div className="ledger-scroll-x">
      <table className="ledger-table w-full min-w-[800px]">
        <caption className="sr-only">Buku besar akun {accountName}</caption>
        <LedgerTableHeader />
        <tbody>
          {entries.map((entry) => (
            <DesktopEntryRow key={entry.journal_entry_id} entry={entry} />
          ))}
        </tbody>
      </table>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Desktop: Account Group Table Section                               */
/* ------------------------------------------------------------------ */

function AccountGroupTableSection({ group }: { readonly group: AccountGroup }) {
  const [expanded, setExpanded] = useState(true);
  const isPositive = group.runningBalance >= 0;
  const panelId = `ledger-account-${group.code}-panel`;
  const triggerId = `ledger-account-${group.code}-trigger`;

  return (
    <section className="rounded-xl border border-wood-200">
      <AccountGroupTrigger
        group={group}
        expanded={expanded}
        onToggle={() => setExpanded(!expanded)}
        className="sticky top-0 z-10 flex w-full items-center justify-between bg-cream-100 px-4 py-2.5 text-left min-h-[44px]"
      />

      {expanded && (
        <section id={panelId} aria-labelledby={triggerId}>
          <div className="ledger-scroll-x">
          <table className="ledger-table w-full min-w-[800px]">
            <caption className="sr-only">Buku besar akun {group.code} — {group.name}</caption>
            <LedgerTableHeader />
            <tbody>
              {group.entries.map((entry) => (
                <DesktopEntryRow key={`${group.code}-${entry.journal_entry_id}`} entry={entry} />
              ))}
              {/* Subtotal row */}
              <tr className="border-t border-wood-200 bg-cream-50 font-medium">
                <td colSpan={3} scope="row" className="px-4 py-2 text-xs text-text-secondary">
                  Subtotal {group.code}
                </td>
                <td className="px-4 py-2 text-right font-mono text-xs text-text-primary">{formatIDR(group.totalDebit)}</td>
                <td className="px-4 py-2 text-right font-mono text-xs text-text-primary">{formatIDR(group.totalCredit)}</td>
                <td className={cn("px-4 py-2 text-right font-mono text-xs",
                  isPositive ? "text-text-primary" : "text-clay-600")}>
                  {formatIDR(group.runningBalance)}
                </td>
              </tr>
            </tbody>
          </table>
          </div>
        </section>
      )}
    </section>
  );
}
