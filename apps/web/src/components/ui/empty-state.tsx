import { FileText } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex min-w-0 flex-col items-center justify-center px-4 py-12 text-center", className)}>
      <div className="ledger-soft-float mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-wood-100 bg-cream-100">
        {icon || <FileText className="h-8 w-8 text-wood-400" />}
      </div>
      <h3 className="max-w-full break-words text-lg font-semibold text-text-primary">{title}</h3>
      {description && (
        <p className="mt-1 max-w-sm break-words text-sm text-text-secondary">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
