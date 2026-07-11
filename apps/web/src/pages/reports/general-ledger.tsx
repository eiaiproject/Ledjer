import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useOrganization, useOrgPermissions } from "@/hooks/useOrganization";
import { queryKeys } from "@/lib/query-keys";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatDateInputValue, formatIDR, formatShortDate } from "@/lib/utils";
import { toast } from "@/components/ui/toast";
import { translateError } from "@/lib/errors";
import { exportGeneralLedgerCsv } from "@/lib/csv-export";
import { Download, ChevronDown, ChevronRight, Search } from "lucide-react";
import { listAccounts } from "@/lib/api/accounts";
import { getGeneralLedger, type LedgerEntry } from "@/lib/api/reports";

/* ------------------------------------------------------------------ */
/*  Types & Helpers                                                    */
/* ------------------------------------------------------------------ */

interface AccountGroup {
  code: number;
  name: string;
  entries: LedgerEntry[];
  totalDebit: number;
  totalCredit: number;
  runningBalance: number;
}

/** Compute running balance when server doesn't provide it */
function computeRunningBalance(entries: LedgerEntry[], normalBalance: string): LedgerEntry[] {
  let balance = 0;
  return entries.map((e) => {
    if (normalBalance === "debit") {
      balance += e.debit - e.credit;
    } else {
      balance += e.credit - e.debit;
    }
    return { ...e, running_balance: balance };
  });
}

/** Format date range label */
function formatDateRange(from: string, to: string): string {
  const fromParts = from.split("-");
  const toParts = to.split("-");
  if (fromParts.length < 3 || toParts.length < 3) return `${from} — ${to}`;
  const months = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  const fromMonth = months[Number.parseInt(fromParts[1], 10) - 1];
  const toMonth = months[Number.parseInt(toParts[1], 10) - 1];
  const fromYear = fromParts[0];
  const toYear = toParts[0];
  if (fromYear === toYear) {
    return `${Number.parseInt(fromParts[2])} ${fromMonth} — ${Number.parseInt(toParts[2])} ${toMonth} ${toYear}`;
  }
  return `${Number.parseInt(fromParts[2])} ${fromMonth} ${fromYear} — ${Number.parseInt(toParts[2])} ${toMonth} ${toYear}`;
}

/* ------------------------------------------------------------------ */
/*  Mobile Entry Card                                                  */
/* ------------------------------------------------------------------ */

function LedgerMobileCard({ entry, showAccount }: { readonly entry: LedgerEntry; readonly showAccount?: boolean }) {
  return (
    <div className="rounded-lg border border-wood-200 bg-surface-elevated">
      <div className="px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-text-secondary">{formatShortDate(entry.entry_date)}</span>
          <span className="font-mono text-xs text-text-tertiary">{entry.transaction_number}</span>
        </div>
        {showAccount && (
          <p className="mt-0.5 font-mono text-xs text-text-tertiary">{entry.account_code} — {entry.account_name}</p>
        )}
        <p className="mt-1 break-words text-sm font-medium text-text-primary line-clamp-2">{entry.description}</p>
      </div>
      <div className="grid grid-cols-3 border-t border-wood-100">
        <div className="px-3 py-2 border-r border-wood-100">
          <p className="text-[10px] uppercase tracking-wider text-text-tertiary">Debit</p>
          <p className="font-mono text-xs font-medium text-text-primary mt-0.5">{entry.debit > 0 ? formatIDR(entry.debit) : "—"}</p>
        </div>
        <div className="px-3 py-2 border-r border-wood-100">
          <p className="text-[10px] uppercase tracking-wider text-text-tertiary">Kredit</p>
          <p className="font-mono text-xs font-medium text-text-primary mt-0.5">{entry.credit > 0 ? formatIDR(entry.credit) : "—"}</p>
        </div>
        <div className="px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider text-text-tertiary">Saldo</p>
          <p className={cn(
            "font-mono text-xs font-medium mt-0.5",
            entry.running_balance >= 0 ? "text-text-primary" : "text-clay-600",
          )}>{formatIDR(entry.running_balance)}</p>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Mobile Subtotal Row                                                */
/* ------------------------------------------------------------------ */

function MobileSubtotalRow({ group }: { readonly group: AccountGroup }) {
  const isPositive = group.runningBalance >= 0;
  return (
    <div className="rounded-lg border border-wood-200 bg-cream-50">
      <div className="grid grid-cols-3">
        <div className="px-3 py-2 border-r border-wood-200">
          <p className="text-[10px] uppercase tracking-wider text-text-tertiary">Total Debit</p>
          <p className="font-mono text-xs font-medium text-text-primary mt-0.5">{formatIDR(group.totalDebit)}</p>
        </div>
        <div className="px-3 py-2 border-r border-wood-200">
          <p className="text-[10px] uppercase tracking-wider text-text-tertiary">Total Kredit</p>
          <p className="font-mono text-xs font-medium text-text-primary mt-0.5">{formatIDR(group.totalCredit)}</p>
        </div>
        <div className="px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider text-text-tertiary">Saldo Akhir</p>
          <p className={cn("font-mono text-xs font-semibold mt-0.5", isPositive ? "text-text-primary" : "text-clay-600")}>
            {formatIDR(group.runningBalance)}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Loading Skeleton                                                   */
/* ------------------------------------------------------------------ */

function LedgerSkeleton() {
  return (
    <Card>
      <CardContent className="space-y-4 py-6">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="flex justify-between">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-16" />
            </div>
            <Skeleton className="h-4 w-48" />
            <div className="grid grid-cols-3 gap-2">
              <Skeleton className="h-8" />
              <Skeleton className="h-8" />
              <Skeleton className="h-8" />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Account grouping                                                   */
/* ------------------------------------------------------------------ */

function buildAccountGroups(
  ledger: LedgerEntry[] | undefined,
  showAllAccounts: boolean,
): AccountGroup[] | null {
  if (!ledger || !showAllAccounts) return null;
  const groups: Record<string, AccountGroup> = {};
  for (const entry of ledger) {
    const key = String(entry.account_code);
    if (!groups[key]) {
      groups[key] = {
        code: entry.account_code,
        name: entry.account_name,
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
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

export function GeneralLedgerPage() {
  const { data: orgData } = useOrganization();
  const { canViewReports, canCreateExports } = useOrgPermissions();
  
  const today = new Date();
  const firstDayOfMonth = formatDateInputValue(new Date(today.getFullYear(), today.getMonth(), 1));
  const [accountId, setAccountId] = useState("all");
  const [fromDate, setFromDate] = useState(firstDayOfMonth);
  const [toDate, setToDate] = useState(formatDateInputValue(today));
  const [showFilters, setShowFilters] = useState(false);
  const dateRangeInvalid = fromDate > toDate;

  const { data: accounts, isLoading: accountsLoading, error: accountsError, refetch: refetchAccounts } = useQuery({
    queryKey: queryKeys.accounts.ledgerOptions(orgData?.organization?.id ?? ""),
    queryFn: async () => {
      if (!orgData?.organization?.id) return [];
      return listAccounts({ active: true });
    },
    enabled: !!orgData?.organization?.id,
  });

  const { data: ledger, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.reports.generalLedger(orgData?.organization?.id, accountId, fromDate, toDate),
    queryFn: async () => {
      if (!orgData?.organization?.id) return [];
      const selectedAccountId = accountId === "all" ? undefined : accountId;
      return getGeneralLedger({
        accountId: selectedAccountId,
        fromDate,
        toDate,
      });
    },
    enabled: !!orgData?.organization?.id && canViewReports && !dateRangeInvalid,
  });

  const selectedAccount = accounts?.find((a) => a.id === accountId);
  const showAllAccounts = accountId === "all";

  const accountGroups = useMemo(
    () => buildAccountGroups(ledger, showAllAccounts),
    [ledger, showAllAccounts],
  );

  // Compute running balance for single account view
  const entriesWithBalance = useMemo(() => {
    if (!ledger || showAllAccounts) return ledger;
    // If running_balance is already computed by server, use it
    if (ledger.length > 0 && ledger[0].running_balance !== 0) return ledger;
    // Otherwise compute it (credit normal for most accounts)
    return computeRunningBalance(ledger, "credit");
  }, [ledger, showAllAccounts]);

  // Total debits/credits for summary
  const totals = useMemo(() => {
    if (!ledger) return { debit: 0, credit: 0 };
    return ledger.reduce((acc, e) => ({ debit: acc.debit + e.debit, credit: acc.credit + e.credit }), { debit: 0, credit: 0 });
  }, [ledger]);

  const handleExport = async () => {
    if (!orgData?.organization?.id || dateRangeInvalid) return;
    try {
      await exportGeneralLedgerCsv(accountId, fromDate, toDate);
      toast.success("Export CSV buku besar dimulai");
    } catch (err) {
      toast.error(translateError(err));
    }
  };

  if (!canViewReports) {
    return (
      <Card>
        <CardContent className="text-center py-8">
          <p className="text-text-secondary">Anda tidak memiliki izin untuk melihat laporan ini.</p>
        </CardContent>
      </Card>
    );
  }

  if (accountsError) return <ErrorState error={accountsError} onRetry={refetchAccounts} />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;

  return (
    <div className="ledger-page space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Buku Besar</h1>
          <p className="mt-1 text-sm text-text-secondary">Rincian transaksi per akun</p>
        </div>
        <div className="flex items-center gap-2">
          {canCreateExports && (
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => void handleExport()}
              disabled={!ledger?.length || dateRangeInvalid}
              className="min-h-[44px] min-w-[44px]"
              aria-label="Export CSV"
            >
              <Download className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Period display + Filter toggle */}
      <div className="rounded-xl border border-wood-200 bg-surface-elevated px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-text-tertiary">Periode</p>
            <p className="text-sm font-medium text-text-primary">
              {dateRangeInvalid ? "Rentang tidak valid" : formatDateRange(fromDate, toDate)}
            </p>
            {!showAllAccounts && selectedAccount && (
              <p className="mt-0.5 font-mono text-xs text-text-tertiary">{selectedAccount.code} — {selectedAccount.name}</p>
            )}
            {showAllAccounts && (
              <p className="mt-0.5 text-xs text-text-tertiary">Semua akun</p>
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className="min-h-[44px]"
            aria-expanded={showFilters}
          >
            {showFilters ? "Tutup" : "Filter"}
            {showFilters ? <ChevronDown className="ml-1 h-4 w-4" /> : <ChevronRight className="ml-1 h-4 w-4" />}
          </Button>
        </div>

        {/* Filters — collapsible on mobile, always visible on desktop */}
        <div className={cn(
          "mt-3 grid gap-3 border-t border-wood-100 pt-3 sm:block sm:border-0 sm:p-0 sm:pt-0",
          showFilters ? "block" : "hidden sm:block",
        )}>
          <div className="grid gap-3 sm:grid-cols-3">
            <Select
              label="Akun"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              placeholder={accountsLoading ? "Memuat akun..." : "-- Pilih Akun --"}
              disabled={accountsLoading}
              options={[
                { value: "all", label: "Semua Akun" },
                ...(accounts || []).map((a) => ({
                  value: a.id,
                  label: `${a.code} - ${a.name}`,
                })),
              ]}
            />
            <Input
              label="Dari Tanggal"
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              error={dateRangeInvalid ? "Tanggal awal tidak valid" : undefined}
            />
            <Input
              label="Sampai Tanggal"
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              error={dateRangeInvalid ? "Tanggal akhir tidak valid" : undefined}
            />
          </div>
        </div>
      </div>

      {/* Content */}
      {dateRangeInvalid && (
        <ErrorState message="Perbaiki rentang tanggal untuk melihat buku besar." />
      )}
      {!dateRangeInvalid && isLoading && (
        <LedgerSkeleton />
      )}
      {!dateRangeInvalid && !isLoading && (
        <>
          {/* Summary bar */}
          {(ledger?.length ?? 0) > 0 && (
            <div className="flex items-center gap-4 rounded-lg border border-wood-200 bg-surface-elevated px-4 py-2.5">
              <span className="text-xs text-text-tertiary">{ledger.length} entri</span>
              <span className="text-xs text-text-tertiary">·</span>
              <span className="text-xs text-text-tertiary">Debit: <span className="font-mono font-medium text-text-primary">{formatIDR(totals.debit)}</span></span>
              <span className="text-xs text-text-tertiary">Kredit: <span className="font-mono font-medium text-text-primary">{formatIDR(totals.credit)}</span></span>
              {totals.debit === totals.credit && (
                <>
                  <span className="text-xs text-text-tertiary">·</span>
                  <span className="text-xs text-success font-medium">Seimbang ✓</span>
                </>
              )}
            </div>
          )}

          <Card>
            {/* Mobile: grouped cards */}
            <div className="space-y-4 p-4 lg:hidden">
              {(ledger?.length ?? 0) > 0 && showAllAccounts && accountGroups && (
                accountGroups.map((group) => (
                  <AccountGroupSection key={group.code} group={group} showAccount />
                ))
              )}
              {(ledger?.length ?? 0) > 0 && (!showAllAccounts || !accountGroups) && (
                <div className="space-y-2">
                  {entriesWithBalance?.map((entry) => (
                    <LedgerMobileCard key={entry.journal_entry_id} entry={entry} />
                  ))}
                </div>
              )}
              {(!ledger || ledger.length === 0) && (
                <EmptyLedgerState />
              )}
            </div>

            {/* Desktop: table per account group */}
            <div className="hidden lg:block space-y-4">
              {(ledger?.length ?? 0) > 0 && showAllAccounts && accountGroups && (
                accountGroups.map((group) => (
                  <AccountGroupTableSection key={group.code} group={group} />
                ))
              )}
              {(ledger?.length ?? 0) > 0 && (!showAllAccounts || !accountGroups) && (
                <SingleAccountTable entries={entriesWithBalance || []} />
              )}
              {(!ledger || ledger.length === 0) && (
                <EmptyLedgerState />
              )}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Account Group Section (Mobile)                                     */
/* ------------------------------------------------------------------ */

function AccountGroupSection({ group, showAccount }: { readonly group: AccountGroup; readonly showAccount?: boolean }) {
  const [expanded, setExpanded] = useState(true);
  const isPositive = group.runningBalance >= 0;

  return (
    <div className="rounded-xl border border-wood-200">
      {/* Sticky group header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "sticky top-[56px] z-10 flex w-full items-center justify-between bg-cream-100 px-3 py-2.5 text-left min-h-[44px]",
          expanded ? "rounded-t-xl" : "rounded-xl",
        )}
        aria-expanded={expanded}
      >
        <div>
          <p className="text-sm font-semibold text-text-primary">{group.code} — {group.name}</p>
          <p className="mt-0.5 text-xs text-text-tertiary">
            {group.entries.length} entri · Saldo: <span className={cn("font-mono font-medium", isPositive ? "text-text-primary" : "text-clay-600")}>{formatIDR(group.runningBalance)}</span>
          </p>
        </div>
        {expanded ? <ChevronDown className="h-4 w-4 shrink-0 text-text-tertiary" /> : <ChevronRight className="h-4 w-4 shrink-0 text-text-tertiary" />}
      </button>

      {expanded && (
        <div className="divide-y divide-wood-100 border-t border-wood-200">
          {group.entries.map((entry) => (
            <LedgerMobileCard key={`${group.code}-${entry.journal_entry_id}`} entry={entry} showAccount={showAccount} />
          ))}
          <MobileSubtotalRow group={group} />
        </div>
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
      <td className="px-4 py-2 text-xs text-text-secondary">{formatShortDate(entry.entry_date)}</td>
      <td className="px-4 py-2 font-mono text-xs text-text-tertiary">{entry.transaction_number}</td>
      <td className="max-w-[280px] px-4 py-2 text-xs text-text-primary">
        <span className="line-clamp-2 break-words">{entry.description}</span>
      </td>
      <td className="px-4 py-2 text-right font-mono text-xs text-text-primary">{entry.debit > 0 ? formatIDR(entry.debit) : ""}</td>
      <td className="px-4 py-2 text-right font-mono text-xs text-text-primary">{entry.credit > 0 ? formatIDR(entry.credit) : ""}</td>
      <td className={cn("px-4 py-2 text-right font-mono text-xs font-medium", entry.running_balance >= 0 ? "text-text-primary" : "text-clay-600")}>
        {formatIDR(entry.running_balance)}
      </td>
    </tr>
  );
}

/* ------------------------------------------------------------------ */
/*  Desktop: Single Account Table                                      */
/* ------------------------------------------------------------------ */

function SingleAccountTable({ entries }: { readonly entries: LedgerEntry[] }) {
  return (
    <section className="overflow-hidden rounded-xl border border-wood-200">
      <table className="ledger-table w-full">
        <thead>
          <tr className="border-b border-wood-200 bg-cream-50">
            <th className="px-4 py-2.5 text-left text-xs font-medium text-text-secondary">Tanggal</th>
            <th className="px-4 py-2.5 text-left text-xs font-medium text-text-secondary">No. Ref</th>
            <th className="px-4 py-2.5 text-left text-xs font-medium text-text-secondary">Keterangan</th>
            <th className="px-4 py-2.5 text-right text-xs font-medium text-text-secondary">Debit</th>
            <th className="px-4 py-2.5 text-right text-xs font-medium text-text-secondary">Kredit</th>
            <th className="px-4 py-2.5 text-right text-xs font-medium text-text-secondary">Saldo</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <DesktopEntryRow key={entry.journal_entry_id} entry={entry} />
          ))}
        </tbody>
      </table>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Desktop: Account Group Section (sticky header + table)             */
/* ------------------------------------------------------------------ */

function AccountGroupTableSection({ group }: { readonly group: AccountGroup }) {
  const [expanded, setExpanded] = useState(true);
  const isPositive = group.runningBalance >= 0;

  return (
    <section className="rounded-xl border border-wood-200">
      {/* Sticky group header (button works with overflow-x:hidden on html) */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "sticky top-0 z-10 flex w-full items-center justify-between bg-cream-100 px-4 py-2.5 text-left min-h-[44px]",
          expanded ? "rounded-t-xl" : "rounded-xl",
        )}
        aria-expanded={expanded}
      >
        <div>
          <p className="text-sm font-semibold text-text-primary">{group.code} — {group.name}</p>
          <p className="mt-0.5 text-xs text-text-tertiary">
            {group.entries.length} entri · Saldo: <span className={cn("font-mono font-medium", isPositive ? "text-text-primary" : "text-clay-600")}>{formatIDR(group.runningBalance)}</span>
          </p>
        </div>
        {expanded ? <ChevronDown className="h-4 w-4 shrink-0 text-text-tertiary" /> : <ChevronRight className="h-4 w-4 shrink-0 text-text-tertiary" />}
      </button>

      {expanded && (
        <table className="ledger-table w-full">
          <thead>
            <tr className="border-b border-wood-200 bg-cream-50">
              <th className="px-4 py-2.5 text-left text-xs font-medium text-text-secondary">Tanggal</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-text-secondary">No. Ref</th>
              <th className="px-4 py-2.5 text-left text-xs font-medium text-text-secondary">Keterangan</th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-text-secondary">Debit</th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-text-secondary">Kredit</th>
              <th className="px-4 py-2.5 text-right text-xs font-medium text-text-secondary">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {group.entries.map((entry) => (
              <DesktopEntryRow key={`${group.code}-${entry.journal_entry_id}`} entry={entry} />
            ))}
            {/* Subtotal row */}
            <tr className="border-t border-wood-200 bg-cream-50 font-medium">
              <td colSpan={3} className="px-4 py-2 text-xs text-text-secondary">Subtotal {group.code}</td>
              <td className="px-4 py-2 text-right font-mono text-xs text-text-primary">{formatIDR(group.totalDebit)}</td>
              <td className="px-4 py-2 text-right font-mono text-xs text-text-primary">{formatIDR(group.totalCredit)}</td>
              <td className={cn("px-4 py-2 text-right font-mono text-xs", isPositive ? "text-text-primary" : "text-clay-600")}>
                {formatIDR(group.runningBalance)}
              </td>
            </tr>
          </tbody>
        </table>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Empty State                                                        */
/* ------------------------------------------------------------------ */

function EmptyLedgerState() {
  return (
    <div className="flex min-h-[240px] items-center justify-center p-8">
      <div className="mx-auto max-w-sm text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-wood-200 text-wood-400">
          <Search className="h-6 w-6" />
        </div>
        <h3 className="mt-3 text-base font-semibold text-text-primary">Tidak ada transaksi</h3>
        <p className="mt-1 text-sm text-text-secondary">
          Tidak ada data buku besar untuk periode dan akun yang dipilih.
        </p>
      </div>
    </div>
  );
}
