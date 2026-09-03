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
}: {
  readonly title: string;
  readonly total: number;
  readonly lines: readonly ReportAccountLine[];
  readonly emptyText: string;
}) {
  return (
    <>
      <div className="flex items-center justify-between gap-4 border-b border-wood-100 bg-cream-50 px-5 py-3">
        <p className="text-sm font-semibold text-text-primary">{title}</p>
        <p className="num-mono text-sm font-semibold text-text-primary">{formatIDR(total)}</p>
      </div>
      {lines.length === 0 ? (
        <p className="border-b border-wood-100 px-5 py-4 text-sm text-text-tertiary">{emptyText}</p>
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
