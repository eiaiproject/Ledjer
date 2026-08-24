import { type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { PageGuide } from "@/components/ui/page-guide";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface ReportShellProps {
  /** Judul laporan (h1) */
  readonly title: string;
  /** Deskripsi atau periode yang ditampilkan */
  readonly description?: string;
  /** Key untuk HelpTooltip (opsional) */
  readonly helpTopic?: string;
  /** Key untuk PageGuide (opsional) - panduan langkah per halaman */
  readonly guide?: string;
  /** Filter bar content */
  readonly filters?: ReactNode;
  /** Action buttons (export, dll.) */
  readonly actions?: ReactNode;
  /** Status badges shown below description */
  readonly statusBadges?: readonly {
    readonly variant: "success" | "warning" | "error" | "info" | "neutral";
    readonly label: string;
  }[];
  /** Konten utama laporan */
  readonly children: ReactNode;
  /** Additional wrapper class */
  readonly className?: string;
}

/**
 * Standard shell untuk halaman laporan keuangan.
 *
 * Menyediakan layout konsisten untuk:
 * - Judul halaman + bantuan (HelpTooltip)
 * - Deskripsi / periode
 * - Filter bar
 * - Action buttons (ekspor, dll.)
 * - Status badges
 * - Konten utama
 *
 * Catatan: Setiap halaman laporan tetap mengelola permission check-nya sendiri.
 * ReportShell tidak membungkus dengan ReportPermissionGate.
 */
export function ReportShell({
  title,
  description,
  helpTopic,
  guide,
  filters,
  actions,
  statusBadges,
  children,
  className,
}: ReportShellProps) {
  return (
    <div className={cn("space-y-4", className)}>
      {/* Panduan halaman */}
      {guide && <PageGuide guideKey={guide} />}

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-text-primary inline-flex items-center gap-2 break-words">
            {title}
            {helpTopic && <HelpTooltip topic={helpTopic} position="right" />}
          </h1>
          {description && (
            <p className="mt-1 text-sm text-text-secondary break-words" aria-live="polite">
              {description}
            </p>
          )}
          {statusBadges && statusBadges.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {statusBadges.map((badge) => (
                <span
                  key={badge.label}
                  className={cn(
                    "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                    badge.variant === "success" && "bg-leaf-100 text-leaf-700",
                    badge.variant === "warning" && "bg-honey-100 text-honey-700",
                    badge.variant === "error" && "bg-clay-100 text-clay-700",
                    badge.variant === "info" && "bg-sky-100 text-sky-700",
                    badge.variant === "neutral" && "bg-wood-100 text-wood-600",
                  )}
                >
                  {badge.label}
                </span>
              ))}
            </div>
          )}
        </div>
        {actions && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {actions}
          </div>
        )}
      </div>

      {/* Filter bar */}
      {filters && (
        <div className="rounded-xl border border-wood-200 bg-surface-elevated p-4">
          {filters}
        </div>
      )}

      {children}
    </div>
  );
}

/**
 * Error state khusus untuk laporan - menampilkan judul + error.
 * Cocok untuk render path error pada halaman laporan.
 */
export function ReportErrorState({
  title,
  description,
  helpTopic,
  message,
  onRetry,
}: {
  readonly title: string;
  readonly description?: string;
  readonly helpTopic?: string;
  readonly message: string;
  readonly onRetry?: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold text-text-primary inline-flex items-center gap-2">
          {title}
          {helpTopic && <HelpTooltip topic={helpTopic} position="right" />}
        </h1>
        {description && (
          <p className="mt-1 text-sm text-text-secondary">{description}</p>
        )}
      </div>
      <Card>
        <CardContent className="py-6">
          <div className="flex flex-col items-center gap-3 text-center">
            <p className="text-sm text-clay-600">{message}</p>
            {onRetry && (
              <Button type="button" variant="primary" onClick={onRetry}>
                Coba lagi
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
