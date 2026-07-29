import { isValidElement, type ComponentType } from "react";
import { Button } from "./button";
import { FileText } from "reicon-react";
import { cn } from "@/lib/utils";

type IconProp = ComponentType<{ className?: string }> | React.ReactNode;
type ActionProp =
  | { label: string; onClick: () => void }
  | { label: string; onClick: () => void | Promise<void> }
  | React.ReactNode;

interface EmptyStateProps {
  readonly icon?: IconProp;
  readonly title: string;
  readonly description?: string;
  readonly action?: ActionProp;
  readonly className?: string;
}

function renderIcon(icon: IconProp | undefined): React.ReactNode {
  if (!icon) return <FileText className="h-8 w-8 text-wood-500" />;
  // React element — render directly
  if (isValidElement(icon)) return icon;
  // Component type (function, forwardRef, memo, lazy) — render as <Icon />
  if (typeof icon === "function" || (typeof icon === "object" && icon !== null)) {
    const Icon = icon as React.ComponentType<{ className?: string }>;
    return <Icon className="h-8 w-8 text-wood-500" />;
  }
  return icon;
}

function renderAction(action: ActionProp | undefined): React.ReactNode {
  if (!action) return null;
  if (typeof action === "object" && "label" in action && "onClick" in action) {
    return (
      <Button size="sm" onClick={action.onClick}>
        {action.label}
      </Button>
    );
  }
  return action as React.ReactNode;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex min-w-0 flex-col items-center justify-center px-4 py-8 text-center sm:py-10", className)}>
      <div className="ledger-soft-float mb-3 flex h-14 w-14 items-center justify-center rounded-full border border-wood-100 bg-cream-100 sm:mb-4 sm:h-16 sm:w-16">
        {renderIcon(icon)}
      </div>
      <h3 className="max-w-full break-words text-lg font-semibold text-text-primary">{title}</h3>
      {description && (
        <p className="mt-1 max-w-sm break-words text-sm text-text-secondary leading-relaxed">{description}</p>
      )}
      {action && <div className="mt-3 sm:mt-4">{renderAction(action)}</div>}
    </div>
  );
}
