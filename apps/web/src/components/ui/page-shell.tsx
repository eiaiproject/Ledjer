import { type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { PageHeader } from "./page-header";
import { PageToolbar } from "./page-toolbar";
import type { PageHeaderProps } from "./page-header";
import type { PageToolbarProps } from "./page-toolbar";

interface PageShellProps {
  /** Standard header with title, description, and actions */
  readonly header: PageHeaderProps;

  /** Optional toolbar with search and filters */
  readonly toolbar?: PageToolbarProps;

  /** Main page content */
  readonly children: ReactNode;

  /** Additional wrapper class */
  readonly className?: string;
}

/**
 * Standard page shell for all protected routes.
 *
 * Provides consistent:
 * - Max-width content container
 * - Horizontal padding
 * - Vertical spacing
 * - PageHeader + PageToolbar + content composition
 *
 * Usage:
 * ```tsx
 * <PageShell
 *   header={{ title: "Transaksi", description: "..." }}
 *   toolbar={{ searchValue, onSearchChange, filters: [...], children: <Button>... </Button> }}
 * >
 *   <div>main content</div>
 * </PageShell>
 * ```
 */
export function PageShell({ header, toolbar, children, className }: PageShellProps) {
  return (
    <div className={cn("space-y-4", className)}>
      <PageHeader {...header} />
      {toolbar && <PageToolbar {...toolbar} />}
      {children}
    </div>
  );
}
