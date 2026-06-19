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
    <div className={cn("flex flex-col items-center justify-center py-12 px-4 text-center", className)}>
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-cream-200 mb-4">
        {icon || <FileText className="h-8 w-8 text-wood-400" />}
      </div>
      <h3 className="text-lg font-semibold text-wood-800">{title}</h3>
      {description && (
        <p className="mt-1 text-sm text-wood-500 max-w-sm">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
