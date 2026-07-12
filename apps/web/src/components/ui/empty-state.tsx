import { FileText } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  readonly icon?: React.ReactNode;
  readonly title: string;
  readonly description?: string;
  readonly action?: React.ReactNode;
  readonly className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex min-w-0 flex-col items-center justify-center px-4 py-8 text-center sm:py-10", className)}>
      <div className="ledger-soft-float mb-3 flex h-14 w-14 items-center justify-center rounded-full border border-wood-100 bg-cream-100 sm:mb-4 sm:h-16 sm:w-16">
        {icon || <FileText className="h-8 w-8 text-wood-400" />}
      </div>
      <h3 className="max-w-full break-words text-lg font-semibold text-text-primary">{title}</h3>
      {description && (
        <p className="mt-1 max-w-sm break-words text-sm text-text-secondary leading-relaxed">{description}</p>
      )}
      {action && <div className="mt-3 sm:mt-4">{action}</div>}
    </div>
  );
}
