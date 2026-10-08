import { FileText } from "reicon-react";
import { Link } from "react-router-dom";
import { formatIDR } from "@/lib/utils";
import type { ReportAccountLine } from "@/lib/api/reports";

/**
 * A titled block of account lines with a running total, used by the report
 * pages (Laba Rugi / Neraca). Shared so the two report pages keep identical
 * section markup instead of copy-pasting it.
 */
export function ReportSection({
  title,
  total,
  lines,
  emptyText,
  emptyAction,
}: {
  readonly title: string;
  readonly total: number;
  readonly lines: readonly ReportAccountLine[];
  readonly emptyText: string;
  readonly emptyAction?: React.ReactNode;
}) {
  return (
    <>
      <div className="flex items-center justify-between gap-4 border-b border-wood-100 bg-cream-50 px-5 py-3">
        <p className="text-sm font-semibold text-text-primary">{title}</p>
        <p className="num-mono text-sm font-semibold text-text-primary">{formatIDR(total)}</p>
      </div>
      {lines.length === 0 ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-wood-100 px-5 py-4">
          <FileText className="h-4 w-4 shrink-0 text-text-tertiary" aria-hidden="true" />
          <p className="text-sm text-text-tertiary">{emptyText}</p>
          {emptyAction ?? (
            <Link to="/transactions/new" className="text-sm text-wood-600 underline underline-offset-2 hover:text-wood-800">
              Catat transaksi
            </Link>
          )}
        </div>
      ) : (
        <ul className="divide-y divide-wood-100 border-b border-wood-100">
          {lines.map((line) => (
            <li key={line.code} className="flex items-center justify-between gap-4 px-5 py-3">
              <p className="min-w-0 break-words text-sm text-text-secondary">
                <span className="num-mono text-text-tertiary">{line.code}</span> · {line.name}
              </p>
              <p className="num-mono shrink-0 text-sm text-text-primary">{formatIDR(line.amount)}</p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
