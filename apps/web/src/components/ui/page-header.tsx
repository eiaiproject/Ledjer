import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageHeaderAction {
  readonly key: string;
  readonly children: ReactNode;
}

export interface PageHeaderProps {
  readonly title: string;
  readonly description?: string;
  readonly actions?: readonly PageHeaderAction[];
  readonly className?: string;
}

/**
 * Standard page header component.
 *
 * Provides consistent h1, description, and action placement
 * across all protected pages.
 */
export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <div className={cn(
      "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between",
      className
    )}>
      <div className="min-w-0">
        <h1 className="text-2xl font-bold text-text-primary break-words">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-text-secondary break-words">{description}</p>
        )}
      </div>
      {actions && actions.length > 0 && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions.map((action) => (
            <div key={action.key}>{action.children}</div>
          ))}
        </div>
      )}
    </div>
  );
}
