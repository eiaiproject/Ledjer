import { cn } from "@/lib/utils";

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-cream-200",
        className
      )}
    />
  );
}

function TableRowSkeleton({ cols = 5 }: { cols?: number }) {
  return (
    <tr className="border-b border-wood-50">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <Skeleton className="h-4 w-full" />
        </td>
      ))}
    </tr>
  );
}

export function TransactionListSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-10 w-32 rounded-md" />
      </div>
      <div className="flex gap-3">
        <Skeleton className="h-10 flex-1 rounded-md" />
        <Skeleton className="h-10 w-32 rounded-md" />
      </div>
      <div className="rounded-lg border border-wood-200 bg-cream-50">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-wood-100">
              <th className="px-4 py-3"><Skeleton className="h-4 w-16" /></th>
              <th className="px-4 py-3"><Skeleton className="h-4 w-16" /></th>
              <th className="px-4 py-3"><Skeleton className="h-4 w-16" /></th>
              <th className="px-4 py-3"><Skeleton className="h-4 w-16" /></th>
              <th className="px-4 py-3"><Skeleton className="h-4 w-16" /></th>
              <th className="px-4 py-3"><Skeleton className="h-4 w-16" /></th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 5 }).map((_, i) => (
              <TableRowSkeleton key={i} cols={6} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}