import { cn } from "@/lib/utils";

/**
 * Mini horizontal status stepper: shows the lifecycle of a record
 * (e.g. draft → posted → voided) with the current step highlighted.
 * ponytail: render-only, no interaction. Add clickable steps when
 * navigating between status views is needed.
 */
export function StatusFlow({
  steps,
  current,
  className,
}: {
  readonly steps: readonly { readonly key: string; readonly label: string }[];
  readonly current: string;
  readonly className?: string;
}) {
  const currentIdx = steps.findIndex((s) => s.key === current);
  return (
    <ol className={cn("flex items-center gap-1.5", className)} aria-label="Status">
      {steps.map((step, i) => {
        const done = i < currentIdx;
        const active = i === currentIdx;
        return (
          <li key={step.key} className="flex items-center gap-1.5">
            {i > 0 && <span className="h-px w-3 bg-wood-200" aria-hidden="true" />}
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium",
                active && "bg-wood-500 text-white",
                done && "bg-leaf-100 text-leaf-700",
                !active && !done && "bg-wood-100 text-wood-500",
              )}
            >
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
